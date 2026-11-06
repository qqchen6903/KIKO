import { reactive, computed } from 'vue';
import S from '../shared-bridge';
import { ui, toast } from './ui';

/* 工作区数据仓库：唯一持有 workspace 数据与所有变更操作的入口。
 * 约定：所有变更 = 改 store.db → persist()（落盘由主进程 migrate 再校验一遍）。 */
export const store = reactive({
  db: null,
  activeId: null,
  hasKey: false,
  encOk: true,
  meta: { autostart: false, defaultShortcut: 'CommandOrControl+Shift+Space', notificationSupported: true },
  gpuSoftware: false,
  saving: false,
  lastSaved: '',
  search: '',
  loaded: false,
});

export const current = computed(() => store.db?.projects.find(p => p.id === store.activeId) ?? null);

export const visibleProjects = computed(() => {
  const q = store.search.trim().toLowerCase();
  if (!q) return store.db?.projects ?? [];
  return (store.db?.projects ?? []).filter(p => (p.name + ' ' + (p.goal || '')).toLowerCase().includes(q));
});

export async function load() {
  const r = await window.assistant.load();
  store.db = r.data;
  store.hasKey = r.hasApiKey;
  store.encOk = r.encryptionAvailable;
  store.meta = { autostart: r.autostart, defaultShortcut: r.defaultShortcut, notificationSupported: r.notificationSupported };
  store.gpuSoftware = !!r.gpuSoftware;
  store.activeId = store.db.activeProjectId;
  store.loaded = true;
}

/* 待办45②：防抖合并落盘——距上次保存>500ms 时立即写（无数据丢失窗口）；
 * 500ms 内的连续操作合并为一次写；退出前 __kikoFlush() 强制冲刷并等主进程确认。 */
let lastSaveAt = 0;
let saveTimer = null;
let waiters = [];
async function doSaveNow() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  store.saving = true;
  try {
    await window.assistant.save(plain(store.db));
    store.lastSaved = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  } catch (e) {
    toast('保存失败：' + (e?.message || e), 'error');
  } finally {
    store.saving = false;
    lastSaveAt = Date.now();
    const ws = waiters; waiters = [];
    for (const r of ws) r();
  }
}
export function persist(immediate = false) {
  if (!store.db) return Promise.resolve();
  if (immediate || Date.now() - lastSaveAt > 500) return doSaveNow();
  return new Promise(res => { waiters.push(res); clearTimeout(saveTimer); saveTimer = setTimeout(doSaveNow, 500); });
}
window.__kikoFlush = () => persist(true);

export function selectProject(id) {
  store.activeId = id;
  if (store.db) store.db.activeProjectId = id;
  ui.view = 'project';
  /* 待办45②：切换项目只更新主进程 index.json，不再全库深克隆+重写 */
  if (window.assistant.setActive) window.assistant.setActive(id);
}

export function createProject({ name, goal }) {
  const p = {
    id: crypto.randomUUID(), name, goal: goal || '', status: '进行中',
    createdAt: S.nowIso(), updatedAt: S.nowIso(), lastWorkedAt: S.nowIso(),
    state: { summary: '', todos: [], pending: [], decisions: [], constraints: [] },
    logs: [],
  };
  store.db.projects.unshift(p);
  selectProject(p.id);
  return p;
}

export function updateProject(id, patch) {
  const p = store.db.projects.find(x => x.id === id);
  if (!p) return;
  Object.assign(p, patch);
  p.updatedAt = S.nowIso();
  persist();
}

export function deleteProject(id) {
  store.db.projects = store.db.projects.filter(p => p.id !== id);
  if (store.activeId === id) selectProject(store.db.projects[0]?.id ?? null);
  else persist();
}

/* ---------- 列表访问 ----------
 * 待办39：旧四个状态列表的手动维护 API（addListItem 等）随 StatusCard 一并移除 */
function st() { return current.value?.state; }

/* ---------- 关键决策（带时间，只追加；删除仅限用户手动操作） ---------- */
export function addDecision(text) {
  const s = S.sanitizeStr(text);
  if (!s || !st()) return false;
  if (st().decisions.some(d => d.text === s)) { toast('该决策已记录过', 'warn'); return false; }
  st().decisions.push({ at: S.nowIso(), text: s });
  touchWorked();
  persist();
  return true;
}
export function removeDecision(idx) {
  if (!st()) return;
  st().decisions.splice(idx, 1);
  persist();
}

/* ---------- 待办 ---------- */
export function addTodo({ title, dueRaw = '', priority = '普通' }) {
  const t = S.sanitizeStr(title);
  if (!t || !st()) return false;
  st().todos.push({ title: t, due: S.normalizeDue(dueRaw), priority: S.PRIORITIES.includes(priority) ? priority : '普通', done: false, createdAt: S.nowIso(), remindedAt: '' });
  touchWorked();
  persist();
  return true;
}
export function updateTodo(idx, patch) {
  const t = st()?.todos[idx];
  if (!t) return;
  if (patch.title !== undefined) { const s = S.sanitizeStr(patch.title); if (s) t.title = s; }
  if (patch.dueRaw !== undefined) { t.due = S.normalizeDue(patch.dueRaw); t.remindedAt = ''; }
  if (patch.priority !== undefined && S.PRIORITIES.includes(patch.priority)) t.priority = patch.priority;
  /* 待办39：三属性编辑，空串=清除 */
  for (const k of ['blocked', 'related', 'next']) {
    if (patch[k] === undefined) continue;
    const s = S.sanitizeStr(patch[k]);
    if (s) t[k] = s; else delete t[k];
  }
  deriveStatus();
  persist();
}
/* ---------- 待办50 · 续点标记 ---------- */
const PAUSE_STATES = ['me', 'waiting', 'stuck', 'defer'];
function _markPause(p, idx, patch) {
  const t = p?.state?.todos?.[idx];
  if (!t) return false;
  const s = PAUSE_STATES.includes(patch.state) ? patch.state : '';
  if (!s) {
    t.pauseState = ''; delete t.waitingFor; delete t.pauseFollow; delete t.pauseAt; delete t.pauseNote; delete t.pauseRemindedAt;
  } else {
    t.pauseState = s;
    t.pauseAt = S.nowIso();
    t.pauseRemindedAt = '';
    if (patch.waitingFor !== undefined) t.waitingFor = S.sanitizeStr(patch.waitingFor);
    if (s === 'waiting' && patch.followRaw !== undefined) t.pauseFollow = S.normalizeDue(patch.followRaw);
    if (patch.note !== undefined) t.pauseNote = S.sanitizeStr(patch.note);
  }
  p.updatedAt = S.nowIso();
  persist();
  return true;
}
export function markPause(idx, patch) { return _markPause(current.value, idx, patch); }
export function markPauseIn(pid, idx, patch) { return _markPause(store.db?.projects.find(x => x.id === pid), idx, patch); }

export function toggleTodo(idx) {
  const t = st()?.todos[idx];
  if (!t) return;
  t.done = !t.done;
  t.doneAt = t.done ? S.nowIso() : '';
  deriveStatus();
  persist();
}
export function removeTodo(idx) {
  st()?.todos.splice(idx, 1);
  deriveStatus();
  persist();
}

/* ---------- 跨项目待办操作（待办总览页用） ---------- */
export function toggleTodoIn(pid, idx) {
  const p = store.db.projects.find(x => x.id === pid);
  const t = p?.state?.todos?.[idx];
  if (!t) return;
  t.done = !t.done;
  t.doneAt = t.done ? S.nowIso() : '';
  persist();
}
export function removeTodoIn(pid, idx) {
  const p = store.db.projects.find(x => x.id === pid);
  if (!p) return;
  p.state.todos.splice(idx, 1);
  persist();
}
/* 待办49④：总览页就地编辑——跨项目更新待办（到期/优先级/三属性），同步后联动该项目状态 */
export function updateTodoIn(pid, idx, patch) {
  const p = store.db.projects.find(x => x.id === pid);
  const t = p?.state?.todos?.[idx];
  if (!t) return false;
  if (patch.title !== undefined) { const s = S.sanitizeStr(patch.title); if (s) t.title = s; }
  if (patch.dueRaw !== undefined) { t.due = S.normalizeDue(patch.dueRaw); t.remindedAt = ''; }
  if (patch.priority !== undefined && S.PRIORITIES.includes(patch.priority)) t.priority = patch.priority;
  for (const k of ['blocked', 'related', 'next']) {
    if (patch[k] === undefined) continue;
    const s = S.sanitizeStr(patch[k]);
    if (s) t[k] = s; else delete t[k];
  }
  if ((p.status === '进行中' || p.status === '等待处理')) p.status = hasBlockedTodo(p) ? '等待处理' : '进行中';
  p.updatedAt = S.nowIso();
  persist();
  return true;
}
export function addTodoIn(pid, { title, dueRaw = '', priority = '普通' }) {
  const p = store.db.projects.find(x => x.id === pid);
  const t = S.sanitizeStr(title);
  if (!p || !t) return false;
  p.state.todos.push({ title: t, due: S.normalizeDue(dueRaw), priority: S.PRIORITIES.includes(priority) ? priority : '普通', done: false, createdAt: S.nowIso(), remindedAt: '', doneAt: '' });
  p.updatedAt = S.nowIso();
  p.lastWorkedAt = S.nowIso();
  persist();
  return true;
}

function touchWorked() {
  const p = current.value;
  if (!p) return;
  p.updatedAt = S.nowIso();
  p.lastWorkedAt = S.nowIso();
}

/* ---------- 待定池（待办44） ---------- */
export function addPending({ text, waiting = '', followUpRaw = '', source = '' }) {
  const s = S.sanitizeStr(text);
  if (!s || !st()) return false;
  if (st().pending.some(x => x.text === s)) { toast('待定池里已有相同内容', 'warn'); return false; }
  st().pending.push({ text: s, waiting: S.sanitizeStr(waiting), followUp: S.normalizeDue(followUpRaw), source: S.sanitizeStr(source), state: 'open', createdAt: S.nowIso(), remindedAt: '' });
  touchWorked();
  persist();
  return true;
}
export function updatePending(idx, patch) {
  const x = st()?.pending?.[idx];
  if (!x) return;
  if (patch.text !== undefined) { const s = S.sanitizeStr(patch.text); if (s) x.text = s; }
  if (patch.waiting !== undefined) x.waiting = S.sanitizeStr(patch.waiting);
  if (patch.source !== undefined) x.source = S.sanitizeStr(patch.source);
  if (patch.followUpRaw !== undefined) { const f = S.normalizeDue(patch.followUpRaw); if (f !== x.followUp) { x.followUp = f; x.remindedAt = ''; } }
  persist();
}
export function removePending(idx) { st()?.pending?.splice(idx, 1); persist(); }
export function togglePendingDiscard(idx) {
  const x = st()?.pending?.[idx];
  if (!x) return;
  x.state = x.state === 'discarded' ? 'open' : 'discarded';
  persist();
}
/* 转正：弹一次编辑补截止日期和优先级 → 转为正式待办并从池中移除，历史时间线留系统痕迹 */
export function promotePending(idx, { dueRaw = '', priority = '普通' }) {
  const p = current.value;
  const x = p?.state?.pending?.[idx];
  if (!x) return false;
  p.state.pending.splice(idx, 1);
  const todo = { title: x.text, due: S.normalizeDue(dueRaw), priority: S.PRIORITIES.includes(priority) ? priority : '普通', done: false, createdAt: S.nowIso(), remindedAt: '', doneAt: '' };
  if (x.waiting) todo.related = `曾在等：${x.waiting}`;
  p.state.todos.push(todo);
  p.logs.push({ at: S.nowIso(), system: true, message: `待定转正：「${x.text}」转为正式待办${x.followUp ? `（原跟进 ${S.fmtShort(x.followUp)}）` : ''}` });
  touchWorked();
  persist();
  return true;
}

/* 待办39：有阻塞点的未完成待办出现/清空时联动项目状态；用户手动设置的「已完成/已暂停」不被覆盖 */
export function hasBlockedTodo(p) {
  return (p?.state?.todos || []).some(t => !t.done && t.blocked);
}
function deriveStatus() {
  const p = current.value;
  if (!p) return;
  const hasBlocker = hasBlockedTodo(p);
  if (hasBlocker && p.status === '进行中') p.status = '等待处理';
  else if (!hasBlocker && p.status === '等待处理') p.status = '进行中';
}

/* Vue reactive Proxy 对 structuredClone / V8 序列化都是非法载荷，跨进程与存快照前必须深度转纯数据 */
export function plain(x) { return JSON.parse(JSON.stringify(x)); }

/* ---------- AI 更新：先取回建议 → 预览 → 确认后应用 ---------- */
export async function requestAiUpdate(message) {
  const p = current.value;
  if (!p) return { ok: false, message: '请先选择项目。' };
  const r = await window.assistant.updateWithAI({
    project: plain({ id: p.id, name: p.name, goal: p.goal, state: p.state, logs: p.logs }),
    message,
  });
  if (!r.ok) return r;
  const merged = S.mergeState(p.state, r.value);
  const diff = S.diffState(p.state, merged.newState);
  return { ok: true, ai: r.value, errors: r.errors, merged: merged.newState, diff };
}

export async function applyAiUpdate(aiValue, message, coerceErrors = []) {
  const p = current.value;
  if (!p) return;
  const merged = S.mergeState(p.state, aiValue);
  p.logs.push({
    at: S.nowIso(), message,
    aiSummary: aiValue.summary || '',
    conflicts: aiValue.conflicts || [],
    coerceErrors,
    snapshotBefore: plain(p.state),
    applied: plain(merged.newState),
  });
  if (p.logs.length > S.MAX_LOGS) p.logs.splice(0, p.logs.length - S.MAX_LOGS);
  p.state = merged.newState;
  touchWorked();
  if (p.status === '进行中' || p.status === '等待处理') p.status = hasBlockedTodo(p) ? '等待处理' : '进行中';
  await persist();
}

export async function undoLastUpdate() {
  const p = current.value;
  if (!p) return;
  const idx = p.logs.map(l => !l.system && !l.reverted).lastIndexOf(true);
  if (idx < 0) { toast('没有可撤销的 AI 更新', 'warn'); return; }
  const log = p.logs[idx];
  p.state = plain(log.snapshotBefore);
  log.reverted = true;
  p.logs.push({ at: S.nowIso(), system: true, message: `已撤销 ${S.fmtLong(log.at)} 那次更新，恢复到之前的记录` });
  touchWorked();
  await persist();
  toast('已撤销上次 AI 更新', 'success');
}

/* ---------- 备份 / 恢复 / 系统能力 ---------- */
export async function exportBackup() {
  const r = await window.assistant.exportData();
  if (r.cancelled) return;
  if (r.ok) {
    store.db.settings.lastExportedAt = S.nowIso();
    await persist();
    toast(`已导出 ${r.projectCount} 个项目（不含 API Key）`, 'success');
  } else if (r.message) toast(r.message, 'error');
}

export async function restoreBackup() {
  const r = await window.assistant.restoreData();
  if (r.cancelled) return;
  if (r.ok) {
    await load();
    toast(`已恢复 ${r.projectCount} 个项目、${r.logCount} 条历史（恢复前数据已自动留档）`, 'success');
  } else {
    toast(r.message || '恢复失败，当前数据未改动', 'error');
  }
}

export async function saveSettings(payload) {
  const r = await window.assistant.saveSettings(payload);
  if (payload.settings) Object.assign(store.db.settings, payload.settings);
  if (typeof payload.apiKey === 'string' && payload.apiKey.trim()) store.hasKey = true;
  if (typeof r.shortcutResult === 'string') toast(`快捷键未生效：${r.shortcutResult}`, 'warn');
  else if (r.shortcutResult === false) toast('快捷键未生效，请检查格式', 'warn');
  store.encOk = r.encryptionAvailable;
  return r;
}

export const testProvider = payload => window.assistant.testProvider(payload);
export const openDataDir = () => window.assistant.openDataDir();

/* ---------- 横幅依据 ---------- */
export const resumeInfo = computed(() => {
  const p = current.value;
  if (!p) return null;
  const last = p.lastWorkedAt || p.updatedAt || p.createdAt;
  const days = S.daysSince(last);
  if (days === null || days < 2) return null;
  const lastLog = [...p.logs].reverse().find(l => !l.system);
  return { days, lastAt: last, message: lastLog?.message || '' };
});
