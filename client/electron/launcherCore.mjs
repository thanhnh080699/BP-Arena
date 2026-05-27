import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { execFile, spawn } from 'child_process';

const fsPromises = fs.promises;

const GAME_EXES = [
  'Empiresxhd.exe',
  'Empiresx.exe',
  'Empiresxhdr.exe',
  'Empiresxr.exe',
  'EmpiresxhdM.exe',
  'EmpiresxM.exe',
  'EmpiresxhdrM.exe',
  'EmpiresxrM.exe',
];

const REGISTRY_KEYS = [
  'HKCU\\Software\\Microsoft\\Microsoft Games\\Age of Empires\\1.0',
  'HKCU\\Software\\Microsoft\\Microsoft Games\\Age of Empires Expansion\\1.0',
];

function execFileAsync(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, options, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }

      resolve({ stdout, stderr });
    });
  });
}

async function pathExists(targetPath) {
  try {
    await fsPromises.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function hashFile(filePath) {
  const hash = crypto.createHash('sha256');
  const stream = fs.createReadStream(filePath);

  return new Promise((resolve, reject) => {
    stream.on('data', chunk => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function parseCsvLine(line) {
  const fields = [];
  let current = '';
  let quoted = false;

  for (const char of line) {
    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === ',' && !quoted) {
      fields.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  fields.push(current);
  return fields;
}

export function createLauncherCore({ app, appDir }) {
  const userDataDir = app.getPath('userData');
  const serverDataDir = path.join(userDataDir, 'server');
  const runtimePath = path.join(userDataDir, 'games', 'AOE-HD');
  const settingsPath = path.join(userDataDir, 'settings.json');
  const logsDir = path.join(userDataDir, 'logs');
  const automationTracesDir = path.join(userDataDir, 'automation-traces');
  const launcherLogPath = path.join(logsDir, 'launcher.log');
  const repoRoot = path.resolve(appDir, '..');
  const sourceGamePath = app.isPackaged
    ? path.join(process.resourcesPath, 'game', 'AOE-HD')
    : path.join(repoRoot, 'game', 'AOE-HD');
  const cncDdrawDllPath = app.isPackaged
    ? path.join(process.resourcesPath, 'patches', 'cnc-ddraw', 'ddraw.dll')
    : path.join(appDir, 'resources', 'patches', 'cnc-ddraw', 'ddraw.dll');
  const manifestPath = app.isPackaged
    ? path.join(process.resourcesPath, 'manifests', 'aoe-hd.json')
    : path.join(appDir, 'resources', 'manifests', 'aoe-hd.json');

  let gameProcess = null;
  let directPlayCache = null;

  const defaultSettings = {
    schemaVersion: 1,
    runtimePath,
    sourceGamePath,
    exeName: 'Empiresxhd.exe',
    nickname: '',
    resolution: {
      width: 1024,
      height: 768,
    },
    windowMode: 'windowed',
    renderer: 'gdi',
    mods: {},
    matchmaking: {
      apiBaseUrl: 'http://localhost:8081',
      preferredNetwork: 'direct-lan',
    },
    patches: {
      cncDdraw: false,
      cncDdrawLaunchEnabled: true,
      upatchHd: true,
    },
    launchArgs: [],
    automationProfile: 'aoe-ror-1024x768-windowed',
  };

  async function ensureDirs() {
    await fsPromises.mkdir(serverDataDir, { recursive: true });
    await fsPromises.mkdir(logsDir, { recursive: true });
    await fsPromises.mkdir(automationTracesDir, { recursive: true });
  }

  async function log(message, level = 'info') {
    await ensureDirs();
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      message,
    });
    await fsPromises.appendFile(launcherLogPath, `${line}\n`, 'utf8');
    console[level === 'error' ? 'error' : 'log'](`[launcher] ${message}`);
  }

  async function loadSettings() {
    await ensureDirs();

    if (!(await pathExists(settingsPath))) {
      await saveSettings(defaultSettings);
      return { ...defaultSettings };
    }

    try {
      const raw = await fsPromises.readFile(settingsPath, 'utf8');
      const stored = JSON.parse(raw);
      return normalizeSettings(stored);
    } catch (error) {
      await log(`Settings file was invalid, resetting defaults: ${error.message}`, 'error');
      await saveSettings(defaultSettings);
      return { ...defaultSettings };
    }
  }

  function normalizeSettings(settings) {
    return {
      ...defaultSettings,
      ...settings,
      runtimePath: settings.runtimePath || runtimePath,
      sourceGamePath: settings.sourceGamePath || sourceGamePath,
      resolution: {
        ...defaultSettings.resolution,
        ...(settings.resolution || {}),
      },
      patches: {
        ...defaultSettings.patches,
        ...(settings.patches || {}),
      },
      matchmaking: {
        ...defaultSettings.matchmaking,
        ...(settings.matchmaking || {}),
      },
      mods: settings.mods || {},
      launchArgs: Array.isArray(settings.launchArgs) ? settings.launchArgs : defaultSettings.launchArgs,
    };
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function runPowerShell(script) {
    return execFileAsync('powershell', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      script,
    ]);
  }

  async function saveSettings(settings) {
    await ensureDirs();
    const normalized = normalizeSettings(settings);
    await fsPromises.writeFile(settingsPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
    return normalized;
  }

  async function loadManifest() {
    if (!(await pathExists(manifestPath))) {
      return null;
    }

    const raw = await fsPromises.readFile(manifestPath, 'utf8');
    return JSON.parse(raw.replace(/^\uFEFF/, ''));
  }

  async function verifyRuntime(settings = null) {
    const currentSettings = settings || await loadSettings();
    const manifest = await loadManifest();
    const missing = [];
    const mismatched = [];
    const keyFiles = ['Empiresxhd.exe', 'data/wndmode.ini', 'data/graphic.drs'];

    if (!(await pathExists(currentSettings.runtimePath))) {
      return {
        installed: false,
        verified: false,
        missing: ['runtime directory'],
        mismatched: [],
        manifestEntries: manifest?.files?.length || 0,
      };
    }

    if (manifest?.files?.length) {
      for (const entry of manifest.files) {
        const filePath = path.join(currentSettings.runtimePath, entry.path);
        if (!(await pathExists(filePath))) {
          missing.push(entry.path);
          continue;
        }

        const stat = await fsPromises.stat(filePath);
        if (stat.size !== entry.size) {
          mismatched.push(entry.path);
          continue;
        }

        const digest = await hashFile(filePath);
        if (digest !== entry.sha256) {
          mismatched.push(entry.path);
        }
      }
    } else {
      for (const file of keyFiles) {
        if (!(await pathExists(path.join(currentSettings.runtimePath, file)))) {
          missing.push(file);
        }
      }
    }

    return {
      installed: true,
      verified: missing.length === 0 && mismatched.length === 0,
      missing,
      mismatched,
      manifestEntries: manifest?.files?.length || 0,
    };
  }

  function createDdrawIni(settings) {
    const width = Number(settings.resolution?.width) || defaultSettings.resolution.width;
    const height = Number(settings.resolution?.height) || defaultSettings.resolution.height;
    const windowed = settings.windowMode !== 'fullscreen';
    const fullscreen = settings.windowMode === 'fullscreen' || settings.windowMode === 'borderless';
    const border = settings.windowMode !== 'borderless';

    return [
      '[ddraw]',
      `width=${width}`,
      `height=${height}`,
      `fullscreen=${fullscreen ? 'true' : 'false'}`,
      `windowed=${windowed ? 'true' : 'false'}`,
      'maintas=true',
      'boxing=false',
      'maxfps=120',
      'vsync=false',
      'adjmouse=true',
      `renderer=${settings.renderer || defaultSettings.renderer}`,
      `border=${border ? 'true' : 'false'}`,
      `toggle_borderless=${settings.windowMode === 'borderless' ? 'true' : 'false'}`,
      '',
    ].join('\n');
  }

  async function applyCncDdraw(settings = null) {
    const currentSettings = settings || await loadSettings();
    if (!(await pathExists(cncDdrawDllPath))) {
      throw new Error(`cnc-ddraw ddraw.dll not found at ${cncDdrawDllPath}`);
    }

    await fsPromises.mkdir(currentSettings.runtimePath, { recursive: true });
    await fsPromises.copyFile(cncDdrawDllPath, path.join(currentSettings.runtimePath, 'ddraw.dll'));
    await fsPromises.writeFile(path.join(currentSettings.runtimePath, 'ddraw.ini'), createDdrawIni(currentSettings), 'utf8');

    const nextSettings = await saveSettings({
      ...currentSettings,
      patches: {
        ...currentSettings.patches,
        cncDdraw: true,
      },
    });

    await log('Applied cnc-ddraw patch to game runtime.');
    return nextSettings;
  }

  async function installRuntime({ repair = false } = {}) {
    const settings = await loadSettings();
    if (!(await pathExists(sourceGamePath))) {
      throw new Error(`Source game path not found: ${sourceGamePath}`);
    }

    await fsPromises.mkdir(path.dirname(settings.runtimePath), { recursive: true });

    if (repair && await pathExists(settings.runtimePath)) {
      await fsPromises.rm(settings.runtimePath, { recursive: true, force: true });
    }

    if (repair || !(await pathExists(settings.runtimePath))) {
      await log(`Copying game runtime from ${sourceGamePath}`);
      await fsPromises.cp(sourceGamePath, settings.runtimePath, {
        recursive: true,
        force: true,
      });
    }

    const nextSettings = await applyCncDdraw({
      ...settings,
      runtimePath: settings.runtimePath,
      sourceGamePath,
    });

    const verification = await verifyRuntime(nextSettings);
    await log(`Runtime ${repair ? 'repair' : 'install'} completed. Verified: ${verification.verified}`);
    return {
      settings: nextSettings,
      verification,
    };
  }

  async function getRunningGameProcesses() {
    if (process.platform !== 'win32') {
      return [];
    }

    try {
      const { stdout } = await execFileAsync('tasklist', ['/FO', 'CSV', '/NH']);
      return stdout
        .split(/\r?\n/)
        .filter(Boolean)
        .map(parseCsvLine)
        .filter(fields => GAME_EXES.some(exe => exe.toLowerCase() === fields[0]?.toLowerCase()))
        .map(fields => ({
          name: fields[0],
          pid: Number(fields[1]),
          memory: fields[4],
        }));
    } catch (error) {
      await log(`Could not read tasklist: ${error.message}`, 'error');
      return [];
    }
  }

  async function syncGameRegistry(username, gameDir) {
    const operations = REGISTRY_KEYS.flatMap(key => [
      ['add', key, '/v', 'Player Name', '/t', 'REG_SZ', '/d', username || 'Player', '/f'],
      ['add', key, '/v', 'SetupPath', '/t', 'REG_SZ', '/d', gameDir, '/f'],
    ]);

    for (const args of operations) {
      await execFileAsync('reg', args);
    }

    await log(`Registry synced for ${username || 'Player'}.`);
  }

  async function setCncDdrawLaunchState(settings, enabled) {
    const dllPath = path.join(settings.runtimePath, 'ddraw.dll');
    const disabledDllPath = path.join(settings.runtimePath, 'ddraw.dll.disabled');
    const iniPath = path.join(settings.runtimePath, 'ddraw.ini');
    const disabledIniPath = path.join(settings.runtimePath, 'ddraw.ini.disabled');

    if (enabled) {
      if (await pathExists(disabledDllPath)) {
        if (await pathExists(dllPath)) {
          await fsPromises.rm(dllPath, { force: true });
        }
        await fsPromises.rename(disabledDllPath, dllPath);
      }
      if (await pathExists(disabledIniPath)) {
        if (await pathExists(iniPath)) {
          await fsPromises.rm(iniPath, { force: true });
        }
        await fsPromises.rename(disabledIniPath, iniPath);
      }
      return;
    }

    if (await pathExists(dllPath)) {
      if (await pathExists(disabledDllPath)) {
        await fsPromises.rm(disabledDllPath, { force: true });
      }
      await fsPromises.rename(dllPath, disabledDllPath);
    }
    if (await pathExists(iniPath)) {
      if (await pathExists(disabledIniPath)) {
        await fsPromises.rm(disabledIniPath, { force: true });
      }
      await fsPromises.rename(iniPath, disabledIniPath);
    }
  }

  async function spawnGameProcess(gamePath, args, settings, label) {
    const child = spawn(gamePath, args, {
      cwd: settings.runtimePath,
      detached: false,
      windowsHide: false,
      stdio: 'ignore',
    });

    gameProcess = child;
    await log(`Launched ${path.basename(gamePath)} with pid ${child.pid}${label ? ` (${label})` : ''}.`);

    return new Promise((resolve) => {
      let settled = false;
      const earlyExitMs = 4500;

      const finish = result => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      child.once('error', error => {
        gameProcess = null;
        finish({
          running: false,
          earlyExit: true,
          error,
        });
      });

      child.once('exit', code => {
        log(`Game process exited with code ${code}${label ? ` (${label})` : ''}.`).catch(() => {});
        if (gameProcess?.pid === child.pid) {
          gameProcess = null;
        }
        finish({
          running: false,
          earlyExit: true,
          code,
        });
      });

      setTimeout(() => {
        finish({
          running: true,
          earlyExit: false,
          pid: child.pid,
        });
      }, earlyExitMs);
    });
  }

  async function launchGame(options = {}) {
    let settings = await loadSettings();
    if (options.gamePath) {
      settings = await saveSettings({
        ...settings,
        runtimePath: path.dirname(options.gamePath),
        exeName: path.basename(options.gamePath),
      });
    }

    const verification = await verifyRuntime(settings);
    if (!verification.installed || !verification.verified) {
      const result = await installRuntime({ repair: !verification.installed });
      settings = result.settings;
    }

    const exeName = options.exeName || settings.exeName;
    const gamePath = path.join(settings.runtimePath, exeName);
    if (!(await pathExists(gamePath))) {
      throw new Error(`Game executable not found: ${gamePath}`);
    }

    const nickname = options.nickname || settings.nickname || 'Player';
    await syncGameRegistry(nickname, settings.runtimePath);

    if (settings.patches?.cncDdraw !== false && settings.patches?.cncDdrawLaunchEnabled !== false) {
      await applyCncDdraw(settings);
    }

    const args = Array.isArray(options.launchArgs)
      ? options.launchArgs
      : Array.isArray(settings.launchArgs)
        ? settings.launchArgs
        : [];

    if (options.hostIp) {
      await log(`Host IP ${options.hostIp} received for join flow. UI automation will handle DirectPlay join in a later step.`);
    }

    const firstLaunch = await spawnGameProcess(gamePath, args, settings, 'primary');
    if (firstLaunch.error) {
      throw firstLaunch.error;
    }

    if (!firstLaunch.earlyExit) {
      return {
        ...(await getStatus()),
        launch: {
          ok: true,
          fallbackUsed: false,
          pid: firstLaunch.pid,
        },
      };
    }

    const ddrawPath = path.join(settings.runtimePath, 'ddraw.dll');
    if (await pathExists(ddrawPath)) {
      await log('Game exited immediately after launch. Retrying once with cnc-ddraw disabled for this runtime.', 'error');
      await setCncDdrawLaunchState(settings, false);
      const fallbackLaunch = await spawnGameProcess(gamePath, [], settings, 'cnc-ddraw disabled fallback');
      if (fallbackLaunch.error) {
        throw fallbackLaunch.error;
      }
      if (!fallbackLaunch.earlyExit) {
        return {
          ...(await getStatus()),
          launch: {
            ok: true,
            fallbackUsed: true,
            reason: 'primary_early_exit',
            pid: fallbackLaunch.pid,
          },
        };
      }
    }

    throw new Error(`Game exited immediately after launch${firstLaunch.code !== undefined ? ` with code ${firstLaunch.code}` : ''}. Check launcher.log for the failing executable and patch state.`);
  }

  async function stopGame(pid = null) {
    const targetPid = pid || gameProcess?.pid;
    if (!targetPid) {
      const running = await getRunningGameProcesses();
      if (!running.length) {
        return getStatus();
      }
      return stopGame(running[0].pid);
    }

    if (process.platform === 'win32') {
      await execFileAsync('taskkill', ['/PID', String(targetPid), '/T', '/F']);
    } else if (gameProcess && gameProcess.pid === targetPid) {
      gameProcess.kill();
    }

    await log(`Stopped game process ${targetPid}.`);
    if (gameProcess?.pid === targetPid) {
      gameProcess = null;
    }

    return getStatus();
  }

  async function focusGame(pid = null) {
    const targetPid = pid || gameProcess?.pid || (await getRunningGameProcesses())[0]?.pid;
    if (!targetPid || process.platform !== 'win32') {
      return { focused: false, pid: targetPid || null };
    }

    const command = `
$type = @"
using System;
using System.Runtime.InteropServices;
public class User32 {
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@
Add-Type $type -ErrorAction SilentlyContinue
$p = Get-Process -Id ${Number(targetPid)} -ErrorAction SilentlyContinue
if ($p -and $p.MainWindowHandle -ne 0) {
  [User32]::ShowWindow($p.MainWindowHandle, 9) | Out-Null
  [User32]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
  "focused"
} else {
  "missing-window"
}
`;

    const { stdout } = await runPowerShell(command);
    const focused = stdout.includes('focused');
    await log(`${focused ? 'Focused' : 'Could not focus'} game process ${targetPid}.`);
    return { focused, pid: targetPid };
  }

  async function getGameWindowInfo(pid = null) {
    const targetPid = pid || gameProcess?.pid || (await getRunningGameProcesses())[0]?.pid;
    if (!targetPid || process.platform !== 'win32') {
      return null;
    }

    const command = `
$type = @"
using System;
using System.Runtime.InteropServices;
public class User32Rect {
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
}
"@
Add-Type $type -ErrorAction SilentlyContinue
$p = Get-Process -Id ${Number(targetPid)} -ErrorAction SilentlyContinue
if ($p -and $p.MainWindowHandle -ne 0) {
  $rect = New-Object User32Rect+RECT
  [User32Rect]::GetWindowRect($p.MainWindowHandle, [ref]$rect) | Out-Null
  [PSCustomObject]@{
    pid = $p.Id
    processName = $p.ProcessName
    title = $p.MainWindowTitle
    handle = $p.MainWindowHandle.ToInt64()
    left = $rect.Left
    top = $rect.Top
    right = $rect.Right
    bottom = $rect.Bottom
    width = $rect.Right - $rect.Left
    height = $rect.Bottom - $rect.Top
  } | ConvertTo-Json -Compress
}
`;

    const { stdout } = await runPowerShell(command);
    if (!stdout.trim()) {
      return null;
    }

    return JSON.parse(stdout);
  }

  function escapePowerShellSingleQuoted(value) {
    return String(value).replace(/'/g, "''");
  }

  async function sendAutomationInput(step, windowInfo) {
    if (process.platform !== 'win32') {
      throw new Error('Automation is only supported on Windows.');
    }

    if (step.type === 'wait') {
      await sleep(step.ms);
      return;
    }

    if (step.type === 'key') {
      const key = escapePowerShellSingleQuoted(step.key);
      await runPowerShell(`
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait('${key}')
`);
      return;
    }

    if (step.type === 'text') {
      const text = escapePowerShellSingleQuoted(step.text);
      await runPowerShell(`
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait('${text}')
`);
      return;
    }

    if (step.type === 'click') {
      const x = Math.round((windowInfo?.left || 0) + step.x);
      const y = Math.round((windowInfo?.top || 0) + step.y);
      await runPowerShell(`
$type = @"
using System;
using System.Runtime.InteropServices;
public class User32Input {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
}
"@
Add-Type $type -ErrorAction SilentlyContinue
[User32Input]::SetCursorPos(${x}, ${y}) | Out-Null
[User32Input]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 60
[User32Input]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
`);
      return;
    }

    throw new Error(`Unknown automation step type: ${step.type}`);
  }

  function getCreateRoomProfile(roomName) {
    return [
      { type: 'wait', ms: 4500, label: 'wait for main menu' },
      { type: 'key', key: '{ESC}', label: 'dismiss intro/menu overlays' },
      { type: 'wait', ms: 800, label: 'stabilize menu' },
      { type: 'click', x: 520, y: 365, label: 'open multiplayer' },
      { type: 'wait', ms: 1200, label: 'wait multiplayer screen' },
      { type: 'click', x: 505, y: 420, label: 'select local lan' },
      { type: 'wait', ms: 1200, label: 'wait lan screen' },
      { type: 'click', x: 745, y: 585, label: 'create room' },
      { type: 'wait', ms: 1200, label: 'wait room name dialog' },
      { type: 'text', text: roomName, label: 'type room name' },
      { type: 'key', key: '{ENTER}', label: 'confirm room name' },
      { type: 'wait', ms: 1500, label: 'wait lobby created' },
    ];
  }

  async function writeAutomationTrace(trace) {
    await ensureDirs();
    const fileName = `${new Date().toISOString().replace(/[:.]/g, '-')}-${trace.type}.json`;
    const tracePath = path.join(automationTracesDir, fileName);
    await fsPromises.writeFile(tracePath, `${JSON.stringify(trace, null, 2)}\n`, 'utf8');
    return tracePath;
  }

  async function checkDirectPlay() {
    if (directPlayCache && Date.now() - directPlayCache.checkedAt < 60000) {
      return directPlayCache.result;
    }

    if (process.platform !== 'win32') {
      return { state: 'unsupported' };
    }

    try {
      const { stdout } = await execFileAsync('dism', ['/Online', '/Get-FeatureInfo', '/FeatureName:DirectPlay']);
      const stateLine = stdout.split(/\r?\n/).find(line => line.trim().startsWith('State :'));
      directPlayCache = {
        checkedAt: Date.now(),
        result: {
        state: stateLine ? stateLine.split(':').slice(1).join(':').trim() : 'unknown',
        },
      };
      return directPlayCache.result;
    } catch (error) {
      directPlayCache = {
        checkedAt: Date.now(),
        result: {
        state: 'unknown',
        error: error.message,
        },
      };
      return directPlayCache.result;
    }
  }

  async function getStatus() {
    const settings = await loadSettings();
    const verification = await verifyRuntime(settings);
    const runningProcesses = await getRunningGameProcesses();
    const ddrawInstalled = await pathExists(path.join(settings.runtimePath, 'ddraw.dll'));
    const directPlay = await checkDirectPlay();
    const windowInfo = await getGameWindowInfo();

    return {
      settings,
      sourceGameExists: await pathExists(sourceGamePath),
      cncDdrawAvailable: await pathExists(cncDdrawDllPath),
      runtime: verification,
      patches: {
        cncDdraw: ddrawInstalled,
      },
      process: {
        running: runningProcesses.length > 0,
        trackedPid: gameProcess?.pid || null,
        processes: runningProcesses,
        window: windowInfo,
      },
      diagnostics: {
        directPlay,
      },
    };
  }

  async function getTelemetrySnapshot() {
    const status = await getStatus();
    let gameState = 'offline';

    if (status.process.running && status.process.window?.title) {
      gameState = 'menu_or_lobby';
    } else if (status.process.running) {
      gameState = 'launching';
    }

    return {
      capturedAt: new Date().toISOString(),
      gameState,
      process: status.process,
      runtimeVerified: status.runtime.verified,
      directPlay: status.diagnostics.directPlay,
      note: 'Read-only telemetry. Memory scanning and packet parsing are intentionally not enabled in release builds.',
    };
  }

  async function listMods() {
    return [];
  }

  async function tailLogs(limit = 200) {
    await ensureDirs();
    if (!(await pathExists(launcherLogPath))) {
      return [];
    }

    const raw = await fsPromises.readFile(launcherLogPath, 'utf8');
    return raw
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-limit)
      .map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return { ts: '', level: 'info', message: line };
        }
      });
  }

  async function createRoomAutomation(payload = {}) {
    const roomName = payload.roomName || 'BP Arena Room';
    const trace = {
      type: 'create-room',
      roomName,
      startedAt: new Date().toISOString(),
      attempts: [],
      ok: false,
    };

    await log(`Automation requested for room "${roomName}".`);

    for (let attempt = 1; attempt <= 3; attempt++) {
      const attemptTrace = {
        attempt,
        startedAt: new Date().toISOString(),
        steps: [],
      };
      trace.attempts.push(attemptTrace);

      try {
        await launchGame({
          nickname: payload.nickname,
          exeName: payload.exeName,
        });
        await sleep(2500);
        await focusGame();

        const windowInfo = await getGameWindowInfo();
        if (!windowInfo) {
          throw new Error('Game window was not found after launch.');
        }

        for (const step of getCreateRoomProfile(roomName)) {
          const stepTrace = {
            label: step.label,
            type: step.type,
            startedAt: new Date().toISOString(),
          };
          attemptTrace.steps.push(stepTrace);
          await sendAutomationInput(step, windowInfo);
          stepTrace.completedAt = new Date().toISOString();
        }

        trace.ok = true;
        trace.completedAt = new Date().toISOString();
        trace.tracePath = await writeAutomationTrace(trace);
        await log(`Create room automation completed. Trace: ${trace.tracePath}`);
        return {
          ok: true,
          phase: 'send-input',
          tracePath: trace.tracePath,
          message: 'Create room automation finished. Verify the room in-game.',
        };
      } catch (error) {
        attemptTrace.error = error.message;
        await log(`Automation attempt ${attempt} failed: ${error.message}`, 'error');

        try {
          await focusGame();
          await sendAutomationInput({ type: 'key', key: '{ESC}', label: 'recovery esc' }, await getGameWindowInfo());
        } catch {
          // Recovery is best effort.
        }

        if (attempt < 3) {
          await sleep(1500);
        }
      }
    }

    trace.completedAt = new Date().toISOString();
    trace.tracePath = await writeAutomationTrace(trace);
    return {
      ok: false,
      phase: 'send-input',
      tracePath: trace.tracePath,
      message: 'Create room automation failed after 3 attempts. Check the trace log.',
    };
  }

  function registerIpc(ipcMain) {
    ipcMain.handle('settings:get', () => loadSettings());
    ipcMain.handle('settings:save', (event, settings) => saveSettings(settings));
    ipcMain.handle('game:status', () => getStatus());
    ipcMain.handle('game:install', () => installRuntime({ repair: false }));
    ipcMain.handle('game:repair', () => installRuntime({ repair: true }));
    ipcMain.handle('game:launch', (event, options) => launchGame(options));
    ipcMain.handle('game:stop', (event, pid) => stopGame(pid));
    ipcMain.handle('game:focus', (event, pid) => focusGame(pid));
    ipcMain.handle('patch:applyCncDdraw', () => applyCncDdraw());
    ipcMain.handle('mods:list', () => listMods());
    ipcMain.handle('mods:enable', async () => ({ ok: false, message: 'No mod manifest is configured yet.' }));
    ipcMain.handle('mods:disable', async () => ({ ok: false, message: 'No mod manifest is configured yet.' }));
    ipcMain.handle('logs:tail', (event, limit) => tailLogs(limit));
    ipcMain.handle('telemetry:snapshot', () => getTelemetrySnapshot());
    ipcMain.handle('automation:createRoom', (event, payload) => createRoomAutomation(payload));
  }

  return {
    getBackendDataDir: () => serverDataDir,
    getSourceGamePath: () => sourceGamePath,
    log,
    loadSettings,
    saveSettings,
    getStatus,
    getTelemetrySnapshot,
    installRuntime,
    launchGame,
    stopGame,
    focusGame,
    registerIpc,
  };
}
