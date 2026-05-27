import { app, BrowserWindow, ipcMain, Menu, dialog } from 'electron';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { createLauncherCore } from './electron/launcherCore.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let backendProcess = null;
let launcherCore = null;

app.setName('BP-Arena');

function getBackendExecutablePath() {
  const executableName = process.platform === 'win32' ? 'bp-arena-server.exe' : 'bp-arena-server';

  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'server', executableName);
  }

  return path.join(__dirname, 'resources', 'server', executableName);
}

function startBundledBackend(backendDataDir) {
  const backendPath = getBackendExecutablePath();

  if (!fs.existsSync(backendPath)) {
    console.warn('Bundled backend not found:', backendPath);
    return;
  }

  fs.mkdirSync(backendDataDir, { recursive: true });

  backendProcess = spawn(backendPath, [], {
    cwd: backendDataDir,
    windowsHide: true,
    stdio: 'ignore',
  });

  backendProcess.on('error', (error) => {
    console.error('Failed to start bundled backend:', error.message);
  });

  backendProcess.on('exit', (code) => {
    console.log('Bundled backend exited with code:', code);
    backendProcess = null;
  });
}

function stopBundledBackend() {
  if (backendProcess && !backendProcess.killed) {
    backendProcess.kill();
    backendProcess = null;
  }
}

// Handle game file selection via dialog
ipcMain.handle('select-game-file', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'Executables', extensions: ['exe'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (result.canceled) {
    return null;
  } else {
    return result.filePaths[0];
  }
});


function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 750,
    frame: false, // HIDES THE TITLE BAR AND MENU entirely
    resizable: true,
    backgroundColor: '#0b0e14',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  // Remove menu bar
  Menu.setApplicationMenu(null);

  if (app.isPackaged) {
    win.loadFile(path.join(__dirname, 'dist/index.html'));
  } else {
    win.loadURL('http://localhost:5173').catch(() => {
      win.loadFile(path.join(__dirname, 'dist/index.html'));
    });
  }

  // Window control IPCs
  ipcMain.on('window-minimize', () => win.minimize());
  ipcMain.on('window-maximize', () => {
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  });
  ipcMain.on('window-close', () => win.close());
}




app.whenReady().then(() => {
  launcherCore = createLauncherCore({ app, appDir: __dirname });
  launcherCore.registerIpc(ipcMain);
  startBundledBackend(launcherCore.getBackendDataDir());
  createWindow();
});

app.on('before-quit', stopBundledBackend);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.on('launch-game', (event, { gamePath, username, hostIp }) => {
  if (!launcherCore) {
    event.reply('launch-error', 'Launcher core is not ready yet.');
    return;
  }

  launcherCore.launchGame({ nickname: username, hostIp, gamePath })
    .then(() => event.reply('launch-success', 'Game started.'))
    .catch(error => event.reply('launch-error', error.message));
});

