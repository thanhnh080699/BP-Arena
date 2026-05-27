import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  Crown,
  Cpu,
  Download,
  Edit3,
  Focus,
  Gamepad2,
  LogOut,
  MessageSquare,
  Monitor,
  Play,
  Plus,
  Radio,
  RefreshCcw,
  Settings,
  ShieldCheck,
  Square,
  Terminal,
  Trash2,
  Trophy,
  Users,
  Wifi,
  Wrench,
} from 'lucide-react';
import axios from 'axios';

const isElectron = typeof window !== 'undefined' && window.process && window.process.type === 'renderer';
const ipcRenderer = isElectron ? window.require('electron').ipcRenderer : null;

const API_BASE_URL = 'http://localhost:8081';

const defaultSettings = {
  schemaVersion: 1,
  runtimePath: '',
  sourceGamePath: '',
  exeName: 'Empiresxhd.exe',
  nickname: '',
  resolution: { width: 1024, height: 768 },
  windowMode: 'windowed',
  renderer: 'gdi',
  patches: { cncDdraw: false, cncDdrawLaunchEnabled: true, upatchHd: true },
  matchmaking: { apiBaseUrl: API_BASE_URL, preferredNetwork: 'direct-lan' },
  launchArgs: [],
  automationProfile: 'aoe-ror-1024x768-windowed',
};

const fallbackStatus = {
  sourceGameExists: false,
  cncDdrawAvailable: false,
  runtime: { installed: false, verified: false, missing: [], mismatched: [], manifestEntries: 0 },
  patches: { cncDdraw: false },
  process: { running: false, trackedPid: null, processes: [], window: null },
  diagnostics: { directPlay: { state: 'unknown' } },
};

function StatusPill({ ok, label }) {
  return (
    <span className={`status-pill ${ok ? 'status-ok' : 'status-warn'}`}>
      {label}
    </span>
  );
}

function Field({ label, children }) {
  return (
    <label className="settings-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function normalizeRoom(room) {
  return {
    id: room.ID || room.id,
    name: room.name || 'Unnamed room',
    host: room.host_name || room.host || 'Unknown',
    status: room.status || 'waiting',
    capacity: room.capacity || 8,
    players: room.player_count || 1,
    gameType: room.game_type || 'AOE_ROR',
    hostIp: room.host_ip || room.hostIp || '',
    updatedAt: room.UpdatedAt || room.updated_at || room.last_heartbeat,
  };
}

const Lobby = ({ user, onLogout }) => {
  const [settings, setSettings] = useState(defaultSettings);
  const [status, setStatus] = useState(fallbackStatus);
  const [logs, setLogs] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [telemetry, setTelemetry] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [busyAction, setBusyAction] = useState('');
  const [notice, setNotice] = useState('');
  const [socketState, setSocketState] = useState('connecting');
  const [roomForm, setRoomForm] = useState({
    name: 'BP Arena Room',
    capacity: 8,
    gameType: 'AOE_ROR',
  });

  const apiBaseUrl = settings.matchmaking?.apiBaseUrl || API_BASE_URL;
  const effectiveNickname = settings.nickname || user?.username || 'Player';
  const runningProcess = status.process.processes[0];
  const roomCards = useMemo(() => rooms.map(normalizeRoom), [rooms]);

  const invoke = async (channel, payload) => {
    if (!ipcRenderer) {
      throw new Error('Run BP-Arena from the desktop app to use launcher features.');
    }

    return ipcRenderer.invoke(channel, payload);
  };

  const refreshLauncher = async () => {
    if (!ipcRenderer) return;

    const [nextSettings, nextStatus, nextLogs, nextTelemetry] = await Promise.all([
      invoke('settings:get'),
      invoke('game:status'),
      invoke('logs:tail', 150),
      invoke('telemetry:snapshot'),
    ]);

    setSettings(nextSettings);
    setStatus(nextStatus);
    setLogs(nextLogs);
    setTelemetry(nextTelemetry);
  };

  const refreshRooms = async () => {
    try {
      const [roomResponse, leaderboardResponse] = await Promise.all([
        axios.get(`${apiBaseUrl}/api/rooms`),
        axios.get(`${apiBaseUrl}/api/leaderboard`),
      ]);
      setRooms(Array.isArray(roomResponse.data) ? roomResponse.data : []);
      setLeaderboard(Array.isArray(leaderboardResponse.data) ? leaderboardResponse.data : []);
    } catch {
      setRooms([]);
      setLeaderboard([]);
    }
  };

  useEffect(() => {
    refreshLauncher().catch(error => setNotice(error.message));
    refreshRooms();

    const timer = setInterval(() => {
      refreshLauncher().catch(() => {});
      refreshRooms();
    }, 7000);

    return () => clearInterval(timer);
  }, [apiBaseUrl]);

  useEffect(() => {
    const wsUrl = apiBaseUrl.replace(/^http/, 'ws') + '/ws/rooms';
    const socket = new WebSocket(wsUrl);
    setSocketState('connecting');

    socket.onopen = () => setSocketState('online');
    socket.onclose = () => setSocketState('offline');
    socket.onerror = () => setSocketState('offline');
    socket.onmessage = event => {
      try {
        const message = JSON.parse(event.data);
        if (message.type?.startsWith('room.')) {
          refreshRooms();
        }
      } catch {
        refreshRooms();
      }
    };

    return () => socket.close();
  }, [apiBaseUrl]);

  const runAction = async (label, action) => {
    setBusyAction(label);
    setNotice('');

    try {
      const result = await action();
      if (result?.settings) {
        setSettings(result.settings);
      }
      await Promise.all([
        refreshLauncher().catch(() => {}),
        refreshRooms(),
      ]);
      setNotice(`${label} completed.`);
      return result;
    } catch (error) {
      setNotice(error.message);
      throw error;
    } finally {
      setBusyAction('');
    }
  };

  const saveSettings = async (patch) => {
    const nextSettings = {
      ...settings,
      ...patch,
      resolution: {
        ...settings.resolution,
        ...(patch.resolution || {}),
      },
      patches: {
        ...settings.patches,
        ...(patch.patches || {}),
      },
      matchmaking: {
        ...settings.matchmaking,
        ...(patch.matchmaking || {}),
      },
    };

    const saved = await invoke('settings:save', nextSettings);
    setSettings(saved);
    return saved;
  };

  const handleLaunch = () => runAction('Start game', async () => {
    await saveSettings({ nickname: effectiveNickname });
    return invoke('game:launch', {
      nickname: effectiveNickname,
    });
  }).catch(() => {});

  const createRoom = () => runAction('Create room', async () => {
    const name = roomForm.name.trim();
    if (!name) {
      throw new Error('Room name is required.');
    }

    const response = await axios.post(`${apiBaseUrl}/api/rooms`, {
      name,
      host_name: effectiveNickname,
      capacity: Number(roomForm.capacity) || 8,
      game_type: roomForm.gameType,
      status: 'waiting',
    });
    return response.data;
  }).catch(() => {});

  const editRoom = (room) => {
    const nextName = window.prompt('Room name', room.name);
    if (!nextName || nextName.trim() === room.name) return;

    runAction('Update room', async () => (
      axios.put(`${apiBaseUrl}/api/rooms/${room.id}`, {
        name: nextName.trim(),
      })
    )).catch(() => {});
  };

  const deleteRoom = (room) => {
    if (!window.confirm(`Delete room "${room.name}"?`)) return;

    runAction('Delete room', async () => (
      axios.delete(`${apiBaseUrl}/api/rooms/${room.id}`)
    )).catch(() => {});
  };

  const createInGameRoom = (room) => runAction('Create game room', async () => {
    await saveSettings({ nickname: effectiveNickname });
    const automation = await invoke('automation:createRoom', {
      roomName: room.name,
      nickname: effectiveNickname,
      exeName: settings.exeName,
    });

    if (automation?.ok === false) {
      throw new Error(automation.message || 'Create room automation failed.');
    }

    const response = await axios.post(`${apiBaseUrl}/api/rooms/${room.id}/game-created`, {
      host_name: effectiveNickname,
    });
    return response.data;
  }).catch(() => {});

  const joinInGameRoom = (room) => runAction('Join game', async () => {
    await axios.post(`${apiBaseUrl}/api/rooms/${room.id}/join`, {
      username: effectiveNickname,
    });
    await saveSettings({ nickname: effectiveNickname });
    return invoke('game:launch', {
      nickname: effectiveNickname,
      hostIp: room.hostIp,
    });
  }).catch(() => {});

  const activeRooms = roomCards.filter(room => ['waiting', 'launching', 'in_lobby'].includes(room.status)).length;
  const isBusy = Boolean(busyAction);

  return (
    <div className="lobby-shell">
      <aside className="launcher-sidebar">
        <div>
          <div className="user-block">
            <div className="avatar"><Gamepad2 size={24} /></div>
            <div>
              <h3>{user?.username || 'Warrior'}</h3>
              <span>BP Arena Platform</span>
            </div>
          </div>

          <nav className="launcher-nav">
            <button className="nav-item active"><Activity size={18} /> Arena</button>
            <button className="nav-item" onClick={() => setIsSettingsOpen(true)}><Settings size={18} /> Settings</button>
            <button className="nav-item"><Users size={18} /> Rooms</button>
            <button className="nav-item"><ShieldCheck size={18} /> Diagnostics</button>
          </nav>
        </div>

        <button onClick={onLogout} className="logout-btn">
          <LogOut size={18} />
          Leave Arena
        </button>
      </aside>

      <main className="launcher-main">
        <header className="launcher-header platform-header">
          <div>
            <h2>BP-Arena</h2>
            <p>AOE ROR platform, launcher control, and realtime LAN room flow.</p>
          </div>
          <div className="header-status">
            <StatusPill ok={socketState === 'online'} label={`Socket ${socketState}`} />
            <StatusPill ok={status.runtime.verified} label={status.runtime.verified ? 'Runtime verified' : 'Runtime needs repair'} />
            <StatusPill ok={status.process.running} label={status.process.running ? 'Game running' : 'Game stopped'} />
          </div>
        </header>

        {notice && <div className="notice">{notice}</div>}
        {busyAction && <div className="notice muted-notice">{busyAction}...</div>}

        <section className="platform-kpis">
          <div className="kpi"><span>Rooms</span><strong>{roomCards.length}</strong></div>
          <div className="kpi"><span>Open Lobbies</span><strong>{activeRooms}</strong></div>
          <div className="kpi"><span>Players Online</span><strong>{roomCards.reduce((sum, room) => sum + room.players, 0)}</strong></div>
          <div className="kpi"><span>Socket</span><strong>{socketState}</strong></div>
        </section>

        <section className="rooms-section platform-rooms">
          <div className="section-title">
            <div>
              <h3>Room Control</h3>
              <span>Realtime CRUD with host and client game actions.</span>
            </div>
            <button className="btn-secondary" disabled={isBusy} onClick={refreshRooms}>
              <RefreshCcw size={16} /> Refresh
            </button>
          </div>

          <div className="room-create-card">
            <div className="create-room-form">
              <input
                value={roomForm.name}
                onChange={event => setRoomForm({ ...roomForm, name: event.target.value })}
                placeholder="Room name"
              />
              <select
                value={roomForm.capacity}
                onChange={event => setRoomForm({ ...roomForm, capacity: Number(event.target.value) })}
              >
                {[2, 3, 4, 5, 6, 7, 8].map(capacity => (
                  <option key={capacity} value={capacity}>{capacity} players</option>
                ))}
              </select>
              <select
                value={roomForm.gameType}
                onChange={event => setRoomForm({ ...roomForm, gameType: event.target.value })}
              >
                <option value="AOE_ROR">AOE ROR</option>
                <option value="AOE_HD">AOE HD</option>
              </select>
              <button className="btn-primary" disabled={isBusy} onClick={createRoom}>
                <Plus size={16} /> Create
              </button>
            </div>
          </div>

          <div className="room-grid">
            {roomCards.map(room => {
              const isHost = room.host.toLowerCase() === effectiveNickname.toLowerCase();
              const canJoin = !isHost && room.status === 'in_lobby';

              return (
                <motion.div whileHover={{ y: -2 }} key={room.id} className="room-card platform-room-card">
                  <div className="room-card-head">
                    <div>
                      <h4>{room.name}</h4>
                      <span className="room-host">
                        {isHost ? <Crown size={14} /> : <Users size={14} />}
                        {room.host}
                      </span>
                    </div>
                    <span className={`room-state ${room.status}`}>{room.status}</span>
                  </div>

                  <div className="room-meta">
                    <span>{room.gameType}</span>
                    <span>{room.players} / {room.capacity} players</span>
                    <span>Host IP: {room.hostIp || 'pending'}</span>
                  </div>

                  <div className="room-actions">
                    {isHost ? (
                      <button disabled={isBusy} onClick={() => createInGameRoom(room)} className="room-join">
                        <Play size={16} /> Tạo game
                      </button>
                    ) : (
                      <button disabled={isBusy || !canJoin} onClick={() => joinInGameRoom(room)} className="room-join">
                        <Wifi size={16} /> Vào game
                      </button>
                    )}

                    {isHost && (
                      <div className="icon-actions">
                        <button className="icon-btn" disabled={isBusy} onClick={() => editRoom(room)} title="Edit room">
                          <Edit3 size={16} />
                        </button>
                        <button className="icon-btn danger" disabled={isBusy} onClick={() => deleteRoom(room)} title="Delete room">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}

            {roomCards.length === 0 && (
              <div className="empty-room-state">
                <Gamepad2 size={28} />
                <span>No rooms are available.</span>
              </div>
            )}
          </div>
        </section>

        <section className="launcher-grid platform-tools">
          <div className="panel">
            <div className="panel-title">
              <Cpu size={18} />
              Runtime
            </div>
            <div className="status-list">
              <div><span>Source</span><strong>{status.sourceGameExists ? 'Found' : 'Missing'}</strong></div>
              <div><span>Manifest</span><strong>{status.runtime.manifestEntries || 0} files</strong></div>
              <div><span>cnc-ddraw</span><strong>{status.cncDdrawAvailable ? 'Available' : 'Missing'}</strong></div>
              <div><span>DirectPlay</span><strong>{status.diagnostics.directPlay.state}</strong></div>
              <div><span>Runtime path</span><code>{settings.runtimePath || 'Not configured'}</code></div>
            </div>
            <div className="action-row">
              <button className="btn-secondary" disabled={isBusy} onClick={() => runAction('Install runtime', () => invoke('game:install')).catch(() => {})}>
                <Download size={16} /> Install
              </button>
              <button className="btn-secondary" disabled={isBusy} onClick={() => runAction('Repair runtime', () => invoke('game:repair')).catch(() => {})}>
                <RefreshCcw size={16} /> Repair
              </button>
              <button className="btn-secondary" disabled={isBusy} onClick={() => runAction('Apply cnc-ddraw', () => invoke('patch:applyCncDdraw')).catch(() => {})}>
                <Wrench size={16} /> Patch
              </button>
            </div>
          </div>

          <div className="panel">
            <div className="panel-title">
              <Monitor size={18} />
              Process Manager
            </div>
            <div className="process-readout">
              <div><span>Executable</span><strong>{settings.exeName}</strong></div>
              <div><span>PID</span><strong>{runningProcess?.pid || status.process.trackedPid || '-'}</strong></div>
              <div><span>Resolution</span><strong>{settings.resolution.width}x{settings.resolution.height}</strong></div>
            </div>
            <div className="action-row">
              <button className="btn-primary" disabled={isBusy} onClick={handleLaunch}>
                <Play size={16} /> Start
              </button>
              <button className="btn-secondary" disabled={isBusy || !status.process.running} onClick={() => runAction('Focus game', () => invoke('game:focus')).catch(() => {})}>
                <Focus size={16} /> Focus
              </button>
              <button className="btn-secondary danger" disabled={isBusy || !status.process.running} onClick={() => runAction('Stop game', () => invoke('game:stop')).catch(() => {})}>
                <Square size={16} /> Stop
              </button>
            </div>
          </div>

          <div className="panel">
            <div className="panel-title">
              <Radio size={18} />
              Live Telemetry
            </div>
            <div className="status-list">
              <div><span>State</span><strong>{telemetry?.gameState || 'offline'}</strong></div>
              <div><span>Window</span><strong>{telemetry?.process?.window?.title || '-'}</strong></div>
              <div><span>Captured</span><strong>{telemetry?.capturedAt ? new Date(telemetry.capturedAt).toLocaleTimeString() : '-'}</strong></div>
            </div>
            <p className="panel-note">{telemetry?.note || 'Read-only telemetry snapshot.'}</p>
          </div>

          <div className="panel">
            <div className="panel-title">
              <Trophy size={18} />
              Competitive
            </div>
            <div className="status-list">
              {leaderboard.slice(0, 3).map((rating, index) => (
                <div key={rating.ID || rating.username}>
                  <span>#{index + 1} {rating.username}</span>
                  <strong>{rating.elo}</strong>
                </div>
              ))}
              {leaderboard.length === 0 && <div><span>Leaderboard</span><strong>No matches yet</strong></div>}
            </div>
            <p className="panel-note">ELO, matches, replay metadata, and admin surfaces are available through the local API.</p>
          </div>
        </section>
      </main>

      <aside className="log-panel">
        <div className="panel-title">
          <Terminal size={18} />
          Launcher Logs
        </div>
        <div className="log-feed">
          {logs.length === 0 && <p className="empty-log">No logs yet.</p>}
          {logs.map((entry, index) => (
            <div key={`${entry.ts}-${index}`} className={`log-line ${entry.level}`}>
              <time>{entry.ts ? new Date(entry.ts).toLocaleTimeString() : '--:--:--'}</time>
              <span>{entry.message}</span>
            </div>
          ))}
        </div>
        <div className="chat-shell">
          <MessageSquare size={16} />
          <span>Room changes stream through WebSocket.</span>
        </div>
      </aside>

      {isSettingsOpen && (
        <div className="modal-backdrop">
          <div className="settings-modal">
            <div className="modal-title">
              <Settings size={22} />
              <h3>Launcher Settings</h3>
            </div>

            <div className="settings-grid">
              <Field label="Nickname">
                <input value={settings.nickname || ''} onChange={event => setSettings({ ...settings, nickname: event.target.value })} />
              </Field>
              <Field label="Executable">
                <select value={settings.exeName} onChange={event => setSettings({ ...settings, exeName: event.target.value })}>
                  {['Empiresxhd.exe', 'Empiresx.exe', 'Empiresxhdr.exe', 'Empiresxr.exe'].map(exe => (
                    <option key={exe} value={exe}>{exe}</option>
                  ))}
                </select>
              </Field>
              <Field label="Width">
                <input type="number" min="640" value={settings.resolution.width} onChange={event => setSettings({ ...settings, resolution: { ...settings.resolution, width: Number(event.target.value) } })} />
              </Field>
              <Field label="Height">
                <input type="number" min="480" value={settings.resolution.height} onChange={event => setSettings({ ...settings, resolution: { ...settings.resolution, height: Number(event.target.value) } })} />
              </Field>
              <Field label="Window Mode">
                <select value={settings.windowMode} onChange={event => setSettings({ ...settings, windowMode: event.target.value })}>
                  <option value="windowed">Windowed</option>
                  <option value="borderless">Borderless</option>
                  <option value="fullscreen">Fullscreen</option>
                </select>
              </Field>
              <Field label="Renderer">
                <select value={settings.renderer} onChange={event => setSettings({ ...settings, renderer: event.target.value })}>
                  <option value="gdi">GDI</option>
                  <option value="auto">Auto</option>
                  <option value="direct3d9">Direct3D9</option>
                  <option value="opengl">OpenGL</option>
                </select>
              </Field>
              <Field label="Launch Args">
                <input
                  value={(settings.launchArgs || []).join(' ')}
                  onChange={event => setSettings({
                    ...settings,
                    launchArgs: event.target.value.split(/\s+/).filter(Boolean),
                  })}
                  placeholder="Optional executable args"
                />
              </Field>
              <Field label="Matchmaking API">
                <input
                  value={settings.matchmaking?.apiBaseUrl || API_BASE_URL}
                  onChange={event => setSettings({
                    ...settings,
                    matchmaking: {
                      ...settings.matchmaking,
                      apiBaseUrl: event.target.value,
                    },
                  })}
                />
              </Field>
              <label className="settings-check">
                <input
                  type="checkbox"
                  checked={settings.patches?.cncDdrawLaunchEnabled !== false}
                  onChange={event => setSettings({
                    ...settings,
                    patches: {
                      ...settings.patches,
                      cncDdrawLaunchEnabled: event.target.checked,
                    },
                  })}
                />
                <span>Use cnc-ddraw when launching</span>
              </label>
            </div>

            <div className="path-block">
              <span>Runtime path</span>
              <code>{settings.runtimePath}</code>
            </div>

            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setIsSettingsOpen(false)}>Cancel</button>
              <button className="btn-primary" onClick={() => runAction('Save settings', () => saveSettings(settings)).then(() => setIsSettingsOpen(false)).catch(() => {})}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Lobby;
