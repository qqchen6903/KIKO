/* 待办45 性能实测：构造大日志量存档（3项目×500条双快照历史×150待办），
   测量 首存/重复保存(应跳写)/加载/单md序列化 与磁盘体积。node tools/perf-bench.mjs */
import { performance } from 'node:perf_hooks';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const S = require('../src/shared.js');
const Store = require('../src/storage.js');

const db = { version: 2, activeProjectId: 'p1', settings: {}, projects: [] };
for (let pi = 1; pi <= 3; pi++) {
  const todos = Array.from({ length: 150 }, (_, i) => ({ title: `任务${pi}-${i}`, due: '', priority: '普通', done: i % 4 === 0, createdAt: '', remindedAt: '', doneAt: '' }));
  const logs = Array.from({ length: 500 }, (_, i) => ({
    at: new Date(1730000000000 + i * 6e4).toISOString(),
    message: `记录 ${i} ` + '内容文本'.repeat(30),
    aiSummary: '摘要', conflicts: [],
    snapshotBefore: { summary: 's' + i, todos, decisions: [] },
    applied: { summary: 'a' + i, todos, decisions: [] },
  }));
  db.projects.push({ id: 'p' + pi, name: `压力项目${pi}`, goal: '', status: '进行中', createdAt: '', updatedAt: '', lastWorkedAt: '', state: { summary: '压测', todos, pending: [], decisions: [{ at: '', text: 'd' }], constraints: [] }, logs });
}
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kiko-perf-'));
const time = fn => { const t = performance.now(); const r = fn(); return [performance.now() - t, r]; };

const [first] = time(() => Store.saveWorkspace(root, db));
const pdir = path.join(root, 'projects');
const total = fs.readdirSync(pdir).reduce((a, f) => a + fs.statSync(path.join(pdir, f)).size, 0);
const [second] = time(() => Store.saveWorkspace(root, db));   // 应全部跳写
const [load, back] = time(() => Store.loadWorkspace(root));
const [mig] = time(() => S.migrate(back));
const [one] = time(() => Store.projectToMd(db.projects[0]));

console.log(JSON.stringify({
  首次全量保存ms: Math.round(first),
  重复保存ms_内容未变应跳写: Math.round(second),
  加载解析ms: Math.round(load),
  migratems: Math.round(mig),
  单项目md序列化ms: +one.toFixed(1),
  磁盘总量KB: Math.round(total / 1024),
  落盘保留快照条数: back.projects[0].logs.filter(l => l.snapshotBefore !== undefined).length,
}));
fs.rmSync(root, { recursive: true, force: true });
