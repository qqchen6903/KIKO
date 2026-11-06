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

test('validateAiResult：非法字段类型不写入，全空则拒绝（待办39 新模型）', () => {
  const r = S.validateAiResult({ summary: '', todos: 'not-array', decisions: { 0: 'x' } });
  assert.strictEqual(r.ok, false, '无任何有效内容必须拒绝');
  const r2 = S.validateAiResult({ summary: 'ok', decisions: 'not-array' });
  assert.strictEqual(r2.ok, true);
  assert.deepStrictEqual(r2.value.decisions, []);
  assert.ok(r2.errors.some(e => e.includes('decisions')));
});

test('validateAiResult：正常内容规整、去重、截断、todos 与三属性校验', () => {
  const long = 'x'.repeat(600);
  const r = S.validateAiResult({
    summary: ' 进展顺利 ',
    todos: [
      { title: '联调鉴权', due: '明天 14:00', priority: '紧急', done: 'yes', blocked: '等运维开墙', related: '', next: ' ' },
      { title: '' }, '无主待办', { title: '旧任务', due: '2026-11-10 09:30' },
      { title: '超长属性', next: long },
    ],
    decisions: ['确认使用 Electron'],
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.value.summary, '进展顺利');
  assert.strictEqual(r.value.todos.length, 4, '对象待办有效 + 1条纯字符串按标题收录');
  assert.strictEqual(r.value.todos[0].priority, '普通');
  assert.strictEqual(r.value.todos[0].done, true);
  assert.strictEqual(r.value.todos[0].blocked, '等运维开墙', 'blocked 属性保留');
  assert.strictEqual(r.value.todos[0].related, '', '空串属性保留（表示清除指令，与缺失区分）');
  assert.ok('next' in r.value.todos[0] && r.value.todos[0].next === '', '空白属性 trim 为空串仍视为显式清除');
  assert.ok(!('blocked' in r.value.todos[2]), '缺失键不落属性（表示不修改）');
  assert.strictEqual(r.value.todos[3].next.length, S.MAX_LEN, '属性截断到 MAX_LEN');
  assert.match(r.value.todos[0].due, /^2\d{3}-/);
});

test('normalizeDue：多种格式归一，垃圾输入返回空', () => {
  assert.strictEqual(S.normalizeDue(''), '');
  assert.strictEqual(S.normalizeDue('随便一句话'), '');
  assert.match(S.normalizeDue('2026-11-10 09:30'), /^2026-11-10/);
  assert.match(S.normalizeDue('2026-11-10T09:30'), /^2026-11-10/);
  assert.match(S.normalizeDue('明天 18:00'), /^20/);
  assert.strictEqual(S.daysSince(S.normalizeDue('2020-01-01')), Math.floor((Date.now() - Date.parse('2020-01-01')) / 86400e3));
});

test('mergeState：决策/待办只追加，旧格式列表非空则保留不删（待办39）', () => {
  const old = {
    summary: '旧摘要', completed: ['旧完成项'], blockers: ['旧格式卡点'],
    todos: [{ title: '写周报', due: '', priority: '普通', done: false, createdAt: '', remindedAt: '' }],
    decisions: [{ at: '', text: '旧决策' }], constraints: [],
  };
  const ai = S.validateAiResult({ summary: '新摘要', todos: [{ title: '写周报', due: '明天 10:00', priority: '高', done: false, blocked: '周报模板未定', next: '找设计要素材' }], decisions: ['新决策'], conflicts: [] }).value;
  const { newState } = S.mergeState(old, ai);
  assert.deepStrictEqual(newState.completed, ['旧完成项'], '旧 completed 原样保留');
  assert.deepStrictEqual(newState.blockers, ['旧格式卡点'], '旧 blockers 不静默删除');
  assert.ok(!('inProgress' in newState), '空旧列表不再补进新状态');
  assert.ok(newState.decisions.some(d => d.text === '旧决策'), '旧决策必须保留');
  assert.ok(newState.decisions.some(d => d.text === '新决策'));
  assert.strictEqual(newState.todos.length, 1, '同名待办合并为一条');
  assert.strictEqual(newState.todos[0].priority, '高');
  assert.strictEqual(newState.todos[0].blocked, '周报模板未定', 'AI 属性写入');
  assert.strictEqual(newState.todos[0].next, '找设计要素材');
  assert.strictEqual(newState.summary, '新摘要');
});

test('mergeState：属性缺失=不修改，空串=清除；done 只进不退', () => {
  const old = { todos: [{ title: 'A', done: false, blocked: '有阻塞', related: 'r1' }, { title: 'B', done: true, remindedAt: 'x' }], decisions: [] };
  const ai = S.validateAiResult({
    summary: 's',
    todos: [
      { title: 'A', done: false, blocked: '' },            // 清除 blocked；related 缺失保留
      { title: 'B', done: false },                          // AI 未回传 done=false 不得回退
      { title: 'C', done: false, next: '起步' },            // 新待办带属性
    ],
  }).value;
  const { newState } = S.mergeState(old, ai);
  const a = newState.todos.find(t => t.title === 'A'), b = newState.todos.find(t => t.title === 'B'), c = newState.todos.find(t => t.title === 'C');
  assert.ok(!('blocked' in a), '空串清除 blocked');
  assert.strictEqual(a.related, 'r1', '缺失键不修改');
  assert.strictEqual(b.done, true, 'done 只进不退');
  assert.strictEqual(c.next, '起步', '新待办属性落库');
  assert.ok(a.doneAt === undefined || true);
  const b1 = newState.todos.find(t => t.title === 'B');
  assert.strictEqual(b1.remindedAt, 'x');
});

test('diffState：待办属性级差异与新待办/完成/决策', () => {
  const d = S.diffState(
    { decisions: [{ text: 'd1' }], todos: [{ title: 't', done: false, blocked: '旧卡点' }, { title: 's', done: false, next: '计划X' }] },
    { decisions: [{ text: 'd1' }, { text: 'd2' }], todos: [{ title: 't', done: true }, { title: 's', done: false, next: '计划Y' }, { title: 'n', done: false }] }
  );
  assert.deepStrictEqual(d.decisionsAdded, ['d2']);
  assert.deepStrictEqual(d.todosDone, ['t']);
  assert.deepStrictEqual(d.todosAdded, ['n']);
  const fields = d.attrsChanged.map(a => a.field + ':' + a.title).sort();
  assert.ok(fields.includes('blocked:t'), 't 的 blocked 被清除');
  assert.ok(fields.includes('next:s'), 's 的 next 变更');
  assert.strictEqual(d.attrsChanged.find(a => a.title === 's').from, '计划X');
  assert.strictEqual(d.attrsChanged.find(a => a.title === 's').to, '计划Y');
});

test('migrate：v1 旧数据补齐字段，字符串决策转对象，activeProjectId 兜底', () => {
  const v1 = {
    projects: [{ id: 'p1', name: '项目一', state: { summary: 's', completed: ['x'], todos: [{ title: 't' }], decisions: ['字符串决策'] }, logs: [{ at: '2026/11/1 10:00:00', message: '旧记录' }] }],
    activeProjectId: 'p1', settings: { baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' }, version: 1,
  };
  const db = S.migrate(v1);
  const p = db.projects[0];
  assert.strictEqual(db.version, 2);
  assert.deepStrictEqual(p.state.completed, ['x'], '待办39：非空旧列表迁移时保留');
  assert.ok(!('inProgress' in p.state), '待办39：不再补齐空的旧列表键');
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

test('待办44：validateAiResult pending 池规整——非法类型忽略、无正文丢弃、字段归一', () => {
  const r = S.validateAiResult({ pending: 'x' });
  assert.strictEqual(r.ok, false, 'pending 非法且全空应拒绝');
  const r2 = S.validateAiResult({ pending: ['纯文本待定', { text: '等客户确认排期', waiting: '客户张三', followUp: '明天 09:00', source: '先这样吧' }, { waiting: '没有正文' }] });
  assert.strictEqual(r2.ok, true);
  assert.strictEqual(r2.value.pending.length, 2, '无正文条目丢弃');
  assert.strictEqual(r2.value.pending[0].text, '纯文本待定');
  assert.strictEqual(r2.value.pending[1].waiting, '客户张三');
  assert.match(r2.value.pending[1].followUp, /^2\d{3}-/);
  assert.strictEqual(r2.value.pending[1].state, 'open');
});

test('待办44：mergeState 待定池只增不删，作废状态 AI 无权改，改跟进日期清提醒', () => {
  const old = { pending: [
    { text: '老待定', waiting: '旧说法', state: 'discarded', createdAt: '', remindedAt: 'r' },
    { text: '跟进项', followUp: '2026-12-01T10:00:00.000Z', remindedAt: 'r1' },
  ], todos: [], decisions: [] };
  const ai = S.validateAiResult({ summary: 's', pending: [
    { text: '老待定', waiting: '新说法', state: 'open' },
    { text: '跟进项', followUp: '2026-12-05 10:00' },
    { text: '新增待定' },
  ] }).value;
  const { newState } = S.mergeState(old, ai);
  const a = newState.pending.find(x => x.text === '老待定'), b = newState.pending.find(x => x.text === '跟进项');
  assert.strictEqual(a.state, 'discarded', '作废状态由用户决定，AI 传入 open 也不覆盖');
  assert.strictEqual(a.waiting, '新说法', '非空字段可更新');
  assert.match(b.followUp, /^2026-12-05/);
  assert.strictEqual(b.remindedAt, '', '跟进日期变化后清提醒标记，可再次提醒');
  assert.ok(newState.pending.some(x => x.text === '新增待定'));
});

test('待办44：diffState 输出 pendingAdded；migrate 自动补齐待定池字段', () => {
  const d = S.diffState({ pending: [{ text: '旧' }] }, { pending: [{ text: '旧' }, { text: '新池项' }] });
  assert.deepStrictEqual(d.pendingAdded, ['新池项']);
  const db = S.migrate({ version: 1, projects: [{ id: 'a', name: 'n', state: { todos: [] }, logs: [] }], activeProjectId: 'a' });
  assert.deepStrictEqual(db.projects[0].state.pending, [], '旧存档缺 pending 键时补空数组');
});

test('fmtShort/fmtLong：ISO 与旧版中文时间串均可展示', () => {
  assert.match(S.fmtShort('2026-11-05T09:08:00.000Z'), /\d{2}-\d{2} \d{2}:\d{2}/);
  assert.strictEqual(S.fmtShort(''), '');
  assert.ok(S.fmtShort('2026/11/5 17:20:30').includes('17:20'));
  assert.ok(S.fmtLong('2026-11-05T09:08:00.000Z').includes('2026'));
});
