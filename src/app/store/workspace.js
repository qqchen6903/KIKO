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

export async function persist() {
  if (!store.db) return;
  store.saving = true;
  try {
    // Vue reactive Proxy 无法直接过 IPC 克隆，序列化前深度还原为纯数据
    await window.assistant.save(plain(store.db));
    store.lastSaved = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  } catch (e) {
    toast('保存失败：' + (e?.message || e), 'error');
  } finally {
    store.saving = false;
  }
}

export function selectProject(id) {
  store.activeId = id;
  if (store.db) store.db.activeProjectId = id;
  ui.view = 'project';
  persist();
}

export function createProject({ name, goal }) {
  const p = {
    id: crypto.randomUUID(), name, goal: goal || '', status: '进行中',
    createdAt: S.nowIso(), updatedAt: S.nowIso(), lastWorkedAt: S.nowIso(),
    state: { summary: '', completed: [], inProgress: [], blockers: [], nextSteps: [], todos: [], decisions: [], constraints: [] },
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

/* ---------- 列表字段（字符串数组）手动修正 ---------- */
function st() { return current.value?.state; }

export function addListItem(field, text) {
  const s = S.sanitizeStr(text);
  if (!s || !st()) return false;
  if (st()[field].includes(s)) { toast('该条目已存在', 'warn'); return false; }
  st()[field].push(s);
  touchWorked();
  if (field === 'blockers') deriveStatus();
  persist();
  return true;
}
export function updateListItem(field, idx, text) {
  const s = S.sanitizeStr(text);
  if (!s || !st() || st()[field][idx] === undefined) return;
  st()[field][idx] = s;
  touchWorked();
  persist();
}
export function removeListItem(field, idx) {
  if (!st()) return;
  st()[field].splice(idx, 1);
  if (field === 'blockers') deriveStatus();
  persist();
}

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
  persist();
}
export function toggleTodo(idx) {
  const t = st()?.todos[idx];
  if (!t) return;
  t.done = !t.done;
  t.doneAt = t.done ? S.nowIso() : '';
  persist();
}
export function removeTodo(idx) {
  st()?.todos.splice(idx, 1);
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

/* 卡点出现/清空时联动项目状态；用户手动设置的「已完成/已暂停」不被覆盖 */
function deriveStatus() {
  const p = current.value;
  if (!p) return;
  const hasBlocker = (p.state.blockers || []).length > 0;
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
  if (p.status === '进行中' || p.status === '等待处理') p.status = p.state.blockers.length ? '等待处理' : '进行中';
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
