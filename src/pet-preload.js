const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('pet', {
  move: (dx, dy) => ipcRenderer.send('pet:move', { dx, dy }),
  drop: () => ipcRenderer.send('pet:drop'),
  click: () => ipcRenderer.send('pet:click'),
  dbl: () => ipcRenderer.send('pet:dblclick'),
  menu: () => ipcRenderer.send('pet:menu'),
  hideMe: () => ipcRenderer.send('pet:hide-me'),
  enter: () => ipcRenderer.send('pet:enter'),
  leave: () => ipcRenderer.send('pet:leave'),
  onState: cb => ipcRenderer.on('pet:state', (_e, s) => cb(s)),
  onSay: cb => ipcRenderer.on('pet:say', (_e, t) => cb(t)),
  onEdge: cb => ipcRenderer.on('pet:edge', (_e, edge) => cb(edge)),
});
