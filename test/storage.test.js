'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const S = require('../src/shared.js');
const store = require('../src/storage.js');

function tmpRoot() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'kiko-store-'));
  return d;
}
function sampleDb() {
  return S.migrate({
    version: 2, activeProjectId: 'aaaaaaaa-1111',
    settings: { baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat', winBounds: { x: 1, y: 2 } },
    projects: [{
      id: 'aaaaaaaa-1111', name: '官网改版', goal: '上线新首页', status: '进行中',
      createdAt: '2026-11-01T10:00:00.000Z', updatedAt: '2026-11-06T09:00:00.000Z', lastWorkedAt: '2026-11-06T09:00:00.000Z',
      state: { summary: '首页完成', completed: ['首页布局'], inProgress: ['鉴权联调'], blockers: [], nextSteps: ['完成鉴权'],
        todos: [{ title: '明天联调鉴权', due: '2026-11-07T10:00:00.000Z', priority: '高', done: false, createdAt: '', remindedAt: '' }],
        decisions: [{ at: '2026-11-05T08:00:00.000Z', text: '采用 Vue3' }], constraints: [] },
      logs: [{ at: '2026-11-06T09:00:00.000Z', message: '今天完成了首页布局', aiSummary: '首页完成', conflicts: [], snapshotBefore: { summary: '', completed: [] }, applied: { summary: '首页完成' } }],
    }],
  });
}

test('md 往返：projectToMd → mdToProject 数据无损', () => {
  const p = sampleDb().projects[0];
  const md = store.projectToMd(p);
  assert.ok(md.startsWith('---'), '应为 frontmatter 开头');
  assert.ok(md.includes('# 官网改版'), '正文含标题');
  assert.ok(md.includes('- [ ] 明天联调鉴权'), '正文含待办勾选行');
  const back = store.mdToProject(md);
  assert.strictEqual(back.id, p.id);
  assert.strictEqual(back.name, p.name);
  assert.strictEqual(back.state.summary, '首页完成');
  assert.deepStrictEqual(back.state.todos[0], p.state.todos[0]);
  assert.deepStrictEqual(back.logs[0].snapshotBefore, { summary: '', completed: [] }, '撤销快照完整回读');
});

test('待办39：三属性 frontmatter 往返无损，正文渲染子行且旧小节消失', () => {
  const p = sampleDb().projects[0];
  p.state.todos.push({ title: '带属性任务', due: '', priority: '普通', done: false, createdAt: '', remindedAt: '', blocked: '等接口', related: 'https://x.io/doc', next: '先写mock' });
  const md = store.projectToMd(p);
  assert.ok(md.includes('  - 阻塞点：等接口'), '正文有阻塞点子行');
  assert.ok(md.includes('  - 关联：https://x.io/doc'));
  assert.ok(md.includes('  - 下一步：先写mock'));
  assert.ok(!md.includes('## 当前卡点') && !md.includes('## 已完成') && !md.includes('## 进行中'), '旧四状态小节已移除');
  const back = store.mdToProject(md);
  const t = back.state.todos.find(x => x.title === '带属性任务');
  assert.strictEqual(t.blocked, '等接口');
  assert.strictEqual(t.related, 'https://x.io/doc');
  assert.strictEqual(t.next, '先写mock');
});

test('待办45①：pruneLogsForWrite 只保留最近10条非系统快照，正文留全', () => {
  const logs = Array.from({ length: 12 }, (_, i) => ({ at: 't' + i, message: 'm' + i, snapshotBefore: { x: i }, applied: { y: i } }));
  logs.push({ at: 'sys', system: true, message: '系统', snapshotBefore: { keep: true } });
  const pruned = store.pruneLogsForWrite(logs);
  assert.strictEqual(pruned.length, 13);
  assert.strictEqual(pruned.filter(l => l.snapshotBefore !== undefined).length, 11, '10条非系统+1条系统(原样)');
  assert.strictEqual(pruned[0].message, 'm0', '文字记录不丢');
  assert.ok(pruned[11].snapshotBefore, '最近一条非系统更新保留快照（撤销对象）');
});

test('待办44：待定池 md 正文渲染与 frontmatter 往返', () => {
  const p = sampleDb().projects[0];
  p.state.pending = S.normPending([{ text: '下月末部署暂定', waiting: '客户确认时间', followUp: '2026-11-30 10:00', source: '时间暂定', state: 'discarded' }]);
  const md = store.projectToMd(p);
  assert.ok(md.includes('## 待定池'), '正文含待定池小节');
  assert.ok(md.includes('[~] 下月末部署暂定'), '作废项渲染删除标记');
  assert.ok(md.includes('在等：客户确认时间') && md.includes('来源："时间暂定"'));
  const back = store.mdToProject(md);
  assert.strictEqual(back.state.pending[0].state, 'discarded');
  assert.match(back.state.pending[0].followUp, /^2026-11-30/);
});

test('load/saveWorkspace：写盘回读一致，改名清旧文件，删除项目清孤儿', () => {
  const root = tmpRoot();
  const db = sampleDb();
  store.saveWorkspace(root, db);
  const reread = store.loadWorkspace(root);
  assert.strictEqual(reread.activeProjectId, 'aaaaaaaa-1111');
  assert.strictEqual(reread.settings.baseUrl, 'https://api.deepseek.com');
  assert.strictEqual(reread.projects.length, 1);
  assert.deepStrictEqual(reread.projects[0].state.completed, ['首页布局']);

  // 改名 → 新文件写入、旧文件删除
  reread.projects[0].name = '官网改版 V2';
  store.saveWorkspace(root, reread);
  const files = fs.readdirSync(path.join(root, 'projects'));
  assert.strictEqual(files.length, 1, '改名后不应留旧文件');
  assert.match(files[0], /^官网改版-V2-/);

  // 删除项目 → 文件清除
  reread.projects = [];
  store.saveWorkspace(root, reread);
  assert.strictEqual(fs.readdirSync(path.join(root, 'projects')).length, 0);
  fs.rmSync(root, { recursive: true, force: true });
});

test('损坏 md 文件被跳过而不崩溃、不删除', () => {
  const root = tmpRoot();
  store.saveWorkspace(root, sampleDb());
  fs.writeFileSync(path.join(root, 'projects', 'broken-xxxxxxxx.md'), 'not a frontmatter');
  const reread = store.loadWorkspace(root);
  assert.strictEqual(reread.projects.length, 1, '好文件照常加载');
  assert.ok(fs.existsSync(path.join(root, 'projects', 'broken-xxxxxxxx.md')), '坏文件保留待用户处理');
  fs.rmSync(root, { recursive: true, force: true });
});

test('ensureMigrated：旧 workspace.json 自动转 md 并留档原文件', () => {
  const root = tmpRoot();
  const legacyFile = path.join(root, 'workspace.json');
  fs.writeFileSync(legacyFile, JSON.stringify({ projects: [{ id: 'x9', name: '旧项目', state: { completed: ['a'] }, logs: [] }], settings: { baseUrl: 'https://a.b' } }));
  const moved = store.ensureMigrated(root, legacyFile, S);
  assert.strictEqual(moved, true);
  const db = store.loadWorkspace(root);
  assert.strictEqual(db.projects[0].name, '旧项目');
  assert.strictEqual(db.settings.baseUrl, 'https://a.b');
  assert.strictEqual(fs.existsSync(legacyFile), false, '原文件改名留档');
  assert.ok(fs.readdirSync(root).some(f => f.startsWith('workspace.migrated.')), '留档文件存在');
  // 幂等：再次迁移不报错不重复
  assert.strictEqual(store.ensureMigrated(root, legacyFile, S), false);
  fs.rmSync(root, { recursive: true, force: true });
});

test('touchProject：单项目更新不影响其他文件', () => {
  const root = tmpRoot();
  const db = sampleDb();
  db.projects.push({ id: 'bbbb2222-0000', name: '第二个', state: {}, logs: [] });
  db.activeProjectId = 'bbbb2222-0000';
  store.saveWorkspace(root, db);
  const p1 = store.loadWorkspace(root).projects.find(x => x.id === 'aaaaaaaa-1111');
  p1.state.blockers = ['新卡点'];
  store.touchProject(root, p1);
  const after = store.loadWorkspace(root);
  assert.strictEqual(after.projects.find(x => x.id === 'aaaaaaaa-1111').state.blockers.length, 1);
  assert.strictEqual(after.activeProjectId, 'bbbb2222-0000', 'index 未被 touch 改动');
  fs.rmSync(root, { recursive: true, force: true });
});
