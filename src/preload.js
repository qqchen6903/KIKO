const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('assistant', {
  load: () => ipcRenderer.invoke('data:load'),
  save: data => ipcRenderer.invoke('data:save', data),
  setActive: id => ipcRenderer.invoke('app:setActive', id), /* 待办45②：切换项目只写 index */
  saveSettings: value => ipcRenderer.invoke('settings:save', value),
  updateWithAI: payload => ipcRenderer.invoke('ai:update', payload),
  testProvider: value => ipcRenderer.invoke('provider:test', value),
  toggleTop: value => ipcRenderer.invoke('window:toggle-top', value),
  minimize: () => ipcRenderer.invoke('window:minimize'),
  minimizeTaskbar: () => ipcRenderer.invoke('window:min'),
  maximizeToggle: () => ipcRenderer.invoke('window:max-toggle'),
  quitApp: () => ipcRenderer.invoke('app:quit'),
  exportData: () => ipcRenderer.invoke('data:export'),
  restoreData: () => ipcRenderer.invoke('data:restore'),
  openDataDir: () => ipcRenderer.invoke('app:open-data-dir'),
  getDataDirInfo: () => ipcRenderer.invoke('data:get-info'),
  chooseDataDir: () => ipcRenderer.invoke('data:choose-dir'),
  resetDataDir: () => ipcRenderer.invoke('data:reset-dir'),
  setPetState: state => ipcRenderer.invoke('pet:set-state', state),
  onUiEvent: (name, cb) => { ipcRenderer.on(name, (_e, arg) => cb(arg)); },
});
