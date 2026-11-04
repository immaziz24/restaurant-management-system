const { contextBridge, ipcRenderer, webFrame } = require('electron');

contextBridge.exposeInMainWorld('kitchenDesktopPrint', {
    requestPrint: () => ipcRenderer.send('kitchen:direct-print')
});

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

ipcRenderer.on('kitchen:print-finished', () => {
    window.dispatchEvent(new Event('afterprint'));
});

ipcRenderer.on('kitchen:print-failed', (_event, message) => {
    window.dispatchEvent(new CustomEvent('kitchen-print-failed', {
        detail: String(message || 'Printer error')
    }));
});
