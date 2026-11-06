const { app, BrowserWindow, Tray, Menu, ipcMain, safeStorage, globalShortcut, nativeImage, Notification, shell, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const Shared = require('./shared.js');
const Storage = require('./storage.js');

/* 品牌更名 KIKO：默认数据目录 %APPDATA%\KIKO，须在首次访问前设置 */
app.setName('KIKO');

/* 单实例锁：重复启动（双击图标多次/安装版与源码版同名）时唤起已有实例，
 * 避免多实例并发读写同一数据目录造成竞态。 */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win && !win.isDestroyed()) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
  });
}

let win, tray, petWin;
let gpuSoftware = false; /* 软件渲染检测：为 true 时渲染层自动关闭磨砂玻璃 */
const petState = { current: 'idle' };
/* 桌宠吸边状态机：edge=吸附方向（null 自由漂浮），hiddenNow=当前是否缩在屏边 */
const petGeom = { edge: null, hiddenNow: false, docked: null, hidden: null, leaveTimer: null, sayTimer: null };

/* 待办19：APP_DIR 放指针配置（config.json），dataRoot 为用户数据实际根目录
 * （默认 APP_DIR，可在设置中改到任意目录）；待办20：项目数据在 dataRoot/projects/*.md */
const APP_DIR = app.getPath('userData');
const CONFIG_FILE = path.join(APP_DIR, 'config.json');
const LEGACY_JSON = path.join(APP_DIR, 'workspace.json');
const DEFAULT_SHORTCUT = 'CommandOrControl+Shift+Space';

function readConfig() { try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch { return {}; } }
function writeConfig(cfg) { Storage.atomicWrite(CONFIG_FILE, JSON.stringify(cfg, null, 2)); }
let dataRoot = (() => {
  const c = readConfig();
  return c.dataDir && fs.existsSync(c.dataDir) ? c.dataDir : APP_DIR;
})();
const keyFile = () => path.join(dataRoot, 'provider.enc');

/* 从更早版本的应用数据目录一次性迁移（旧目录保留不动作为自然备份）。
 * 已建立 md 存储（index.json 存在）后不再复制旧 workspace.json，防止反复启动产生孤儿文件。 */
(function migrateLegacy() {
  try {
    const hasMdStore = fs.existsSync(path.join(APP_DIR, 'index.json'));
    const appData = app.getPath('appData');
    for (const legacy of ['desktop-ai-work-assistant', '桌面AI工作助手']) {
      const dir = path.join(appData, legacy);
      if (!fs.existsSync(dir)) continue;
      for (const f of ['workspace.json', 'provider.enc']) {
        if (f === 'workspace.json' && hasMdStore) continue;
        const s = path.join(dir, f), t = path.join(APP_DIR, f);
        if (fs.existsSync(s) && !fs.existsSync(t)) {
          fs.mkdirSync(APP_DIR, { recursive: true });
          fs.copyFileSync(s, t);
        }
      }
    }
  } catch (e) { console.warn('[迁移]', e.message); }
})();

/* 首次调用时把旧 workspace.json 转为 md 存储（留 .bak 档） */
function readData() {
  try { Storage.ensureMigrated(dataRoot, LEGACY_JSON, Shared); } catch (e) { console.warn('[md迁移]', e.message); }
  try { return Shared.migrate(Storage.loadWorkspace(dataRoot)); }
  catch { return structuredClone(Shared.DEFAULTS); }
}
function writeDataNow(data) {
  Storage.ensureMigrated(dataRoot, LEGACY_JSON, Shared);
  Storage.saveWorkspace(dataRoot, Shared.migrate(data));
}

/* 写入序列化：所有“读-改-写”必须走 queueWrite，防止渲染层整库保存与
 * 主进程局部更新（窗口位置/导出时间/提醒标记）并发时互相覆盖（丢失更新）。 */
let writeChain = Promise.resolve();
function queueWrite(task) {
  const run = writeChain.then(task);
  writeChain = run.catch(err => console.error('[写入失败]', err));
  return run;
}
function saveWorkspace(data) { return queueWrite(() => writeDataNow(data)); }

function getKey() {
  try {
    if (!fs.existsSync(keyFile())) return '';
    const b = fs.readFileSync(keyFile());
    return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(b) : b.toString('utf8');
  } catch { return ''; }
}
function saveKey(key) {
  fs.mkdirSync(dataRoot, { recursive: true });
  const b = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(key) : Buffer.from(key, 'utf8');
  fs.writeFileSync(keyFile(), b, { mode: 0o600 });
}
/* 只改 settings（写 index.json），不重写项目 md */
function patchSettings(patch) {
  return queueWrite(() => {
    const d = readData();
    d.settings = { ...d.settings, ...(typeof patch === 'function' ? patch(d.settings) : patch) };
    Storage.writeIndex(dataRoot, d);
    return d;
  });
}

/* ---------- 窗口：位置尺寸记忆 + 多屏校验 ---------- */
function restoredBounds() {
  try {
    const b = readData().settings.winBounds;
    if (!b || [b.x, b.y, b.width, b.height].some(v => typeof v !== 'number' || v <= 0)) return null;
    const onScreen = screen.getAllDisplays().some(d => {
      const a = d.workArea;
      return b.x >= a.x - 16 && b.x + Math.min(b.width, 200) <= a.x + a.width + 16 && b.y >= a.y - 16 && b.y <= a.y + a.height - 40;
    });
    return onScreen ? b : null;
  } catch { return null; }
}
let boundsTimer = null;
function persistBounds() {
  clearTimeout(boundsTimer);
  boundsTimer = setTimeout(() => {
    try {
      if (!win || win.isDestroyed() || win.isMaximized() || win.isMinimized()) return;
      patchSettings(() => ({ winBounds: win.getBounds() }));
    } catch {}
  }, 800);
}
function createWindow() {
  const opts = {
    width: 1080, height: 760, minWidth: 860, minHeight: 620, show: false, title: 'KIKO',
    backgroundColor: '#edf2fa', autoHideMenuBar: true, roundedCorners: true,
    frame: false, /* 待办22：去原生标题栏（Electron 图标与应用名），页面整体上顶 */
    icon: path.join(__dirname, 'dist', 'kiko', 'icon-main.png'), /* 任务栏熊头图标 */
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
  };
  const b = restoredBounds();
  if (b) Object.assign(opts, b);
  win = new BrowserWindow(opts);
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else win.loadFile(path.join(__dirname, 'dist/index.html'));
  win.once('ready-to-show', () => win.show());
  win.on('close', e => { if (!app.isQuitting) { e.preventDefault(); win.hide(); } });
  win.on('moved', persistBounds); win.on('resized', persistBounds);
}
function showWin() { if (win && !win.isDestroyed()) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } }

/* ---------- 快捷键（可自定义） ---------- */
function registerShortcut() {
  globalShortcut.unregisterAll();
  const acc = readData().settings.shortcut || DEFAULT_SHORTCUT;
  try {
    return globalShortcut.register(acc, () => { if (win.isVisible() && win.isFocused()) win.hide(); else showWin(); }) ? true : `快捷键 ${acc} 被其他程序占用或无效`;
  } catch { return `快捷键 ${acc} 格式无效`; }
}

/* ---------- 托盘 ---------- */
function createTray() {
  let image = nativeImage.createFromPath(path.join(__dirname, 'dist', 'kiko', 'icon-main.png'));
  if (image.isEmpty()) image = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAKElEQVQ4T2NkYGD4z0ABYBw1gGE0DBgYGBhZGBgY/hNgYGABAD9lBQF4Zv7kAAAAAElFTkSuQmCC');
  else image = image.resize({ width: 16, height: 16 });
  tray = new Tray(image);
  tray.setToolTip('KIKO');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开 KIKO', click: showWin },
    { label: '快速记录进展', click: () => { showWin(); win.webContents.send('ui:quick-log'); } },
    { type: 'separator' },
    { label: '桌宠', submenu: [
      { label: '显示到桌面', click: () => { createPet(); patchSettings({ petEnabled: true }); } },
      { label: '隐藏', click: () => { hidePet(); patchSettings({ petEnabled: false }); } },
    ] },
    { label: '设置', click: () => { showWin(); win.webContents.send('ui:open-settings'); } },
    { type: 'separator' },
    { label: '退出', click: () => { app.isQuitting = true; app.quit(); } },
  ]));
  tray.on('double-click', showWin);
}

/* ---------- 桌宠小窗（透明无边框置顶贴纸，形象来自 kiko.png 切图） ---------- */
function petPosition() {
  const wa = screen.getPrimaryDisplay().workArea;
  const def = { x: wa.x + wa.width - 140, y: wa.y + wa.height - 116 };
  const b = readData().settings.petBounds;
  if (b && [b.x, b.y].every(v => typeof v === 'number')) {
    const onScreen = screen.getAllDisplays().some(d => {
      const a = d.workArea;
      return b.x >= a.x - 60 && b.y >= a.y - 60 && b.x <= a.x + a.width - 60 && b.y <= a.y + a.height - 60;
    });
    if (onScreen) return b;
  }
  return def;
}
function createPet() {
  if (petWin && !petWin.isDestroyed()) { petWin.show(); return; }
  petWin = new BrowserWindow({
    width: 128, height: 104, transparent: true, frame: false, alwaysOnTop: true,
    skipTaskbar: true, resizable: false, movable: false, show: false, hasShadow: false, focusable: true,
    webPreferences: { preload: path.join(__dirname, 'pet-preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  const pos = petPosition();
  petWin.setPosition(pos.x, pos.y);
  petWin.setAlwaysOnTop(true, 'screen-saver');
  petWin.loadFile(path.join(__dirname, 'pet.html'));
  petWin.once('ready-to-show', () => {
    petWin.show();
    petWin.webContents.once('did-finish-load', () => { restorePetSnap(); petWin.webContents.send('pet:state', petState.current); petWin.webContents.send('pet:settings', readData().settings); });
  });
}
function hidePet() { if (petWin && !petWin.isDestroyed()) petWin.hide(); }

/* --- 吸边隐藏几何（计算在 shared.edgeSnap，有单测） --- */
function petApplyHidden(on) {
  petGeom.hiddenNow = on;
  const t = on ? petGeom.hidden : petGeom.docked;
  petWin.setPosition(t.x, t.y);
  petWin.webContents.send('pet:edge', on ? petGeom.edge : null);
}
function petSnapFrom(geomX, geomY) {
  const b = geomX !== undefined
    ? { x: geomX, y: geomY, w: petWin.getBounds().width, h: petWin.getBounds().height }
    : (() => { const bb = petWin.getBounds(); return { x: bb.x, y: bb.y, w: bb.width, h: bb.height }; })();
  const wa = screen.getDisplayMatching(geomX !== undefined ? { x: b.x, y: b.y, width: b.w, height: b.h } : petWin.getBounds()).workArea;
  return Shared.edgeSnap(b, wa);
}
function restorePetSnap() {
  if (!petWin || petWin.isDestroyed()) return;
  const s = readData().settings.petBounds;
  if (!s || typeof s.x !== 'number') { const r0 = petSnapFrom(); petGeom.edge = null; petGeom.docked = r0.docked; petGeom.hidden = r0.hidden; petWin.setPosition(r0.docked.x, r0.docked.y); return; }
  /* 只有用户上次“主动拖到边缘吸附收起”（记录里有 edge 标记）才恢复隐藏态；
     旧坐标距离边缘近不再自动吸附，避免升级后桌宠“看起来消失”。 */
  const r = petSnapFrom(s.x, s.y);
  petGeom.docked = r.docked; petGeom.hidden = r.hidden;
  if (s.edge) { petGeom.edge = s.edge; petWin.setPosition(r.hidden.x, r.hidden.y); petGeom.hiddenNow = true; petWin.webContents.send('pet:edge', s.edge); }
  else { petGeom.edge = null; petWin.setPosition(r.docked.x, r.docked.y); petGeom.hiddenNow = false; }
}

function sayOnPet(text) {
  if (!petWin || petWin.isDestroyed() || !petWin.isVisible()) return;
  if (petGeom.edge && petGeom.hiddenNow) petApplyHidden(false);
  petWin.webContents.send('pet:say', text);
  clearTimeout(petGeom.sayTimer);
  if (petGeom.edge) petGeom.sayTimer = setTimeout(() => {
    if (petWin && !petWin.isDestroyed() && !petGeom.hiddenNow) petApplyHidden(true);
  }, 8000);
}

/* ---------- 待办到期提醒（Windows 系统通知） ---------- */
function checkReminders() {
  try {
    const data = readData();
    if (data.settings.remindersOn === false) return;
    const now = Date.now();
    const due = [];
    for (const p of data.projects) {
      for (const t of (p.state && p.state.todos) || []) {
        if (t.done || !t.due || t.remindedAt) continue;
        const ts = Date.parse(t.due);
        if (!isNaN(ts) && ts <= now && now - ts < 6 * 3600e3) due.push({ p, t });
      }
    }
    if (!due.length) return;
    queueWrite(() => {
      const d = readData();
      const touched = new Map();
      for (const { p, t } of due) {
        for (const pp of d.projects) {
          if (pp.id !== p.id) continue;
          for (const tt of (pp.state && pp.state.todos) || []) {
            if (tt.title === t.title && tt.due === t.due && !tt.remindedAt) { tt.remindedAt = Shared.nowIso(); touched.set(pp.id, pp); }
          }
        }
      }
      for (const pp of touched.values()) Storage.touchProject(dataRoot, pp);
    }).then(() => {
      for (const { p, t } of due) {
        const n = new Notification({ title: 'KIKO · 待办提醒', body: `【${p.name}】${t.title}（约定 ${Shared.fmtLong(t.due)}）` });
        n.on('click', showWin);
        n.show();
        sayOnPet(`「${t.title}」到期啦～`);
      }
    });
  } catch {}
}

/* ---------- HTTP：带状态映射的 chat 请求 ---------- */
function friendlyHttpError(status, bodyText) {
  let detail = '';
  try { detail = (JSON.parse(bodyText).error && JSON.parse(bodyText).error.message) || ''; } catch {}
  if (status === 401 || status === 403) return 'API Key 无效或无权限，请在设置中检查密钥。';
  if (status === 402) return '模型账户余额不足，请前往模型服务商网站充值。';
  if (status === 404) return '接口地址或模型名不存在，请检查设置中的 API 地址与模型名称。';
  if (status === 429) return '模型请求被限流（频率或额度超限），请稍后重试。';
  if (status >= 500) return `模型服务商暂时故障（HTTP ${status}），请稍后重试。`;
  return detail || `模型请求失败：HTTP ${status}`;
}
function friendlyNetError(err) {
  const code = (err && err.code) || '';
  if (/ENOTFOUND|EAI_AGAIN/.test(code)) return '无法解析模型服务地址，请检查网络或 API 地址是否拼写正确。';
  if (/ECONNREFUSED|ECONNRESET|ETIMEDOUT|EPIPE/.test(code)) return '连接模型服务失败，请检查网络后重试。';
  if (err && err.message === 'timeout') return '请求超时，请检查网络后重试。';
  return '网络请求失败：' + ((err && err.message) || '未知错误');
}
/* 协议构建在 shared.js（可测），此处只负责发起 HTTP。返回 {status, raw, type} */
function chatOnce({ type, baseUrl, model, key, messages, temperature, jsonMode, maxTokens, timeoutMs }) {
  return new Promise((resolve, reject) => {
    let built;
    try { built = Shared.buildChatRequest({ type, baseUrl, model, key, messages, temperature, jsonMode, maxTokens }); }
    catch { return reject(new Error('API 地址格式无效，需形如 https://api.example.com。')); }
    let url;
    try { url = new URL(built.url); } catch { return reject(new Error('API 地址格式无效，需形如 https://api.example.com。')); }
    const lib = url.protocol === 'http:' ? http : https;
    const body = JSON.stringify(built.body);
    const headers = { ...built.headers, 'Content-Length': Buffer.byteLength(body) };
    const req = lib.request(url, { method: 'POST', headers, timeout: timeoutMs || 90000 }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => resolve({ status: res.statusCode, raw, type: built.type }));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.write(body); req.end();
  });
}

/* ---------- IPC ---------- */
ipcMain.handle('data:load', () => {
  const data = readData();
  let autostart = false;
  try { autostart = app.getLoginItemSettings().openAtLogin; } catch {}
  return {
    data, hasApiKey: !!getKey(), encryptionAvailable: safeStorage.isEncryptionAvailable(),
    autostart, defaultShortcut: DEFAULT_SHORTCUT,
    notificationSupported: Notification.isSupported(), gpuSoftware,
  };
});
ipcMain.handle('data:save', async (_e, data) => { await saveWorkspace(data); return true; });
ipcMain.handle('settings:save', async (_e, { settings, apiKey }) => {
  await patchSettings(settings);
  if (typeof apiKey === 'string' && apiKey.trim()) saveKey(apiKey.trim());
  try { app.setLoginItemSettings({ openAtLogin: !!settings.autostart }); } catch {}
  if (settings.petEnabled === true) createPet();
  else if (settings.petEnabled === false) hidePet();
  if (petWin && !petWin.isDestroyed()) petWin.webContents.send('pet:settings', readData().settings);
  let shortcutResult;
  if (settings.shortcut !== undefined) {
    try { shortcutResult = globalShortcut.isRegistered(settings.shortcut) ? true : registerShortcut(); } catch { shortcutResult = registerShortcut(); }
  }
  return { ok: true, encryptionAvailable: safeStorage.isEncryptionAvailable(), shortcutResult };
});
ipcMain.handle('window:toggle-top', (_e, value) => { win.setAlwaysOnTop(!!value); return !!value; });
ipcMain.handle('window:minimize', () => win.hide());
ipcMain.handle('window:min', () => win.minimize());
ipcMain.handle('window:max-toggle', () => { if (win.isMaximized()) win.unmaximize(); else win.maximize(); return win.isMaximized(); });
ipcMain.handle('app:quit', () => { app.isQuitting = true; app.quit(); });
ipcMain.handle('app:open-data-dir', () => shell.openPath(dataRoot));
ipcMain.handle('data:get-info', () => ({ root: dataRoot, custom: !!readConfig().dataDir }));
ipcMain.handle('data:choose-dir', async () => {
  const { dialog } = require('electron');
  const result = await dialog.showOpenDialog(win, { title: '选择数据存储位置', properties: ['openDirectory', 'createDirectory'] });
  if (result.canceled || !result.filePaths[0]) return { ok: false, cancelled: true };
  const to = result.filePaths[0];
  if (path.resolve(to) === path.resolve(dataRoot)) return { ok: false, message: '选的就是当前目录，无需更改。' };
  const marker = path.join(to, 'index.json');
  if (fs.existsSync(marker)) {
    const answer = await dialog.showMessageBox(win, {
      type: 'warning', buttons: ['合并覆盖', '取消'], defaultId: 1, cancelId: 1,
      title: '目标目录已有 KIKO 数据', message: '所选目录存在 KIKO 数据文件。',
      detail: '同名项目将以当前数据为准覆盖；其他文件保留。建议先对该目录自行备份。',
    });
    if (answer.response !== 0) return { ok: false, cancelled: true };
  } else {
    try {
      const others = fs.readdirSync(to).filter(f => !f.startsWith('~') && f !== 'desktop.ini');
      if (others.length) return { ok: false, message: '目标目录非空且不是 KIKO 数据目录，为避免混淆未切换。请选择空目录或新建目录。' };
    } catch (e) { return { ok: false, message: '无法读取目标目录：' + e.message }; }
  }
  try {
    const from = dataRoot;
    // 先落一次当前数据，再整体复制（原目录保留，不动用户资产）
    writeDataNow(readData());
    Storage.copyTree(from, to);
    writeConfig({ ...readConfig(), dataDir: to });
    dataRoot = to;
    return { ok: true, root: to };
  } catch (e) {
    return { ok: false, message: '迁移失败（当前数据未受影响）：' + e.message };
  }
});
ipcMain.handle('data:reset-dir', async () => {
  const { dialog } = require('electron');
  const answer = await dialog.showMessageBox(win, {
    type: 'question', buttons: ['恢复默认位置', '取消'], defaultId: 1, cancelId: 1,
    title: '恢复默认存储位置', message: '将把数据存储切回默认的应用数据目录。',
    detail: '当前目录里的数据文件会保留（不会删除），但应用将改用默认位置读取。若默认位置已有数据，请注意区分。',
  });
  if (answer.response !== 0) return { ok: false, cancelled: true };
  writeDataNow(readData());
  writeConfig({ ...readConfig(), dataDir: undefined });
  dataRoot = APP_DIR;
  return { ok: true, root: dataRoot };
});
ipcMain.handle('data:export', async () => {
  const { dialog } = require('electron');
  const result = await dialog.showSaveDialog(win, {
    title: '导出项目数据',
    defaultPath: `KIKO备份-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePath) return { ok: false, cancelled: true };
  const saved = await queueWrite(() => {
    const data = readData();
    data.settings.lastExportedAt = Shared.nowIso();
    Storage.writeIndex(dataRoot, data);
    fs.writeFileSync(result.filePath, Storage.exportSnapshot(data));
    return data;
  });
  return { ok: true, projectCount: saved.projects.length };
});
ipcMain.handle('data:restore', async () => {
  const { dialog } = require('electron');
  const result = await dialog.showOpenDialog(win, { title: '选择备份文件恢复', filters: [{ name: 'JSON 备份', extensions: ['json'] }], properties: ['openFile'] });
  if (result.canceled || !result.filePaths[0]) return { ok: false, cancelled: true };
  let obj;
  try { obj = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8')); }
  catch { return { ok: false, message: '备份文件不是有效的 JSON，无法恢复。当前数据未改动。' }; }
  const check = Shared.validateWorkspaceFile(obj);
  if (!check.ok) return { ok: false, message: check.message + ' 当前数据未改动。' };
  const summary = await queueWrite(() => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const cur = readData();
    if (cur.projects.length) {
      const archDir = path.join(dataRoot, 'archive');
      fs.mkdirSync(archDir, { recursive: true });
      fs.writeFileSync(path.join(archDir, `pre-restore-${stamp}.json`), Storage.exportSnapshot(cur));
    }
    check.db.settings = { ...check.db.settings, winBounds: cur.settings.winBounds, petBounds: cur.settings.petBounds };
    writeDataNow(check.db);
    return { projectCount: check.projectCount, logCount: check.logCount };
  });
  return { ok: true, ...summary };
});
ipcMain.handle('provider:test', async (_e, { baseUrl, model, providerType }) => {
  const key = getKey();
  if (!key) return { ok: false, message: '尚未保存 API Key，请先填写。' };
  const type = Shared.PROTOCOLS.includes(providerType) ? providerType : 'openai';
  const started = Date.now();
  try {
    const res = await chatOnce({ type, baseUrl, model, key, messages: [{ role: 'user', content: 'ping' }], maxTokens: 16, jsonMode: false, timeoutMs: 20000 });
    if (res.status >= 200 && res.status < 300) return { ok: true, ms: Date.now() - started };
    return { ok: false, message: friendlyHttpError(res.status, res.raw) };
  } catch (err) {
    return { ok: false, message: friendlyNetError(err) };
  }
});
ipcMain.handle('ai:update', async (_e, payload) => {
  const key = getKey();
  if (!key) return { ok: false, message: '请先在设置中填写 API Key。' };
  const data = readData();
  const type = Shared.PROTOCOLS.includes(data.settings.providerType) ? data.settings.providerType : 'openai';
  const baseUrl = data.settings.baseUrl || (type === 'anthropic' ? 'https://token-plan.cn-beijing.maas.aliyuncs.com/apps/anthropic' : 'https://api.deepseek.com');
  const model = data.settings.model || (type === 'anthropic' ? 'claude-sonnet-5-5' : 'deepseek-chat');
  const project = payload.project;
  if (!project || !project.id) return { ok: false, message: '项目数据无效，请刷新后重试。' };
  const prompt = [
    '你是一个严谨的项目工作记忆助手。根据用户新输入，更新项目结构化记录。只返回 JSON，不要 Markdown。',
    'JSON 格式：{"summary":"一句话当前概况","completed":["..."],"inProgress":["..."],"blockers":["..."],"nextSteps":["..."],"todos":[{"title":"...","due":"YYYY-MM-DD HH:mm 或今天/明天 18:00 之类，没有就留空","priority":"高/普通/低","done":false}],"decisions":["新的关键决策"],"conflicts":["新旧信息冲突点"]}',
    '规则：',
    '1. 保留旧记录中仍有效的内容；completed 与 decisions 只能追加，绝不删除或改写旧条目。',
    '2. inProgress、blockers、nextSteps 反映当前真实状态：已解决的问题从 blockers 移除并在 completed 中以一句话记录。',
    '3. 新信息与旧信息冲突时不要擅自覆盖，把冲突写进 conflicts，由用户确认。',
    '4. 从输入中提取带时间的承诺写入 todos；没有把握的日期一律留空，不要编造。',
    `当前项目：${project.name}（目标：${project.goal || '未填写'}）`,
    `旧记录：${JSON.stringify(project.state || {})}`,
    `最近历史：${JSON.stringify((project.logs || []).slice(-8).map(l => ({ at: l.at, message: l.message })))}`,
    `用户新输入：${payload.message}`,
  ].join('\n');
  const messages = [{ role: 'system', content: '你是项目记忆整理器。输出合法 JSON，不输出任何其他文字。' }, { role: 'user', content: prompt }];
  let res;
  try {
    res = await chatOnce({ type, baseUrl, model, key, messages, temperature: 0.2, jsonMode: true, maxTokens: type === 'anthropic' ? 4096 : undefined, timeoutMs: 90000 });
    if (type === 'openai' && (res.status === 400 || res.status === 422) && /response_format/i.test(res.raw)) {
      res = await chatOnce({ type, baseUrl, model, key, messages, temperature: 0.2, jsonMode: false, timeoutMs: 90000 });
    }
    if (res.status < 200 || res.status >= 300) return { ok: false, message: friendlyHttpError(res.status, res.raw) };
    let parsed;
    try { parsed = JSON.parse(res.raw); } catch { return { ok: false, message: '模型返回内容无法解析（不是接口 JSON），本次结果已丢弃，原数据未改动。' }; }
    const content = Shared.parseChatContent(res.type, parsed);
    let obj = null;
    if (content) {
      try { obj = JSON.parse(content); }
      catch {
        const m = String(content).match(/\{[\s\S]*\}/);
        if (m) { try { obj = JSON.parse(m[0]); } catch {} }
      }
    }
    if (!obj) return { ok: false, message: 'AI 没有返回有效 JSON，本次结果已丢弃，原数据未改动。请重试或检查模型是否支持结构化输出。' };
    const check = Shared.validateAiResult(obj);
    if (!check.ok) return { ok: false, message: check.errors.join('') };
    return { ok: true, value: check.value, errors: check.errors };
  } catch (err) {
    return { ok: false, message: friendlyNetError(err) };
  }
});

/* ---------- 应用生命周期 ---------- */
app.whenReady().then(() => {
  try {
    const gpu = app.getGPUFeatureStatus();
    gpuSoftware = /software|disabled/.test(String(gpu.gpu_compositing || '')) || /software|disabled/.test(String(gpu.rasterization || ''));
    console.info('[GPU]', JSON.stringify(gpu), gpuSoftware ? '→ 软件渲染，已自动降级低效果模式' : '');
  } catch {}
  try { app.setLoginItemSettings({ openAtLogin: !!readData().settings.autostart }); } catch {}
  createWindow();
  createTray();
  if (readData().settings.petEnabled !== false) createPet();
  const sc = registerShortcut();
  if (typeof sc === 'string') console.warn('[启动]', sc);
  setTimeout(checkReminders, 15000);
  setInterval(checkReminders, 60000);
});

/* ---------- 桌宠 IPC（拖动/吸边/探出） ---------- */
ipcMain.on('pet:move', (_e, { dx, dy }) => {
  if (!petWin || petWin.isDestroyed()) return;
  clearTimeout(petGeom.leaveTimer);
  if (petGeom.hiddenNow) {
    /* 抓住屏边露出的一小条直接开始拖动：先恢复完整窗位再叠加位移 */
    petGeom.hiddenNow = false;
    petWin.setPosition(petGeom.docked.x + dx, petGeom.docked.y + dy);
    petWin.webContents.send('pet:edge', null);
  } else {
    const [x, y] = petWin.getPosition();
    petWin.setPosition(x + dx, y + dy, false);
  }
});
ipcMain.on('pet:drop', () => {
  if (!petWin || petWin.isDestroyed()) return;
  const r = petSnapFrom();
  petGeom.edge = r.edge; petGeom.docked = r.docked; petGeom.hidden = r.hidden;
  if (r.edge) { petWin.setPosition(r.hidden.x, r.hidden.y); petGeom.hiddenNow = true; }
  else { petWin.setPosition(r.docked.x, r.docked.y); petGeom.hiddenNow = false; }
  petWin.webContents.send('pet:edge', r.edge);
  patchSettings({ petBounds: { x: r.docked.x, y: r.docked.y, edge: r.edge } });
});
ipcMain.on('pet:enter', () => {
  clearTimeout(petGeom.leaveTimer);
  if (petGeom.edge && petGeom.hiddenNow) petApplyHidden(false);  /* 鼠标靠近 → 探出 */
});
ipcMain.on('pet:leave', () => {
  if (petGeom.edge && !petGeom.hiddenNow) {
    petGeom.leaveTimer = setTimeout(() => {
      if (petWin && !petWin.isDestroyed()) petApplyHidden(true); /* 离开一会儿 → 缩回 */
    }, 900);
  }
});
ipcMain.on('pet:click', showWin);
ipcMain.on('pet:dblclick', () => { showWin(); win.webContents.send('ui:quick-log'); });
ipcMain.on('pet:hide-me', () => { hidePet(); patchSettings({ petEnabled: false }); });
ipcMain.on('pet:menu', () => {
  if (!petWin || petWin.isDestroyed()) return;
  const action = name => { if (petWin && !petWin.isDestroyed()) petWin.webContents.send('pet:action', name); };
  Menu.buildFromTemplate([
    { label: '和 KIKO 玩', submenu: [
      { label: '蹦蹦跳跳', click: () => action('jump') },
      { label: '打滚', click: () => action('roll') },
      { label: '拍肚皮', click: () => action('belly') },
      { label: '挥手打招呼', click: () => action('wave') },
      { label: '伸懒腰', click: () => action('stretch') },
      { label: '睡一会儿', click: () => { action('sleep'); petWin.webContents.send('pet:state', 'sleeping'); } },
    ] },
    { type: 'separator' },
    { label: '打开 KIKO', click: showWin },
    { label: '快速记录进展', click: () => { showWin(); win.webContents.send('ui:quick-log'); } },
    { type: 'separator' },
    { label: '隐藏桌宠', click: () => { hidePet(); patchSettings({ petEnabled: false }); } },
  ]).popup({ window: petWin });
});
ipcMain.handle('pet:set-state', (_e, state) => {
  petState.current = String(state || 'idle');
  if (petWin && !petWin.isDestroyed()) petWin.webContents.send('pet:state', petState.current);
  return true;
});
app.on('before-quit', () => { app.isQuitting = true; globalShortcut.unregisterAll(); });
app.on('window-all-closed', () => {});
