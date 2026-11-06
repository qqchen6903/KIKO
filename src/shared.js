/* 共享纯逻辑模块：主进程(require)、渲染层(<script> 挂到 window.Shared)、node 测试三处复用。
 * 原则：AI 返回内容必须先校验结构再写入；已完成/决策/待办只追加不覆盖；历史只追加。 */
'use strict';

const MAX_ITEMS = 200;      // 每个列表最多保留条目数
const MAX_LEN = 500;        // 每条文本最长字符数
const MAX_LOGS = 500;       // 每个项目最多历史条数
const PRIORITIES = ['高', '普通', '低'];

function nowIso() { return new Date().toISOString(); }

function sanitizeStr(s) { return String(s == null ? '' : s).replace(/\r/g, '').trim().slice(0, MAX_LEN); }

/* 把任意数组规整为字符串数组（对象取 title），去重去空；非数组返回 null 以便调用方区分“缺失/非法” */
function strArray(v) {
  if (!Array.isArray(v)) return null;
  const out = [];
  for (const x of v) {
    const s = typeof x === 'string' ? sanitizeStr(x) : sanitizeStr(x && x.title);
    if (s && !out.includes(s)) out.push(s);
  }
  return out.slice(0, MAX_ITEMS);
}

/* 到期时间归一为 ISO。支持 "YYYY-MM-DD[ HH:mm]"、"HH:mm"（今天此刻之前则顺延到明天）、"明天/今天/后天 HH:mm"；无法识别返回 '' */
function normalizeDue(s) {
  s = sanitizeStr(s).replace(/[：]/g, ':');
  if (!s) return '';
  const m = s.match(/^(今天|明天|后天)\s*(\d{1,2}):(\d{2})?$/);
  if (m) {
    const d = new Date();
    d.setDate(d.getDate() + ({ '今天': 0, '明天': 1, '后天': 2 }[m[1]]));
    d.setHours(+m[2], +(m[3] || 0), 0, 0);
    return d.toISOString();
  }
  const mm = s.match(/^(\d{1,2}):(\d{2})$/);
  if (mm) {
    const d = new Date();
    d.setHours(+mm[1], +mm[2], 0, 0);
    if (d.getTime() < Date.now() - 60e3) d.setDate(d.getDate() + 1);
    return d.toISOString();
  }
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
  const t = Date.parse(iso ? iso[1] + 'T' + iso[2] : s);
  return isNaN(t) ? '' : new Date(t).toISOString();
}

/* 校验并规整 AI 返回结果。返回 {ok, value, errors}；ok=false 时调用方必须拒写，不得落盘 */
function validateAiResult(raw) {
  const errors = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, value: null, errors: ['模型没有返回 JSON 对象，本次结果已丢弃，原数据未改动。'] };
  }
  const arr = (k) => {
    const a = strArray(raw[k]);
    if (a === null) { if (raw[k] !== undefined) errors.push(`字段 ${k} 格式非法，已按空列表处理。`); return []; }
    return a;
  };
  const todosRaw = Array.isArray(raw.todos) ? raw.todos : (raw.todos !== undefined && (errors.push('字段 todos 格式非法，已忽略。'), false));
  const todos = [];
  for (const t of todosRaw || []) {
    const title = sanitizeStr(t && typeof t === 'object' ? t.title : t);
    if (!title) continue;
    const priority = PRIORITIES.includes(t && t.priority) ? t.priority : '普通';
    const todo = { title: title.slice(0, MAX_LEN), due: normalizeDue(t && t.due), priority, done: !!(t && t.done) };
    /* 待办39：每条待办的三属性。键存在才赋值（可置空串表示清除），缺失=不修改 */
    for (const k of ['blocked', 'related', 'next']) if (t && typeof t === 'object' && t[k] !== undefined) todo[k] = sanitizeStr(t[k]);
    todos.push(todo);
  }
  const value = {
    summary: sanitizeStr(raw.summary),
    decisions: arr('decisions'),
    conflicts: arr('conflicts'),
    todos: todos.slice(0, MAX_ITEMS),
  };
  const usable = value.summary || value.decisions.length || value.conflicts.length || value.todos.length;
  if (!usable) return { ok: false, value: null, errors: errors.concat(['模型返回内容为空或全部无法解析，本次结果已丢弃，原数据未改动。']) };
  return { ok: true, value, errors };
}

/* 决策列表统一为 {at,text} 对象 */
function normDecisions(v) {
  const out = [];
  if (!Array.isArray(v)) return out;
  for (const d of v) {
    if (typeof d === 'string') { const t = sanitizeStr(d); if (t) out.push({ at: '', text: t }); }
    else if (d && typeof d === 'object') { const t = sanitizeStr(d.text); if (t) out.push({ at: sanitizeStr(d.at), text: t }); }
  }
  return out.slice(0, MAX_ITEMS);
}

function normTodos(v) {
  const out = [];
  if (!Array.isArray(v)) return out;
  for (const t of v) {
    if (!t || typeof t !== 'object') continue;
    const title = sanitizeStr(t.title);
    if (!title) continue;
    const todo = {
      title, due: normalizeDue(t.due), priority: PRIORITIES.includes(t.priority) ? t.priority : '普通',
      done: !!t.done, createdAt: sanitizeStr(t.createdAt), remindedAt: sanitizeStr(t.remindedAt), doneAt: sanitizeStr(t.doneAt),
    };
    for (const k of ['blocked', 'related', 'next']) { const v = sanitizeStr(t[k]); if (v) todo[k] = v; }
    out.push(todo);
  }
  return out.slice(0, MAX_ITEMS);
}

function tkey(s) { return String(s || '').toLowerCase(); }

/* 待办39 合并策略：决策“只追加”；待办按标题匹配，done 只进不退，
 * blocked/related/next 三属性由 AI 管理生命周期（AI 明确给出该键才更新，空串=清除）。
 * 旧格式四个列表（completed/inProgress/blockers/nextSteps）不再写入新内容，但原样保留不清除——
 * 任何旧条目都不会被静默删除；完整旧状态快照也在本次更新的 logs.snapshotBefore 里，可撤销。 */
function mergeState(oldState, ai) {
  const os = oldState || {};
  const oldDecisions = normDecisions(os.decisions);
  const known = new Set(oldDecisions.map(d => d.text));
  for (const t of ai.decisions || []) if (!known.has(t)) oldDecisions.push({ at: nowIso(), text: t });
  const oldTodos = normTodos(os.todos);
  const byTitle = new Map(oldTodos.map(t => [tkey(t.title), t]));
  for (const t of ai.todos || []) {
    const ex = byTitle.get(tkey(t.title));
    if (ex) {
      ex.done = ex.done || t.done;
      ex.due = t.due || ex.due;
      ex.priority = t.priority || ex.priority;
      for (const k of ['blocked', 'related', 'next']) {
        if (t[k] === undefined) continue;
        const v = sanitizeStr(t[k]);
        if (v) ex[k] = v; else delete ex[k];
      }
      if (ex.done) ex.doneAt = ex.doneAt || nowIso();
    } else {
      const nt = normTodos([t])[0] || { ...t };
      nt.createdAt = nowIso();
      byTitle.set(tkey(nt.title), nt); oldTodos.push(nt);
    }
  }
  const newState = {
    summary: ai.summary || os.summary || '',
    todos: oldTodos.slice(-MAX_ITEMS),
    decisions: oldDecisions.slice(-MAX_ITEMS),
    constraints: Array.isArray(os.constraints) ? os.constraints : [],
  };
  for (const k of ['completed', 'inProgress', 'blockers', 'nextSteps'])
    if (Array.isArray(os[k]) && os[k].length) newState[k] = os[k];
  return { newState, addedCompleted: [] };
}

/* 供预览弹窗展示的旧/新差异（待办39：属性级 diff） */
function diffState(oldState, newState) {
  const o = oldState || {}, n = newState || {};
  const od = normDecisions(o.decisions), nd = normDecisions(n.decisions);
  const odt = new Set(od.map(d => d.text));
  const otd = new Map(normTodos(o.todos).map(t => [tkey(t.title), t])), ntd = normTodos(n.todos);
  const todosAdded = ntd.filter(t => !otd.has(tkey(t.title))).map(t => t.title);
  const todosDone = ntd.filter(t => t.done && otd.get(tkey(t.title)) && !otd.get(tkey(t.title)).done).map(t => t.title);
  const attrsChanged = [];
  for (const nt of ntd) {
    const ot = otd.get(tkey(nt.title));
    if (!ot) continue;
    for (const k of ['blocked', 'related', 'next']) {
      const a = ot[k] || '', b = nt[k] || '';
      if (a !== b) attrsChanged.push({ title: nt.title, field: k, from: a, to: b });
    }
  }
  return {
    summaryChanged: (n.summary || '') !== (o.summary || ''),
    decisionsAdded: nd.filter(d => !odt.has(d.text)).map(d => d.text),
    todosAdded, todosDone, attrsChanged,
  };
}

const DEFAULTS = { projects: [], activeProjectId: null, settings: { baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' }, version: 2 };

/* 迁移并规整整份 workspace 数据（就地尽量复用原对象），任何缺失字段补默认值 */
function migrate(db) {
  if (!db || typeof db !== 'object') return structuredClone(DEFAULTS);
  const out = { ...structuredClone(DEFAULTS), ...db };
  out.settings = { ...structuredClone(DEFAULTS.settings), ...(db.settings && typeof db.settings === 'object' ? db.settings : {}) };
  out.projects = Array.isArray(db.projects) ? db.projects : [];
  for (const p of out.projects) {
    if (!p || typeof p !== 'object') continue;
    p.id = sanitizeStr(p.id) || (globalThis.crypto && globalThis.crypto.randomUUID ? globalThis.crypto.randomUUID() : 'p' + Date.now() + Math.random().toString(36).slice(2));
    p.name = sanitizeStr(p.name) || '未命名项目';
    p.state = p.state && typeof p.state === 'object' ? p.state : {};
    const st = p.state;
    /* 待办39：旧格式四个列表不再作为主体。空数组直接清掉减少存档噪音；
       有历史内容的保留（不静默删数据），仅不再被 UI/AI 读写 */
    for (const k of ['completed', 'inProgress', 'blockers', 'nextSteps']) {
      const a = strArray(st[k]);
      if (a && a.length) st[k] = a; else delete st[k];
    }
    st.todos = normTodos(st.todos);
    st.decisions = normDecisions(st.decisions);
    st.constraints = Array.isArray(st.constraints) ? st.constraints.map(sanitizeStr).filter(Boolean) : [];
    st.summary = sanitizeStr(st.summary);
    p.logs = Array.isArray(p.logs) ? p.logs.filter(l => l && typeof l === 'object').slice(-MAX_LOGS) : [];
    p.goal = sanitizeStr(p.goal);
    p.status = sanitizeStr(p.status) || '进行中';
  }
  out.projects = out.projects.filter(p => p && typeof p === 'object');
  out.activeProjectId = out.projects.some(x => x.id === out.activeProjectId) ? out.activeProjectId : (out.projects[0] && out.projects[0].id) || null;
  out.version = 2;
  return out;
}

/* 备份/恢复前的结构校验（参照文档第五节数据设计原则） */
function validateWorkspaceFile(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, message: '文件不是有效的工作助手数据（应为 JSON 对象）。' };
  if (!Array.isArray(obj.projects)) return { ok: false, message: '备份文件缺少 projects 列表。' };
  if (obj.projects.some(p => !p || typeof p !== 'object' || !sanitizeStr(p.name))) return { ok: false, message: '备份文件中存在缺少项目名称的损坏记录。' };
  const db = migrate(obj);
  return { ok: true, db, projectCount: db.projects.length, logCount: db.projects.reduce((s, p) => s + p.logs.length, 0) };
}

/* 展示用时间格式化：ISO 或旧版中文串都尽量转成 “MM-DD HH:mm” */
function fmtShort(s) {
  if (!s) return '';
  const t = Date.parse(s);
  if (isNaN(t)) { const m = String(s).match(/(\d{1,2})[-/](\d{1,2})\s+(\d{2}:\d{2})/); return m ? `${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')} ${m[3]}` : String(s).slice(5, 16); }
  const d = new Date(t);
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function fmtLong(s) {
  if (!s) return '';
  const t = Date.parse(s);
  if (isNaN(t)) return String(s);
  return new Date(t).toLocaleString('zh-CN', { hour12: false });
}
function daysSince(s) {
  const t = Date.parse(s || '');
  if (isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86400e3);
}
function dueLabel(iso) {
  const t = Date.parse(iso || '');
  if (isNaN(t)) return '';
  const d = new Date(t), today = new Date();
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (sameDay(d, today)) return `今天 ${hm}`;
  const tmr = new Date(today); tmr.setDate(tmr.getDate() + 1);
  if (sameDay(d, tmr)) return `明天 ${hm}`;
  return `${d.getMonth() + 1}-${d.getDate()} ${hm}`;
}

/* ---------- 桌宠吸边隐藏几何 ----------
 * b: 当前窗体 {x,y,w,h}；wa: 显示器 workArea {x,y,width,height}；
 * 贴边判定阈值 threshold，隐藏时露出 sliver 像素。
 * 返回 {edge:null|left|right|top|bottom, docked:{x,y}, hidden:{x,y}} */
function edgeSnap(b, wa, threshold = 26, sliver = 24) {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));
  let edge = null;
  if (b.x - wa.x <= threshold) edge = 'left';
  else if (wa.x + wa.width - (b.x + b.w) <= threshold) edge = 'right';
  else if (b.y - wa.y <= threshold) edge = 'top';
  else if (wa.y + wa.height - (b.y + b.h) <= threshold) edge = 'bottom';
  const docked = { x: clamp(b.x, wa.x, wa.x + wa.width - b.w), y: clamp(b.y, wa.y, wa.y + wa.height - b.h) };
  if (!edge) return { edge: null, docked, hidden: { ...docked } };
  const hidden = { ...docked };
  if (edge === 'left') hidden.x = wa.x - b.w + sliver;
  if (edge === 'right') hidden.x = wa.x + wa.width - sliver;
  if (edge === 'top') hidden.y = wa.y - b.h + sliver;
  if (edge === 'bottom') hidden.y = wa.y + wa.height - sliver;
  return { edge, docked, hidden };
}

/* ---------- 模型服务商协议：OpenAI-compatible 与 Anthropic-compatible ---------- */
const PROTOCOLS = ['openai', 'anthropic'];

/* 构建一次 chat 请求（url / headers / body 对象，不含 Content-Length，由调用层补）。
 * messages: [{role,content}]，含 system 时按协议拆分。jsonMode 仅 OpenAI 用 response_format。 */
function buildChatRequest({ type, baseUrl, model, key, messages, temperature, maxTokens, jsonMode }) {
  type = PROTOCOLS.includes(type) ? type : 'openai';
  const base = String(baseUrl || '').replace(/\/+$/, '');
  const msgs = Array.isArray(messages) ? messages : [];
  const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
  let url, body;
  if (type === 'anthropic') {
    url = base + '/v1/messages';
    headers['x-api-key'] = key || '';
    headers['anthropic-version'] = '2023-06-01';
    const system = msgs.filter(m => m.role === 'system').map(m => m.content).join('\n');
    body = { model, messages: msgs.filter(m => m.role !== 'system'), max_tokens: maxTokens || 2048 };
    if (system) body.system = system;
    if (temperature !== undefined) body.temperature = temperature;
  } else {
    url = base + '/chat/completions';
    headers['Authorization'] = 'Bearer ' + (key || '');
    body = { model, messages: msgs, max_tokens: maxTokens };
    if (temperature !== undefined) body.temperature = temperature;
    if (jsonMode) body.response_format = { type: 'json_object' };
    if (maxTokens === undefined) delete body.max_tokens;
  }
  return { type, url, headers, body };
}

/* 从两种协议的响应体中取出模型文本 */
function parseChatContent(type, parsed) {
  if (!parsed) return '';
  if (PROTOCOLS.includes(type) && type === 'anthropic') {
    const parts = Array.isArray(parsed.content) ? parsed.content : [];
    return parts.map(b => (b && (b.text || '')).toString()).join('');
  }
  return (parsed.choices && parsed.choices[0] && parsed.choices[0].message && parsed.choices[0].message.content) || '';
}

const Shared = {
  MAX_ITEMS, MAX_LEN, MAX_LOGS, PRIORITIES, PROTOCOLS,
  nowIso, sanitizeStr, strArray, normalizeDue, validateAiResult, normDecisions, normTodos,
  mergeState, diffState, migrate, validateWorkspaceFile, fmtShort, fmtLong, daysSince, dueLabel, DEFAULTS,
  buildChatRequest, parseChatContent, edgeSnap,
};

if (typeof module !== 'undefined' && module.exports) module.exports = Shared;
if (typeof globalThis !== 'undefined') globalThis.Shared = Shared;
