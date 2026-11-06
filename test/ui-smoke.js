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
function ok(name, cond, detail) { results.push({ name, pass: !!cond, detail: detail || '' }); console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${cond ? '' : (detail ? ' — ' + detail : '')}`); }
async function evalJs(win, code) {
  try { return await win.webContents.executeJavaScript(`(async()=>{${code}})()`); }
  catch (e) { return { __error: String(e) }; }
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

  // 手动添加：已完成
  const cardFinder = (label) => `[...document.querySelectorAll('.card')].find(c => c.querySelector('h3')?.textContent.includes(${label}))`;
  const addedDone = await evalJs(win, `
    const card = ${cardFinder("'已完成'")};
    card.querySelector('.addbtn').click();
    return new Promise(res => setTimeout(() => {
      const inp = card.querySelector('.addrow input');
      if (!inp) return res(false);
      inp.value = '冒烟：已完成一条'; inp.dispatchEvent(new Event('input', { bubbles: true }));
      setTimeout(() => { inp.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
        setTimeout(() => res([...card.querySelectorAll('.txt')].some(x => x.textContent.includes('冒烟：已完成一条'))), 500); }, 100);
    }, 200));
  `);
  ok('手动添加已完成条目并回显', !!addedDone);

  // 添加卡点 → 状态切换
  const addedBlock = await evalJs(win, `
    const card = ${cardFinder("'当前卡点'")};
    card.querySelector('.addbtn').click();
    return new Promise(res => setTimeout(() => {
      const inp = card.querySelector('.addrow input');
      inp.value = '冒烟：存在一个卡点'; inp.dispatchEvent(new Event('input', { bubbles: true }));
      setTimeout(() => { inp.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
        setTimeout(() => res([...card.querySelectorAll('.txt')].some(x => x.textContent.includes('存在一个卡点'))), 500); }, 100);
    }, 200));
  `);
  ok('添加卡点条目', !!addedBlock);
  const statusWait = await evalJs(win, `return [...document.querySelectorAll('.pmeta span')].some(x => x.textContent.includes('等待处理'))`);
  ok('项目状态自动切换为「等待处理」', !!statusWait);

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
            row = [...card.querySelectorAll('.trow')].find(r => r.textContent.includes('冒烟：一条待办'));
            res({ found: true, dueShown, doneClass: row.className.includes('done') });
          }, 350);
        }, 500); }, 100);
    }, 200));
  `);
  ok('待办添加并显示到期时间', !!(todoOk && todoOk.found && todoOk.dueShown), JSON.stringify(todoOk));
  ok('待办勾选变为完成态', !!(todoOk && todoOk.doneClass), JSON.stringify(todoOk));

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
    ok('磁盘内容含已完成条目', proj.state.completed.some(x => x.includes('冒烟：已完成一条')));
    ok('磁盘内容含待办且 done=true', proj.state.todos.some(t => t.title.includes('冒烟：一条待办') && t.done));
    ok('磁盘待办到期时间为 ISO', !!(proj.state.todos[0] && /^\d{4}-\d{2}-\d{2}T/.test(proj.state.todos[0].due)));
    ok('决策列表结构为对象', Array.isArray(proj.state.decisions));
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
