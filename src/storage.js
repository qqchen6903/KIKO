/* 用户数据持久层（主进程专用，CJS）。
 * 待办20：用户数据以 Markdown 存储——每个项目一个 .md：
 *   - YAML frontmatter = 机器态（meta / state / logs，含撤销快照），读写以此为准
 *   - 正文 = 可读副本（概览/列表/待办/决策/时间线），便于用户用任何编辑器查看
 * 待办19：root（数据根目录）可由用户自定义；结构：
 *   <root>/index.json        应用配置与活动项目
 *   <root>/projects/*.md     项目数据
 *   <root>/archive/          恢复备份前的自动留档
 *   <root>/provider.enc      加密 API Key
 */
'use strict';
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/;

function atomicWrite(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, content, { mode: 0o600 });
  fs.renameSync(tmp, file);
}

/* 文件名：清洗过的名称 + id 前 8 位，重命名时按 id 后缀匹配旧文件 */
function slug(s) {
  return String(s || 'project').replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'project';
}
function shortId(id) { return String(id).replace(/-/g, '').slice(0, 8); }
function projectFile(root, p) {
  const target = path.join(root, 'projects', `${slug(p.name)}-${shortId(p.id)}.md`);
  const dir = path.join(root, 'projects');
  let old = null;
  try { old = fs.readdirSync(dir).filter(f => f.endsWith('.md') && f.endsWith(`-${shortId(p.id)}.md`) && path.join(dir, f) !== target).map(f => path.join(dir, f)); } catch {}
  return { target, stale: old || [] };
}

/* ---------- md 序列化 ---------- */
function projectToMd(p) {
  const fm = yaml.dump(
    { meta: { id: p.id, name: p.name, goal: p.goal || '', status: p.status || '进行中', createdAt: p.createdAt || '', updatedAt: p.updatedAt || '', lastWorkedAt: p.lastWorkedAt || '' },
      state: p.state, logs: pruneLogsForWrite(p.logs) },
    { lineWidth: 0, noRefs: true, sortKeys: false },
  );
  const st = p.state || {};
  /* 待办39：待办行下挂 阻塞点/关联/下一步 属性子行；旧四状态小节（sec 助手随之删除）不再渲染 */
  const ATTR = { blocked: '阻塞点', related: '关联', next: '下一步' };
  const PAUSE = { me: '我来继续', waiting: '等他人', stuck: '卡住了', defer: '先放一放' };
  const todoLine = t => {
    const main = `- [${t.done ? 'x' : ' '}] ${t.title}${t.due ? `（到期 ${t.due}` : ''}${t.priority && t.priority !== '普通' ? `，${t.priority}优先级` : ''}${t.due ? '）' : ''}`;
    const attrs = Object.entries(ATTR).map(([k, label]) => t[k] ? `\n  - ${label}：${t[k]}` : '').join('');
    /* 待办50：续点子行 */
    let pause = '';
    if (PAUSE[t.pauseState]) {
      pause = `\n  - 续点：${PAUSE[t.pauseState]}`
        + `${t.pauseState === 'waiting' && t.waitingFor ? `（等：${t.waitingFor}）` : ''}`
        + `${t.pauseFollow ? ` 跟进 ${t.pauseFollow}` : ''}`
        + `${t.pauseAt ? ` · ${t.pauseAt} 标记` : ''}`
        + `${t.pauseNote ? ` · 想法：${t.pauseNote}` : ''}`;
    }
    return main + attrs + pause;
  };
  const decLine = d => `- ${d.at ? `[${d.at}] ` : ''}${d.text}`;
  const logBlock = l => l.system
    ? `### ${l.at}\n\n（系统）${l.message}\n`
    : `### ${l.at}\n\n**原始输入**：${String(l.message || '').replace(/\r?\n/g, ' ')}\n\n${l.aiSummary ? `**AI 整理**：${l.aiSummary}\n` : ''}${(l.conflicts || []).length ? `\n**待确认冲突**：\n${l.conflicts.map(c => `- ${c}`).join('\n')}\n` : ''}${l.reverted ? '\n（此更新已被撤销）\n' : ''}`;
  const body = [
    `# ${p.name}`, '',
    st.summary ? `> ${st.summary}` : '> （尚无概况，向 KIKO 描述你的工作进展吧）', '',
    p.goal ? `**目标**：${p.goal}` : '', '',
    `## 待办\n\n${(st.todos || []).map(todoLine).join('\n') || '（无）'}\n`,
    /* 待办44：待定池可读副本 */
    (() => {
      const list = st.pending || [];
      if (!list.length) return '';
      const pl = x => `- ${x.state === 'discarded' ? '[~] ' : '[ ] '}${x.text}`
        + `${x.followUp ? `（跟进 ${x.followUp}）` : ''}${x.waiting ? ` ｜ 在等：${x.waiting}` : ''}${x.source ? ` ｜ 来源："${x.source}"` : ''}`;
      return `## 待定池\n\n${list.map(pl).join('\n')}\n`;
    })(),
    `## 关键决策\n\n${(st.decisions || []).map(decLine).join('\n') || '（无）'}\n`,
    `## 历史时间线\n\n${(p.logs || []).map(logBlock).join('\n') || '（无）'}`,
  ].filter(line => line !== undefined).join('\n') + '\n';
  return `---\n${fm}---\n\n${body}`;
}

function mdToProject(text) {
  const m = String(text).match(FM_RE);
  if (!m) return null;
  let doc;
  try { doc = yaml.load(m[1]); } catch { return null; }
  if (!doc || !doc.meta || !doc.meta.id || !doc.meta.name) return null;
  return { ...doc.meta, state: doc.state || {}, logs: Array.isArray(doc.logs) ? doc.logs : [] };
}

/* ---------- 读写 ---------- */
function loadWorkspace(root) {
  let index = {};
  try { index = JSON.parse(fs.readFileSync(path.join(root, 'index.json'), 'utf8')); } catch {}
  let projects = [];
  const dir = path.join(root, 'projects');
  try {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.md')) continue;
      const p = mdToProject(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (p) projects.push(p);
      else console.warn('[存储] 无法解析项目文件，已跳过（数据未删除）:', f);
    }
  } catch {}
  projects.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  return { version: 2, projects, activeProjectId: index.activeProjectId || null, settings: index.settings || {} };
}

function writeIndex(root, db) {
  atomicWrite(path.join(root, 'index.json'), JSON.stringify({
    version: 2,
    activeProjectId: db.activeProjectId || null,
    settings: db.settings || {},
  }, null, 2));
}
/* 待办45① 历史日志瘦身：只有最近 keep 条非系统更新保留 snapshotBefore/applied 快照，
 * 更早的落盘时去掉快照只留文字（撤销只针对最后一次更新，功能不受影响；内存中不裁剪）。 */
function pruneLogsForWrite(logs, keep = 10) {
  const snapIdx = [];
  (logs || []).forEach((l, i) => { if (l && !l.system && (l.snapshotBefore !== undefined || l.applied !== undefined)) snapIdx.push(i); });
  const drop = new Set(snapIdx.slice(0, Math.max(0, snapIdx.length - keep)));
  return (logs || []).map((l, i) => {
    if (!drop.has(i)) return l;
    const { snapshotBefore, applied, ...rest } = l;
    return rest;
  });
}

/* 待办45② 脏跳过：渲染层每次全量送主进程，但内容未变的项目文件不再重写（大存档下保存提速关键） */
const mdCache = new Map();
function writeProject(root, p) {
  const { target, stale } = projectFile(root, p);
  const md = projectToMd(p);
  const unchanged = mdCache.get(target) === md;
  if (!unchanged) { atomicWrite(target, md); mdCache.set(target, md); }
  for (const s of stale) { try { fs.unlinkSync(s); mdCache.delete(s); } catch {} }
  return !unchanged;
}
function saveWorkspace(root, db) {
  writeIndex(root, db);
  const keep = new Set(db.projects.map(p => shortId(p.id)));
  for (const p of db.projects) writeProject(root, p);
  const dir = path.join(root, 'projects');
  try {
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith('.md')) {
        const mm = f.match(/-([0-9a-f]{8})\.md$/);
        if (mm && !keep.has(mm[1])) fs.unlinkSync(path.join(dir, f));
      }
    }
  } catch {}
}

/* 单点更新某个项目（提醒标记等），不动其他文件 */
function touchProject(root, p) { writeProject(root, p); }

/* ---------- 旧 workspace.json 迁移到 md ---------- */
function ensureMigrated(root, legacyFile, Shared) {
  const idxFile = path.join(root, 'index.json');
  if (fs.existsSync(idxFile) || !fs.existsSync(legacyFile)) return false;
  let legacy;
  try { legacy = JSON.parse(fs.readFileSync(legacyFile, 'utf8')); } catch { return false; }
  const db = Shared.migrate(legacy);
  saveWorkspace(root, db);
  try { fs.renameSync(legacyFile, path.join(path.dirname(legacyFile), `workspace.migrated.${new Date().toISOString().replace(/[:.]/g, '-')}.bak.json`)); } catch {}
  return true;
}

/* ---------- 数据目录整体搬迁（复制到新目录；原目录保留） ---------- */
function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, entry.name), d = path.join(to, entry.name);
    if (entry.isDirectory()) copyTree(s, d);
    else if (entry.isFile()) { fs.mkdirSync(path.dirname(d), { recursive: true }); fs.copyFileSync(s, d); }
  }
}

/* ---------- 导出（单文件 JSON 备份）/ 恢复（JSON → md 全重写） ---------- */
function exportSnapshot(db) { return JSON.stringify(db, null, 2); }

module.exports = { loadWorkspace, saveWorkspace, writeIndex, writeProject, touchProject, ensureMigrated, copyTree, projectToMd, mdToProject, pruneLogsForWrite, exportSnapshot, atomicWrite, shortId };
