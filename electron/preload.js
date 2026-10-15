const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('finmateDesktop', {
  isDesktopApp: true,
  platform: process.platform,
  electronVersion: process.versions.electron,
  nodeVersion: process.versions.node,
  getBranchInfo: () => ipcRenderer.invoke('finmate:get-branch-info'),
  onNavigateTab: (callback) => {
    ipcRenderer.on('navigate-tab', (_event, tabName) => callback(tabName));
  }
});
