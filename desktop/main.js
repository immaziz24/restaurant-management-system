const { app, BrowserWindow, WebContentsView, ipcMain } = require('electron');
const path = require('path');

const DASHBOARD_CONFIG = {
    kitchen: {
        title: 'Kitchen',
        url: 'https://qrmenu.plateria.in/mughal-e-raj-kitchen-dashboard.html',
        partition: 'persist:mughal-kitchen'
    },
    billing: {
        title: 'Billing',
        url: 'https://qrmenu.plateria.in/mughal-e-raj-billing-dashboard.html',
        partition: 'persist:mughal-billing'
    }
};

const TAB_BAR_HEIGHT = 66;

let mainWindow = null;
let activeTabId = 'home';
const dashboardViews = new Map();

function getTabState() {
    return {
        activeTabId,
        tabs: [
            { id: 'home', title: 'Home', type: 'home' },
            ...Array.from(dashboardViews.entries()).map(([id]) => ({
                id,
                title: DASHBOARD_CONFIG[id].title,
                type: 'dashboard'
            }))
        ]
    };
}

function sendTabState() {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('tabs:state', getTabState());
    }
}

function resizeDashboardViews() {
    if (!mainWindow || mainWindow.isDestroyed()) return;

    const { width, height } = mainWindow.getContentBounds();
    const dashboardBounds = {
        x: 0,
        y: TAB_BAR_HEIGHT,
        width: Math.max(0, width),
        height: Math.max(0, height - TAB_BAR_HEIGHT)
    };

    for (const [id, view] of dashboardViews.entries()) {
        if (id === activeTabId) {
            view.setBounds(dashboardBounds);
        } else {
            // Keep the dashboard loaded, but move it out of the visible area.
            view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
        }
    }
}

function selectTab(tabId) {
    if (tabId !== 'home' && !dashboardViews.has(tabId)) return;

    activeTabId = tabId;
    resizeDashboardViews();
    sendTabState();
}

function openDashboard(department) {
    const config = DASHBOARD_CONFIG[department];
    if (!config || !mainWindow) return;

    // Reuse the existing dashboard view instead of creating another login session.
    if (dashboardViews.has(department)) {
        selectTab(department);
        return;
    }

    const view = new WebContentsView({
        webPreferences: {
            partition: config.partition,
            // Only the Kitchen dashboard receives the narrowly-scoped direct-print bridge.
            ...(department === 'kitchen' ? { preload: path.join(__dirname, 'kitchen-preload.js') } : {}),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true
        }
    });

    dashboardViews.set(department, view);
    mainWindow.contentView.addChildView(view);

    view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

    // Keep dashboard navigation on the trusted restaurant dashboard origin.
    view.webContents.on('will-navigate', (event, navigationUrl) => {
        let parsedUrl;
        try {
            parsedUrl = new URL(navigationUrl);
        } catch {
            event.preventDefault();
            return;
        }

        if (parsedUrl.origin !== 'https://qrmenu.plateria.in') {
            event.preventDefault();
        }
    });

    activeTabId = department;
    resizeDashboardViews();
    sendTabState();

    view.webContents.loadURL(config.url).catch((error) => {
        console.error(`Could not load ${department} dashboard:`, error);
    });
}

function closeDashboard(department) {
    const view = dashboardViews.get(department);
    if (!view) return;

    mainWindow.contentView.removeChildView(view);
    dashboardViews.delete(department);

    if (!view.webContents.isDestroyed()) {
        view.webContents.destroy();
    }

    if (activeTabId === department) {
        activeTabId = 'home';
    }

    resizeDashboardViews();
    sendTabState();
}

function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 1450,
        height: 950,
        minWidth: 1100,
        minHeight: 700,
        title: 'Mughal E Raj | Restaurant Management',
        backgroundColor: '#160B10',
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true
        }
    });

    mainWindow.loadFile('index.html');

    mainWindow.on('resize', resizeDashboardViews);
    mainWindow.on('closed', () => {
        for (const view of dashboardViews.values()) {
            if (!view.webContents.isDestroyed()) {
                view.webContents.destroy();
            }
        }
        dashboardViews.clear();
        mainWindow = null;
        activeTabId = 'home';
    });
}

// Kitchen-only silent printing. The dashboard's existing window.print() call is
// redirected by kitchen-preload.js; no order, login, or Supabase logic is changed.
ipcMain.on('kitchen:direct-print', (event) => {
    const kitchenView = dashboardViews.get('kitchen');
    if (!kitchenView || kitchenView.webContents.isDestroyed()) return;
    // Security check: only the actual Kitchen dashboard webContents may request printing.
    if (event.sender !== kitchenView.webContents) return;

    kitchenView.webContents.print(
        { silent: true, printBackground: true },
        (success, failureReason) => {
            if (kitchenView.webContents.isDestroyed()) return;
            if (success) {
                kitchenView.webContents.send('kitchen:print-finished');
            } else {
                console.error('Kitchen ticket print failed:', failureReason || 'Unknown printer error');
                kitchenView.webContents.send('kitchen:print-failed', failureReason || 'Check the default printer and try again.');
            }
        }
    );
});

ipcMain.handle('tabs:get-state', () => getTabState());

ipcMain.on('tabs:open-dashboard', (_event, department) => {
    if (department === 'kitchen' || department === 'billing') {
        openDashboard(department);
    }
});

ipcMain.on('tabs:select', (_event, tabId) => {
    if (tabId === 'home' || tabId === 'kitchen' || tabId === 'billing') {
        selectTab(tabId);
    }
});

ipcMain.on('tabs:close', (_event, tabId) => {
    if (tabId === 'kitchen' || tabId === 'billing') {
        closeDashboard(tabId);
    }
});

app.whenReady().then(() => {
    createMainWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createMainWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});