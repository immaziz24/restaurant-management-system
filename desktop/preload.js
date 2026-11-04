const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopTabs', {
    openDashboard: (department) => {
        if (department === 'kitchen' || department === 'billing') {
            ipcRenderer.send('tabs:open-dashboard', department);
        }
    },

    selectTab: (tabId) => {
        if (tabId === 'home' || tabId === 'kitchen' || tabId === 'billing') {
            ipcRenderer.send('tabs:select', tabId);
        }
    },

    closeTab: (tabId) => {
        if (tabId === 'kitchen' || tabId === 'billing') {
            ipcRenderer.send('tabs:close', tabId);
        }
    },

    getState: () => ipcRenderer.invoke('tabs:get-state'),

    onState: (callback) => {
        if (typeof callback !== 'function') return () => {};
        const listener = (_event, state) => callback(state);
        ipcRenderer.on('tabs:state', listener);
        return () => ipcRenderer.removeListener('tabs:state', listener);
    }
});