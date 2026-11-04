'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopTabs', {
  getState: () => ipcRenderer.invoke('tabs:get-state'),
  openDashboard: (department) => ipcRenderer.send('tabs:open-dashboard', department),
  selectTab: (tabId) => ipcRenderer.send('tabs:select', tabId),
  closeTab: (tabId) => ipcRenderer.send('tabs:close', tabId),
  onState: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('tabs:state', listener);
    return () => ipcRenderer.removeListener('tabs:state', listener);
  }
});
