import { app, BrowserWindow, ipcMain, Menu, dialog } from 'electron';
import { spawn, exec, execFile } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

  // Simple dev check
  win.loadURL('http://localhost:5173').catch(() => {
    win.loadFile(path.join(__dirname, 'dist/index.html'));
  });

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




app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// AOE 1 Launcher Logic with Registry Sync
ipcMain.on('launch-game', (event, { gamePath, username, hostIp }) => {
  console.log('Validating game path:', gamePath);

  if (!fs.existsSync(gamePath)) {
    event.reply('launch-error', `Game not found at: ${gamePath}. Please check your download folder!`);
    return;
  }

  console.log('Synchronizing name:', username);

  const regKeys = [
    'HKCU\\Software\\Microsoft\\Microsoft Games\\Age of Empires\\1.0',
    'HKCU\\Software\\Microsoft\\Microsoft Games\\Age of Empires Expansion\\1.0'
  ];

  const gameDir = path.dirname(gamePath);
  
  // Safe command building
  const commands = regKeys.flatMap(key => [
    `reg add "${key}" /v "Player Name" /t REG_SZ /d "${username}" /f`,
    `reg add "${key}" /v "SetupPath" /t REG_SZ /d "${gameDir}" /f`
  ]);

  console.log('Syncing Registry...');
  exec(commands.join(' && '), (error) => {
    if (error) {
      console.error('Registry Sync Error:', error.message);
    } else {
      console.log('Registry sync successful!');
    }

    // Launch game with potential modern patch arguments
    // Final attempt with common Vietnamese HD patch parameters
    try {
      const args = ['nostartup'];
      if (hostIp) {
        // Some Vietnamese HD versions use -connect or -join=IP
        args.push('-connect', hostIp, '-mp=1');
      }

      console.log('Attempting launch with Vietnamese HD patch flags:', args);
      
      execFile(gamePath, args, { cwd: gameDir }, (err) => {
        if (err) {
          console.error('Arguments rejected by game. Error Code:', err.code);
          
          // Fallback to TRULY clean setup (No arguments at all)
          console.log('Falling back to TRULY normal launch (NO ARGS)...');
          execFile(gamePath, [], { cwd: gameDir });
          event.reply('launch-success', 'Game started! (Auto-join & Intros not supported by this version)');
        } else {
          console.log('Game accepted parameters!');
          event.reply('launch-success', 'Game launched with auto-join flags!');
        }
      });

    } catch (err) {
      console.error('Launch Exception:', err);
      event.reply('launch-error', `System error: ${err.message}`);
    }
  });
});

