/* UI 冒烟自动化：启动真实应用（复用 src/main.js 的窗口与全部 IPC 处理器），
 * 驱动隐藏化后的窗口做一轮核心交互并断言。用法：node_modules/.bin/electron test/ui-smoke.js
 * 结果写 test/smoke-result.txt 并打印；任一 FAIL 则退出码 1。测试项目会被删除，并恢复原 workspace.json。 */
'use strict';
const path = require('path');
const fs = require('fs');
const { app, BrowserWindow } = require('electron');

/* 冒烟测试用独立数据目录，绝不触碰用户真实 userData。必须在 require 主进程前设置 */
const SMOKE_DIR = path.join(__dirname, '.smoke-userdata');
fs.rmSync(SMOKE_DIR, { recursive: true, force: true });
fs.mkdirSync(path.join(SMOKE_DIR, 'userData'), { recursive: true });
app.setPath('userData', path.join(SMOKE_DIR, 'userData'));
app.setName('desktop-ai-work-assistant-smoke');

require('../src/main.js'); // 真实主进程入口：注册全部 ipcMain.handle、窗口、托盘

const results = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LIVE = path.join(__dirname, '_smoke_live.txt');
fs.writeFileSync(LIVE, '');
function live(s) { try { fs.appendFileSync(LIVE, s + '\n'); } catch {} }
function ok(name, cond, detail) { results.push({ name, pass: !!cond, detail: detail || '' }); const line = `${cond ? 'PASS' : 'FAIL'} ${name}${cond ? '' : (detail ? ' — ' + detail : '')}`; console.log(line); live(line); }
async function evalJs(win, code) {
  live('EVAL> ' + String(code).replace(/\s+/g, ' ').slice(0, 110));
  try { const r = await win.webContents.executeJavaScript(`(async()=>{${code}})()`); live('EVAL OK <- ' + String(JSON.stringify(r) || '').slice(0, 80)); return r; }
  catch (e) { live('EVAL ERR ' + String(e).slice(0, 120)); return { __error: String(e) }; }
}

(async () => {
  await app.whenReady();
  const dataDir = app.getPath('userData');
  const dataFile = path.join(dataDir, 'workspace.json');
  const hadFile = fs.existsSync(dataFile);
  const backup = hadFile ? fs.readFileSync(dataFile) : null;

  let win;
  for (let i = 0; i < 100 && !win; i++) {
    win = BrowserWindow.getAllWindows().find(w => String(w.webContents.getURL()).includes('index.html'));
    if (!win) await sleep(50);
  }
  if (!win) { ok('窗口创建', false, '主进程未产出窗口'); finish(); return; }

  const consoleErrors = [];
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 3 && !/favicon|DevTools|Security Warning/.test(message)) consoleErrors.push(message);
  });
  win.webContents.on('render-process-gone', (_e, d) => consoleErrors.push('render-process-gone ' + JSON.stringify(d)));
  for (let i = 0; i < 120; i++) { if (await evalJs(win, 'return !!document.querySelector(".app")')) break; await sleep(100); }

  ok('应用启动并挂载 Vue', !!(await evalJs(win, 'return document.querySelector(".app")')));
  ok('渲染层无控制台错误', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
  ok('窗口标题含 KIKO', String(await evalJs(win, 'return document.title')).includes('KIKO'), await evalJs(win, 'return document.title'));

  /* 待办总览：默认视图 */
  ok('默认进入待办总览', !!(await evalJs(win, `return document.querySelector('.board') && document.body.textContent.includes('待办总览')`)));
  ok('无边框拖拽条与自绘窗控', !!(await evalJs(win, `return !!document.querySelector('.dragbar') && !!document.querySelector('[data-wb="close"]') && !!document.querySelector('[data-wb="min"]')`)));
  ok('左下角功能菜单存在', !!(await evalJs(win, `return !!document.querySelector('.gearbtn') && [...document.querySelectorAll('.mitem')].some(x => x.textContent.includes('设置'))`)));
  ok('分段控件可切换到项目视图', !!(await evalJs(win, `
    return (() => { const b = [...document.querySelectorAll('.segctl button')].find(x => x.textContent.includes('项目')); b.click();
      return new Promise(res => setTimeout(() => res(!!document.querySelector('.grid') || !!document.querySelector('.empty-page')), 300)); })();
  `)));

  /* 待办38：document 不得整页滚动，主区/侧栏各自内部滚动 */
  ok('左右两栏独立滚动（待办38）', !!(await evalJs(win, `
    return (() => { const de = document.documentElement;
      const noDocScroll = de.scrollHeight <= window.innerHeight + 2;
      const main = document.querySelector('.main-col .main');
      return noDocScroll && !!main && getComputedStyle(main).overflowY === 'auto' && !!document.querySelector('.list');
    })();
  `)), 'document 出现整体滚动或主区非内滚容器');

  /* 桌宠窗口：应随应用创建，且能响应状态切换 */
  const pet = BrowserWindow.getAllWindows().find(w => String(w.webContents.getURL()).includes('pet.html'));
  ok('桌宠窗口已创建', !!pet);
  if (pet) {
    ok('桌宠初始为待机姿态', !!(await pet.webContents.executeJavaScript(`document.getElementById('kiko').src.includes('idle.png')`)));
    await win.webContents.executeJavaScript(`window.assistant.setPetState('done')`);
    await sleep(400);
    ok('主流程事件驱动桌宠状态切换', !!(await pet.webContents.executeJavaScript(`document.getElementById('kiko').src.includes('done.png')`)));
    ok('桌宠窗口置顶', pet.isAlwaysOnTop());
    await win.webContents.executeJavaScript(`window.assistant.setPetState('idle')`);
  }

  const PNAME = '__冒烟测试项目__';
  // 新建项目
  await evalJs(win, `[...document.querySelectorAll('.btn')].find(b => b.textContent.includes('新建')).click()`);
  await sleep(300);
  await evalJs(win, `
    const ins = document.querySelectorAll('.dialog input');
    ins[0].value = ${JSON.stringify(PNAME)}; ins[0].dispatchEvent(new Event('input', { bubbles: true }));
    ins[1].value = '冒烟测试目标'; ins[1].dispatchEvent(new Event('input', { bubbles: true }));
  `);
  await sleep(150);
  await evalJs(win, `[...document.querySelectorAll('.dialog .btn')].find(b => b.textContent.includes('创建并开始')).click()`);
  await sleep(700);
  ok('新建项目出现在侧栏', !!(await evalJs(win, `return [...document.querySelectorAll('.pname')].some(x => x.textContent === ${JSON.stringify(PNAME)})`)));
  ok('空状态提示文案显示', !!(await evalJs(win, `return [...document.querySelectorAll('.empty')].length > 0`)));

  const cardFinder = (label) => `[...document.querySelectorAll('.card')].find(c => c.querySelector('h3')?.textContent.includes(${label}))`;

  // 待办：添加 + 到期显示 + 勾选
  const todoOk = await evalJs(win, `
    const card = ${cardFinder("'待办事项'")};
    card.querySelector('.addbtn').click();
    return new Promise(res => setTimeout(() => {
      const inps = card.querySelectorAll('.addrow input');
      inps[0].value = '冒烟：一条待办'; inps[0].dispatchEvent(new Event('input', { bubbles: true }));
      inps[1].value = '明天 10:00'; inps[1].dispatchEvent(new Event('input', { bubbles: true }));
      setTimeout(() => { inps[0].dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
        setTimeout(() => {
          let row = [...card.querySelectorAll('.trow')].find(r => r.textContent.includes('冒烟：一条待办'));
          if (!row) return res({ found: false });
          const dueShown = !!row.querySelector('.due');
          row.querySelector('.chk').click();
          setTimeout(() => {
            /* 待办41：完成后条目从未完成列表消失（收进折叠的“最近一周”区），以“不在未完成区”为完成态判据 */
            const stillUndone = [...card.querySelectorAll('.trow')].some(r => !r.className.includes('done') && r.textContent.includes('冒烟：一条待办'));
            res({ found: true, dueShown, doneClass: !stillUndone });
          }, 350);
        }, 500); }, 100);
    }, 200));
  `);
  ok('待办添加并显示到期时间', !!(todoOk && todoOk.found && todoOk.dueShown), JSON.stringify(todoOk));
  ok('待办勾选变为完成态', !!(todoOk && todoOk.doneClass), JSON.stringify(todoOk));

  // 待办39：再建一条未完成待办 → 编辑填三属性 → 徽标渲染 → 状态联动
  await evalJs(win, `
    const card = ${cardFinder("'待办事项'")};
    const btn = card.querySelector('.addbtn');
    if (btn) btn.click();
    return new Promise(res => setTimeout(() => {
      const inps = card.querySelectorAll('.addrow input');
      if (!inps.length) return res(0);
      inps[0].value = '冒烟：属性任务'; inps[0].dispatchEvent(new Event('input', { bubbles: true }));
      setTimeout(() => { inps[0].dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true })); res(1); }, 150);
    }, 250));
  `);
  await sleep(700);
  const attrOk = await evalJs(win, `
    const card = ${cardFinder("'待办事项'")};
    const row = [...card.querySelectorAll('.trow')].find(r => r.textContent.includes('冒烟：属性任务'));
    if (!row) return { found: false };
    row.querySelector('.ops .mini').click();
    return new Promise(res => setTimeout(() => {
      const form = card.querySelector('.editform');
      if (!form) return res({ found: true, opened: false });
      const ins = form.querySelectorAll('.fte.attr');
      if (ins.length !== 3) return res({ found: true, opened: true, inputs: ins.length });
      const set = (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
      set(ins[0], '冒烟：等待接口'); set(ins[1], '冒烟：关联文档'); set(ins[2], '冒烟：先写mock');
      setTimeout(() => {
        form.querySelector('.mini.ok').click();
        setTimeout(() => {
          const r2 = [...card.querySelectorAll('.trow')].find(x => x.textContent.includes('冒烟：属性任务'));
          if (!r2) return res({ found: true, opened: true, saved: false });
          const bl = [...r2.querySelectorAll('.attr.bl')].map(a => a.textContent).join('');
          const rl = [...r2.querySelectorAll('.attr.rl')].map(a => a.textContent).join('');
          const nx = [...r2.querySelectorAll('.attr.nx')].map(a => a.textContent).join('');
          res({ found: true, opened: true, saved: !!bl && !!rl && !!nx, bl, rl, nx });
        }, 500);
      }, 120);
    }, 250));
  `);
  ok('待办三属性编辑并渲染徽标', !!(attrOk && attrOk.saved && attrOk.bl.includes('等待接口') && attrOk.rl.includes('关联文档') && attrOk.nx.includes('先写mock')), JSON.stringify(attrOk));
  const statusWait = await evalJs(win, `return [...document.querySelectorAll('.pmeta span')].some(x => x.textContent.includes('等待处理'))`);
  ok('带阻塞点的未完成待办联动项目状态为「等待处理」', !!statusWait);

  // 待办41：已完成待办收进「最近一周」展开区，带完成时间
  const weekOk = await evalJs(win, `
    const card = ${cardFinder("'待办事项'")};
    const btn = card.querySelector('.weekbtn');
    if (!btn || !btn.textContent.includes('1')) return { btn: false };
    btn.click();
    return new Promise(res => setTimeout(() => {
      const doneRow = [...card.querySelectorAll('.trow.done')].find(r => r.textContent.includes('冒烟：一条待办'));
      res({ btn: true, expanded: !!doneRow, time: doneRow ? (doneRow.querySelector('.ftime')?.textContent || '') : '' });
    }, 350));
  `);
  ok('最近一周完成项可展开且显示完成时间', !!(weekOk.btn && weekOk.expanded && weekOk.time.includes('完成于')), JSON.stringify(weekOk));

  // 待办44：待定池——添加、转正（补日期→变待办+系统痕迹）、过期项进总览待确认、作废置灰
  const ystr = (() => { const d = new Date(Date.now() - 864e5); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} 10:00`; })();
  const addPend = async (text, waiting, follow) => evalJs(win, `
    const card = ${cardFinder("'待定池'")};
    const btn = card.querySelector('.addbtn'); if (btn) btn.click();
    return new Promise(res => setTimeout(() => {
      const inps = card.querySelectorAll('.addrow input');
      if (!inps.length) return res(0);
      const set = (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
      set(inps[0], ${JSON.stringify(text)}); set(inps[1], ${JSON.stringify(waiting)}); set(inps[2], ${JSON.stringify(follow)});
      setTimeout(() => { inps[0].dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true })); res(1); }, 150);
    }, 250));
  `);
  await addPend('冒烟：待定转正', '客户确认排期', '明天 10:00');
  await sleep(600);
  await addPend('冒烟：待跟进过期', '等运维答复', ystr);
  await sleep(600);
  await addPend('冒烟：作废留档', '', '');
  await sleep(600);
  const pendUi = await evalJs(win, `
    const card = ${cardFinder("'待定池'")};
    const rows = [...card.querySelectorAll('.prow')];
    const ok = rows.filter(r => r.textContent.includes('冒烟：')).length;
    const wait = rows.some(r => r.textContent.includes('客户确认排期'));
    const disc = rows.find(r => r.textContent.includes('冒烟：作废留档'));
    if (disc) disc.querySelector('.ops [title="作废（留档）"]').click();
    return new Promise(res => setTimeout(() => {
      const d2 = [...card.querySelectorAll('.prow')].find(r => r.textContent.includes('冒烟：作废留档'));
      res({ ok, wait, discarded: !!d2 && d2.className.includes('discarded') });
    }, 300));
  `);
  ok('待定池三条添加并显示在等内容', pendUi.ok === 3 && pendUi.wait, JSON.stringify(pendUi));
  ok('待定作废置灰留档', !!pendUi.discarded, JSON.stringify(pendUi));
  const promoteOk = await evalJs(win, `
    const card = ${cardFinder("'待定池'")};
    const row = [...card.querySelectorAll('.prow')].find(r => r.textContent.includes('冒烟：待定转正'));
    if (!row) return { found: false };
    row.querySelector('.ops [title="转正为待办"]').click();
    return new Promise(res => setTimeout(() => {
      const form = card.querySelector('.editform');
      if (!form) return res({ found: true, form: false });
      const inp = form.querySelector('input.fte');
      inp.value = '2026-11-20 18:00'; inp.dispatchEvent(new Event('input', { bubbles: true }));
      setTimeout(() => {
        form.querySelector('.mini.ok').click();
        setTimeout(() => {
          const pendGone = ![...card.querySelectorAll('.prow')].some(r => r.textContent.includes('冒烟：待定转正'));
          const todoCard = ${cardFinder("'待办事项'")};
          const todoHas = [...todoCard.querySelectorAll('.trow')].some(r => r.textContent.includes('冒烟：待定转正'));
          const logHas = [...document.querySelectorAll('.lg-item, .log, body')].length && document.body.textContent.includes('待定转正：「冒烟：待定转正」');
          res({ found: true, form: true, pendGone, todoHas, logHas });
        }, 500);
      }, 120);
    }, 250));
  `);
  ok('待定转正为正式待办并留系统痕迹', !!(promoteOk.pendGone && promoteOk.todoHas && promoteOk.logHas), JSON.stringify(promoteOk));
  const boardPend = await evalJs(win, `
    [...document.querySelectorAll('.segctl button')].find(x => x.textContent.includes('待办')).click();
    return new Promise(res => setTimeout(() => {
      const sec = document.querySelector('.pend-card');
      res(!!sec && sec.textContent.includes('冒烟：待跟进过期') && sec.textContent.includes('待确认'));
    }, 350));
  `);
  ok('跟进过期的待定事项出现在总览「待确认」分区', !!boardPend);
  await evalJs(win, `[...document.querySelectorAll('.segctl button')].find(x => x.textContent.includes('项目')).click()`);
  await sleep(350);

  // 落盘校验（待办20：项目数据为 projects/*.md，用主进程同款解析回读）
  await sleep(800);
  const Storage = require('../src/storage.js');
  const pdir = path.join(dataDir, 'projects');
  let proj = null;
  try {
    for (const f of fs.readdirSync(pdir)) {
      if (!f.endsWith('.md')) continue;
      const pp = Storage.mdToProject(fs.readFileSync(path.join(pdir, f), 'utf8'));
      if (pp && pp.name === PNAME) proj = pp;
    }
  } catch {}
  const onDisk = proj ? { projects: [proj] } : null;
  if (!proj) {
    const direct = await evalJs(win, `return window.assistant.save({projects:[{id:'diag',name:${JSON.stringify(PNAME)},state:{},logs:[]}],version:1}).then(()=>'OK').catch(e=>'ERR:'+e.message)`);
    await sleep(600);
    onDisk = fs.existsSync(dataFile) ? JSON.parse(fs.readFileSync(dataFile, 'utf8')) : null;
    proj = onDisk && onDisk.projects.find(p => p.name === PNAME);
    ok('数据已原子写入磁盘', !!proj, 'missing direct-save=' + JSON.stringify(direct) + ' file=' + (onDisk ? 'has:' + JSON.stringify(onDisk).slice(0, 120) : 'NONE') + ' storeErr=' + await evalJs(win, `return [...document.querySelectorAll('.toast')].map(t=>t.textContent).join('|')`));
  } else ok('数据已原子写入磁盘', true);
  if (proj) {
    const attrTask = (proj.state.todos || []).find(t => t.title.includes('冒烟：属性任务'));
    ok('磁盘待办含三属性且值正确', !!(attrTask && attrTask.blocked === '冒烟：等待接口' && attrTask.related === '冒烟：关联文档' && attrTask.next === '冒烟：先写mock'), JSON.stringify(attrTask || null));
    ok('磁盘内容含待办且 done=true', proj.state.todos.some(t => t.title.includes('冒烟：一条待办') && t.done));
    ok('磁盘待办到期时间为 ISO', proj.state.todos.some(t => /^\d{4}-\d{2}-\d{2}T/.test(t.due)));
    ok('决策列表结构为对象', Array.isArray(proj.state.decisions));
    /* 待办44：待定池落盘——过期项在列且 ISO、转正项已移出、作废项留档、系统痕迹入 logs */
    const pendOpen = (proj.state.pending || []).filter(x => x.state === 'open');
    ok('磁盘待定池含跟进过期项（ISO）', pendOpen.some(x => x.text === '冒烟：待跟进过期' && /^\d{4}-\d{2}-\d{2}T/.test(x.followUp)), JSON.stringify(proj.state.pending || null));
    ok('磁盘转正项已移出待定池', !pendOpen.some(x => x.text === '冒烟：待定转正') && proj.state.todos.some(t => t.title === '冒烟：待定转正' && /^\d{4}/.test(t.due)));
    ok('磁盘作废项置灰留档不删', (proj.state.pending || []).some(x => x.text === '冒烟：作废留档' && x.state === 'discarded'));
    ok('磁盘历史含待定转正系统记录', proj.logs.some(l => l.system && String(l.message || '').includes('待定转正')));
  }

  // 撤销按钮：无 AI 日志应禁用
  ok('无记录时撤销按钮禁用', !!(await evalJs(win, `
    return (() => { const b = [...document.querySelectorAll('.btn')].find(x => x.textContent.includes('撤销上次更新')); return !b || b.disabled; })();
  `)));

  // 设置弹窗（待办23：经左下角菜单进入）
  await evalJs(win, `document.querySelector('.gearbtn').click()`);
  await sleep(250);
  ok('菜单可弹出', !!(await evalJs(win, `return document.querySelector('.menu-pop') && getComputedStyle(document.querySelector('.menu-pop')).display !== 'none'`)));
  await evalJs(win, `[...document.querySelectorAll('.mitem')].find(b => b.textContent.trim() === '设置').click()`);
  await sleep(350);
  ok('设置弹窗含服务商预设与测试连接', !!(await evalJs(win, `
    return (() => { const d = document.querySelector('.dialog'); return d && d.textContent.includes('DeepSeek') && d.textContent.includes('测试连接'); })();
  `)));
  await evalJs(win, `[...document.querySelectorAll('.dialog .btn')].find(b => b.textContent === '取消').click()`);
  await sleep(250);

  // 搜索过滤
  await evalJs(win, `const el=document.getElementById('sidebar-search');el.value='不存在的名字XYZ';el.dispatchEvent(new Event('input',{bubbles:true}))`);
  await sleep(400);
  ok('搜索无结果显示空提示', !!(await evalJs(win, `return [...document.querySelectorAll('.empty')].some(x => x.textContent.includes('没有匹配'))`)));
  await evalJs(win, `const el=document.getElementById('sidebar-search');el.value=${JSON.stringify(PNAME)};el.dispatchEvent(new Event('input',{bubbles:true}))`);
  await sleep(400);
  const hitDetail = await evalJs(win, `return JSON.stringify({view:document.querySelector('.board')?'board':'project',pnames:[...document.querySelectorAll('.project .pname')].map(x=>x.textContent)})`);
  ok('搜索命中测试项目', !!(await evalJs(win, `return [...document.querySelectorAll('.project .pname')].map(x => x.textContent).join() === ${JSON.stringify(PNAME)}`)), hitDetail);

  // 删除测试项目（两级确认）
  await evalJs(win, `[...document.querySelectorAll('.btn')].find(b => b.textContent.includes('编辑项目')).click()`);
  await sleep(350);
  await evalJs(win, `[...document.querySelectorAll('.dialog .btn')].find(b => b.textContent.includes('删除项目')).click()`);
  await sleep(350);
  await evalJs(win, `[...document.querySelectorAll('.dialog .btn')].find(b => b.textContent.includes('确认删除')).click()`);
  await sleep(800);
  ok('删除测试项目', !!(await evalJs(win, `return ![...document.querySelectorAll('.pname')].some(x => x.textContent === ${JSON.stringify(PNAME)})`)));

  await sleep(500);
  if (backup) fs.writeFileSync(dataFile, backup); // 还原用户原数据文件
  ok('全程渲染层无错误', consoleErrors.length === 0, consoleErrors.slice(0, 5).join(' | '));
  finish();
})().catch(e => { console.log('SMOKE CRASH:', e); finish(1); });

function finish(forceCode) {
  const failed = results.filter(r => !r.pass).length;
  try { fs.writeFileSync(path.join(__dirname, 'smoke-result.txt'), results.map(r => `${r.pass ? 'PASS' : 'FAIL'} ${r.name}${r.detail ? '  — ' + r.detail : ''}`).join('\n') + `\n\n${results.length - failed}/${results.length} passed`); } catch {}
  app.exit(forceCode || (failed ? 1 : 0));
}
