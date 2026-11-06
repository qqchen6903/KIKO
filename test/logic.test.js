'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const S = require('../src/shared.js');

test('validateAiResult：非对象/数组一律拒绝', () => {
  for (const bad of [null, undefined, 'text', 42, []]) {
    const r = S.validateAiResult(bad);
    assert.strictEqual(r.ok, false);
  }
});

test('validateAiResult：非法字段类型不写入，全空则拒绝', () => {
  const r = S.validateAiResult({ summary: '', completed: 'not-array', blockers: { 0: 'x' } });
  assert.strictEqual(r.ok, false, '无任何有效内容必须拒绝');
  const r2 = S.validateAiResult({ summary: 'ok', completed: 'not-array' });
  assert.strictEqual(r2.ok, true);
  assert.deepStrictEqual(r2.value.completed, []);
  assert.ok(r2.errors.some(e => e.includes('completed')));
});

test('validateAiResult：正常内容规整、去重、截断、todos 校验', () => {
  const long = 'x'.repeat(600);
  const r = S.validateAiResult({
    summary: ' 进展顺利 ',
    completed: ['A', 'A', ' B ', long],
    todos: [{ title: '联调鉴权', due: '明天 14:00', priority: '紧急', done: 'yes' }, { title: '' }, '无主待办', { title: '旧任务', due: '2026-11-10 09:30' }],
    decisions: ['确认使用 Electron'],
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.value.summary, '进展顺利');
  assert.strictEqual(r.value.completed.length, 3);
  assert.strictEqual(r.value.completed[2].length, S.MAX_LEN);
  assert.strictEqual(r.value.todos.length, 3, '对象待办2条有效 + 1条纯字符串按标题收录');
  assert.strictEqual(r.value.todos[0].priority, '普通');
  assert.strictEqual(r.value.todos[0].done, true);
  assert.match(r.value.todos[0].due, /^2\d{3}-/);
  assert.strictEqual(r.value.todos[1].title, '无主待办');
  assert.strictEqual(r.value.todos[2].title, '旧任务');
});

test('normalizeDue：多种格式归一，垃圾输入返回空', () => {
  assert.strictEqual(S.normalizeDue(''), '');
  assert.strictEqual(S.normalizeDue('随便一句话'), '');
  assert.match(S.normalizeDue('2026-11-10 09:30'), /^2026-11-10/);
  assert.match(S.normalizeDue('2026-11-10T09:30'), /^2026-11-10/);
  assert.match(S.normalizeDue('明天 18:00'), /^20/);
  assert.strictEqual(S.daysSince(S.normalizeDue('2020-01-01')), Math.floor((Date.now() - Date.parse('2020-01-01')) / 86400e3));
});

test('mergeState：已完成/决策/待办只追加，不因 AI 省略而丢失', () => {
  const old = {
    summary: '旧摘要', completed: ['旧完成项'], inProgress: ['在做'], blockers: ['卡住'], nextSteps: ['下一步'],
    todos: [{ title: '写周报', due: '', priority: '普通', done: false, createdAt: '', remindedAt: '' }],
    decisions: [{ at: '', text: '旧决策' }], constraints: [],
  };
  const ai = S.validateAiResult({ summary: '新摘要', completed: ['新完成项'], inProgress: [], blockers: [], nextSteps: [], todos: [{ title: '写周报', due: '明天 10:00', priority: '高', done: false }], decisions: ['新决策'], conflicts: [] }).value;
  const { newState } = S.mergeState(old, ai);
  assert.ok(newState.completed.includes('旧完成项'), '旧完成项必须保留');
  assert.ok(newState.completed.includes('新完成项'));
  assert.ok(newState.decisions.some(d => d.text === '旧决策'), '旧决策必须保留');
  assert.ok(newState.decisions.some(d => d.text === '新决策'));
  assert.strictEqual(newState.todos.length, 1, '同名待办合并为一条');
  assert.strictEqual(newState.todos[0].priority, '高');
  assert.ok(newState.todos[0].due, 'AI 补充的到期时间生效');
  assert.strictEqual(newState.summary, '新摘要');
});

test('mergeState：待办 done 状态不因 AI 未回传而回退', () => {
  const old = { todos: [{ title: '已完成任务', done: true, due: '', priority: '普通', createdAt: '', remindedAt: 'x' }], completed: [], decisions: [] };
  const { newState } = S.mergeState(old, S.validateAiResult({ summary: 's' }).value);
  assert.strictEqual(newState.todos[0].done, true);
  assert.strictEqual(newState.todos[0].remindedAt, 'x');
});

test('diffState：正确计算新增与移除', () => {
  const d = S.diffState(
    { completed: ['a', 'b'], blockers: ['旧卡点'], decisions: [{ text: 'd1' }], todos: [{ title: 't', done: false }], inProgress: [], nextSteps: [] },
    { completed: ['a', 'b', 'c'], blockers: [], decisions: [{ text: 'd1' }, { text: 'd2' }], todos: [{ title: 't', done: true }], inProgress: [], nextSteps: [] }
  );
  assert.deepStrictEqual(d.completed.added, ['c']);
  assert.deepStrictEqual(d.blockers.removed, ['旧卡点']);
  assert.deepStrictEqual(d.decisionsAdded, ['d2']);
  assert.deepStrictEqual(d.todosDone, ['t']);
});

test('migrate：v1 旧数据补齐字段，字符串决策转对象，activeProjectId 兜底', () => {
  const v1 = {
    projects: [{ id: 'p1', name: '项目一', state: { summary: 's', completed: ['x'], todos: [{ title: 't' }], decisions: ['字符串决策'] }, logs: [{ at: '2026/11/1 10:00:00', message: '旧记录' }] }],
    activeProjectId: 'p1', settings: { baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' }, version: 1,
  };
  const db = S.migrate(v1);
  const p = db.projects[0];
  assert.strictEqual(db.version, 2);
  assert.deepStrictEqual(p.state.inProgress, []);
  assert.deepStrictEqual(p.state.constraints, []);
  assert.strictEqual(p.state.decisions[0].text, '字符串决策');
  assert.strictEqual(p.state.todos[0].priority, '普通');
  assert.strictEqual(p.logs.length, 1);
  const db2 = S.migrate({ projects: [{ id: 'a', name: 'n', state: {}, logs: [] }], activeProjectId: 'ghost' });
  assert.strictEqual(db2.activeProjectId, 'a', '失效的 activeProjectId 回落');
});

test('validateWorkspaceFile：拒绝损坏备份，接受合法备份', () => {
  assert.strictEqual(S.validateWorkspaceFile('str').ok, false);
  assert.strictEqual(S.validateWorkspaceFile({}).ok, false);
  assert.strictEqual(S.validateWorkspaceFile({ projects: [{ id: '1' }] }).ok, false, '缺名称视为损坏');
  const ok = S.validateWorkspaceFile({ version: 2, projects: [{ id: '1', name: '甲', state: {}, logs: [] }], settings: {}, activeProjectId: '1' });
  assert.strictEqual(ok.ok, true);
  assert.strictEqual(ok.projectCount, 1);
});

test('buildChatRequest：OpenAI 协议', () => {
  const r = S.buildChatRequest({ type: 'openai', baseUrl: 'https://api.deepseek.com/', model: 'deepseek-chat', key: 'k1', messages: [{ role: 'system', content: 'sys' }, { role: 'user', content: 'hi' }], temperature: 0.2, jsonMode: true });
  assert.strictEqual(r.url, 'https://api.deepseek.com/chat/completions');
  assert.strictEqual(r.headers.Authorization, 'Bearer k1');
  assert.deepStrictEqual(r.body.response_format, { type: 'json_object' });
  assert.strictEqual(r.body.messages.length, 2, 'OpenAI 保留 system 在 messages');
  assert.strictEqual(r.body.max_tokens, undefined);
});

test('buildChatRequest：Anthropic 协议（百炼 Token Plan 结尾 /apps/anthropic）', () => {
  const base = 'https://token-plan.cn-beijing.maas.aliyuncs.com/apps/anthropic';
  const r = S.buildChatRequest({ type: 'anthropic', baseUrl: base, model: 'claude-sonnet-5-5', key: 'sk-ant', messages: [{ role: 'system', content: 'sys' }, { role: 'user', content: 'hi' }], maxTokens: 1024 });
  assert.strictEqual(r.url, base + '/v1/messages');
  assert.strictEqual(r.headers['x-api-key'], 'sk-ant');
  assert.strictEqual(r.headers['anthropic-version'], '2023-06-01');
  assert.strictEqual(r.headers.Authorization, undefined);
  assert.strictEqual(r.body.system, 'sys', 'system 提升为顶层字段');
  assert.strictEqual(r.body.messages.length, 1);
  assert.strictEqual(r.body.max_tokens, 1024, 'Anthropic 必须有 max_tokens');
  assert.strictEqual(r.body.response_format, undefined);
});

test('parseChatContent：两协议取文本', () => {
  assert.strictEqual(S.parseChatContent('openai', { choices: [{ message: { content: 'A' } }] }), 'A');
  assert.strictEqual(S.parseChatContent('anthropic', { content: [{ type: 'text', text: 'X' }, { type: 'text', text: 'Y' }] }), 'XY');
  assert.strictEqual(S.parseChatContent('anthropic', { content: 'bad' }), '');
  assert.strictEqual(S.parseChatContent('openai', null), '');
});

test('buildChatRequest：未知 type 回落 openai', () => {
  const r = S.buildChatRequest({ type: 'weird', baseUrl: 'https://x.com', model: 'm', key: 'k', messages: [] });
  assert.strictEqual(r.type, 'openai');
  assert.match(r.url, /chat\/completions$/);
});

test('edgeSnap：四边吸附与隐藏坐标', () => {
  const wa = { x: 0, y: 0, width: 1920, height: 1040 };
  const win = { w: 128, h: 104 };
  const r1 = S.edgeSnap({ ...win, x: 8, y: 500 }, wa);
  assert.strictEqual(r1.edge, 'left');
  assert.strictEqual(r1.hidden.x, -104); assert.strictEqual(r1.hidden.y, 500, '隐藏=只露24px');
  const r2 = S.edgeSnap({ ...win, x: 1900, y: 300 }, wa);
  assert.strictEqual(r2.edge, 'right');
  assert.strictEqual(r2.hidden.x, 1896, '右缘隐藏起点=屏宽-24');
  const r3 = S.edgeSnap({ ...win, x: 800, y: 5 }, wa);
  assert.strictEqual(r3.edge, 'top');
  assert.strictEqual(r3.hidden.y, -80);
  const r4 = S.edgeSnap({ ...win, x: 600, y: 1000 }, wa);
  assert.strictEqual(r4.edge, 'bottom');
});

test('edgeSnap：屏中央不吸附；越界坐标回拉进 workArea', () => {
  const wa = { x: 0, y: 0, width: 1920, height: 1040 };
  const mid = S.edgeSnap({ x: 600, y: 400, w: 128, h: 104 }, wa);
  assert.strictEqual(mid.edge, null);
  assert.deepStrictEqual(mid.docked, { x: 600, y: 400 });
  const out = S.edgeSnap({ x: 2500, y: -300, w: 128, h: 104 }, wa);
  assert.strictEqual(out.edge, 'right', '完全出右界仍按右缘处理');
  assert.ok(out.docked.x <= 1920 - 128 && out.docked.x >= 0);
});

test('edgeSnap：多屏负坐标 workArea（副屏在主屏左侧）', () => {
  const wa = { x: -1920, y: 0, width: 1920, height: 1040 };
  const r = S.edgeSnap({ x: -1915, y: 200, w: 128, h: 104 }, wa);
  assert.strictEqual(r.edge, 'left');
  assert.strictEqual(r.hidden.x, -1920 - 104);
});

test('fmtShort/fmtLong：ISO 与旧版中文时间串均可展示', () => {
  assert.match(S.fmtShort('2026-11-05T09:08:00.000Z'), /\d{2}-\d{2} \d{2}:\d{2}/);
  assert.strictEqual(S.fmtShort(''), '');
  assert.ok(S.fmtShort('2026/11/5 17:20:30').includes('17:20'));
  assert.ok(S.fmtLong('2026-11-05T09:08:00.000Z').includes('2026'));
});
