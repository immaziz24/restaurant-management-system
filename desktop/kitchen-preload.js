const { contextBridge, ipcRenderer, webFrame } = require('electron');

// Expose only a single print request; the remote dashboard receives no Node.js access.
contextBridge.exposeInMainWorld('kitchenDesktopPrint', {
    requestPrint: () => ipcRenderer.send('kitchen:direct-print')
});

// Run in the dashboard's main world before its application scripts call window.print().
webFrame.executeJavaScript(`
    (() => {
        window.print = function () {
            if (window.kitchenDesktopPrint && typeof window.kitchenDesktopPrint.requestPrint === 'function') {
                window.kitchenDesktopPrint.requestPrint();
            }
        };
    })();
`).catch((error) => {
    console.error('Could not install Kitchen direct-print handler:', error);
});

// Preserve the dashboard's existing afterprint queue handling after a successful job.
ipcRenderer.on('kitchen:print-finished', () => {
    window.dispatchEvent(new Event('afterprint'));
});

// Surface printer failures without exposing Electron APIs to the dashboard.
ipcRenderer.on('kitchen:print-failed', (_event, message) => {
    window.dispatchEvent(new CustomEvent('kitchen-print-failed', {
        detail: String(message || 'Printer error')
    }));
});