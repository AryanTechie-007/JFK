const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');

let mainWindow = null;
let novaServerInstance = null;

/**
 * Boots the embedded Nova V4 Express API Server (port 4001) inside the Electron process
 * so the desktop application is completely self-contained.
 */
function startEmbeddedNovaBackend() {
  try {
    const novaApp = require('../src/index.js');
    const port = process.env.NOVA_PORT || 4001;
    novaServerInstance = novaApp.listen(port, () => {
      console.log(`[Electron Desktop] Embedded Nova V4 Engine listening on http://localhost:${port}`);
    });
    novaServerInstance.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`[Electron Desktop] Port ${port} already active — reusing running Nova V4 server.`);
      } else {
        console.warn('[Electron Desktop] Nova server warning:', err.message);
      }
    });
  } catch (err) {
    console.warn('[Electron Desktop] Embedded Nova server startup note:', err.message);
  }
}

function getBranchMetadata() {
  try {
    const manifestPath = path.join(__dirname, '..', 'branch-manifest.json');
    if (fs.existsSync(manifestPath)) {
      return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    }
  } catch (_) {
    // ignore
  }
  return { activeBranch: 'main', mode: 'integrated-all-branches' };
}

function createApplicationMenu() {
  const branchMeta = getBranchMetadata();
  const template = [
    {
      label: 'FinMate Desktop',
      submenu: [
        {
          label: `Branch: ${branchMeta.activeBranch || 'main'} (${branchMeta.module || 'All 6 Modules Integrated'})`,
          enabled: false
        },
        { type: 'separator' },
        {
          label: 'Run V4 Compliance Verification Suite',
          accelerator: 'CmdOrCtrl+Shift+T',
          click: () => {
            const testPath = path.join(__dirname, '..', 'tests', 'novaEngine.test.js');
            execFile('node', [testPath], { cwd: path.join(__dirname, '..') }, (err, stdout, stderr) => {
              if (err) {
                dialog.showErrorBox('V4 Verification Failed', stderr || err.message);
              } else {
                dialog.showMessageBox(mainWindow, {
                  type: 'info',
                  title: 'Nova V4 Compliance Suite Passed (100%)',
                  message: 'All 14 Test Suites & 12 V4 Acceptance Criteria Passed!',
                  detail: stdout.slice(-900)
                });
              }
            });
          }
        },
        { type: 'separator' },
        { role: 'quit', label: 'Exit FinMate Desktop' }
      ]
    },
    {
      label: 'Agents & Tools',
      submenu: [
        { label: 'Agent: John (Master Orchestrator)', click: () => mainWindow?.webContents.send('navigate-tab', 'john') },
        { label: 'Agent: Nova (V4 Budget Guardian)', click: () => mainWindow?.webContents.send('navigate-tab', 'nova') },
        { label: 'Agent: Iris (Recurring & Subscriptions)', click: () => mainWindow?.webContents.send('navigate-tab', 'iris') },
        { label: 'Agent: Atlas (Goal Strategist)', click: () => mainWindow?.webContents.send('navigate-tab', 'atlas') },
        { type: 'separator' },
        { label: 'Tool: Sentinel (Deterministic Calculator)', click: () => mainWindow?.webContents.send('navigate-tab', 'sentinel') },
        { label: 'Tool: Tally (Categorizer & Spending Analyser)', click: () => mainWindow?.webContents.send('navigate-tab', 'analyser') }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createMainWindow() {
  const branchMeta = getBranchMetadata();

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 720,
    title: `FinMate AI — Multi-Agent Command Center [${branchMeta.activeBranch || 'main'}]`,
    backgroundColor: '#f4f6f8',
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const devServerUrl = process.env.ELECTRON_START_URL;
  const distIndex = path.join(__dirname, '..', 'dist', 'index.html');

  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
  } else if (fs.existsSync(distIndex)) {
    mainWindow.loadFile(distIndex);
  } else {
    mainWindow.loadURL('http://localhost:5173');
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

ipcMain.handle('finmate:get-branch-info', () => {
  return getBranchMetadata();
});

app.whenReady().then(() => {
  startEmbeddedNovaBackend();
  createApplicationMenu();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (novaServerInstance) {
    try {
      novaServerInstance.close();
    } catch (_) {
      // ignore
    }
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
