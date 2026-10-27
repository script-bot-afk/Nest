'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('nest', {
  info: () => ipcRenderer.invoke('nest:info'),
  start: size => ipcRenderer.invoke('nest:start', size),
  stop: () => ipcRenderer.invoke('nest:stop'),
  launch: id => ipcRenderer.invoke('nest:launch', id),
  windows: () => ipcRenderer.invoke('nest:windows'),
  focus: id => ipcRenderer.invoke('nest:focus', id),
  fullscreen: () => ipcRenderer.invoke('nest:fullscreen'),
  copy: text => ipcRenderer.invoke('nest:copy', text),
  onState: callback => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('nest:state', listener);
    return () => ipcRenderer.removeListener('nest:state', listener);
  }
});
