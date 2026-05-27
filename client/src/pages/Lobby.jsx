import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Users, Plus, Play, LogOut, Settings, MessageSquare, 
  Shield, Swords, User, Map as MapIcon, ChevronRight, Trophy
} from 'lucide-react';

// For Electron IPC
const isElectron = window && window.process && window.process.type === 'renderer';
let ipcRenderer = null;
if (isElectron) {
  ipcRenderer = window.require('electron').ipcRenderer;
}

const Lobby = ({ user, onLogout }) => {
  const [rooms, setRooms] = useState([
    { id: 1, name: '4vs4 Choson Only', host: 'ProGamer', hostIp: '192.168.1.15', players: [1,2,3,4,5], capacity: 8, status: 'waiting', map: 'Large - Islands' },
    { id: 2, name: 'Sân chơi Công Ty - 2vs2', host: 'BossAOE', hostIp: '192.168.1.5', players: [1,2,3,4], capacity: 4, status: 'playing', map: 'Medium - Inland' },
  ]);

  const [isCreating, setIsCreating] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [gamePath, setGamePath] = useState(localStorage.getItem('aoe_game_path') || "C:\\Users\\Ad\\Downloads\\AOE-HD-2\\AOE-HD\\Empiresxhd.exe");

  const handleBrowseGame = async () => {
    if (isElectron && ipcRenderer) {
      const selectedPath = await ipcRenderer.invoke('select-game-file');
      if (selectedPath) {
        setGamePath(selectedPath);
        localStorage.setItem('aoe_game_path', selectedPath);
        console.log('Game path updated:', selectedPath);
      }
    }
  };

  useEffect(() => {
    if (isElectron && ipcRenderer) {
      const errorHandler = (event, message) => alert(message);
      const successHandler = (event, message) => console.log(message);

      ipcRenderer.on('launch-error', errorHandler);
      ipcRenderer.on('launch-success', successHandler);

      return () => {
        ipcRenderer.removeListener('launch-error', errorHandler);
        ipcRenderer.removeListener('launch-success', successHandler);
      };
    }
  }, []);

  const handleLaunchGame = (room = null) => {
    if (isElectron && ipcRenderer) {
      ipcRenderer.send('launch-game', { 
        gamePath, 
        username: user.username,
        hostIp: room ? room.hostIp : null
      });
      console.log(`Launching AOE 1 as ${user.username}...`);
    } else {
      alert("Please run through the BP-Arena Desktop App to launch the game!");
    }
  };

  return (
    <div className="lobby-container" style={{
      height: '100vh',
      display: 'grid',
      gridTemplateColumns: '260px 1fr 300px',
      background: 'var(--bg-color)'
    }}>
      
      {/* Sidebar: User Info & Stats */}
      <aside className="glass-card" style={{ 
        margin: '10px', 
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '30px' }}>
            <div style={{ 
              width: '48px', 
              height: '48px', 
              borderRadius: '50%', 
              background: 'var(--primary-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#000'
            }}>
              <User size={24} />
            </div>
            <div>
              <h3 style={{ fontSize: '1rem' }}>{user?.username || 'Warrior'}</h3>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Level 15 Roman</span>
            </div>
          </div>

          <nav style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {[
              { id: 'match', icon: <Swords size={18} />, label: 'Find Match', active: true },
              { id: 'clan', icon: <Users size={18} />, label: 'Clan Members' },
              { id: 'lead', icon: <Trophy size={18} />, label: 'Leaderboard' },
              { id: 'settings', icon: <Settings size={18} />, label: 'Game Settings' },
            ].map((item, i) => (
              <div 
                key={i} 
                onClick={() => item.id === 'settings' && setIsSettingsOpen(true)}
                style={{
                  padding: '12px',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  cursor: 'pointer',
                  background: item.active ? 'rgba(227, 179, 65, 0.1)' : 'transparent',
                  color: item.active ? 'var(--primary-color)' : 'var(--text-muted)',
                  transition: '0.2s'
                }}
              >
                {item.icon}
                <span style={{ fontWeight: '500' }}>{item.label}</span>
              </div>
            ))}
          </nav>
        </div>

        <button onClick={onLogout} style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          background: 'transparent',
          border: 'none',
          color: 'var(--accent-color)',
          cursor: 'pointer',
          padding: '10px'
        }}>
          <LogOut size={18} />
          <span>Leave Arena</span>
        </button>
      </aside>

      {/* Main Content: Room List */}
      <main style={{ padding: '20px', overflowY: 'auto' }}>
        <header style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '30px'
        }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '700' }}>AOE I LOBBY</h2>
          <button className="btn-primary" onClick={() => setIsCreating(true)} style={{
            display: 'flex', alignItems: 'center', gap: '8px'
          }}>
            <Plus size={20} /> Create Room
          </button>
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
          {rooms.map((room) => (
            <motion.div 
              whileHover={{ scale: 1.02 }}
              key={room.id} 
              className="glass-card" 
              style={{ padding: '20px', position: 'relative', overflow: 'hidden' }}
            >
              {room.status === 'playing' && (
                <div style={{
                  position: 'absolute', top: '10px', right: '10px',
                  background: 'var(--accent-color)', fontSize: '0.6rem',
                  padding: '2px 8px', borderRadius: '4px', textTransform: 'uppercase'
                }}>Live</div>
              )}
              
              <h3 style={{ marginBottom: '15px', color: 'var(--primary-color)' }}>{room.name}</h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)' }}>
                  <User size={14} /> <span>Host: {room.host}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)' }}>
                  <MapIcon size={14} /> <span>{room.map}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)' }}>
                  <Users size={14} /> <span>{room.players.length} / {room.capacity} Players</span>
                </div>
              </div>

              <div style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
                <button 
                  className={room.status === 'waiting' ? 'btn-primary' : 'btn-secondary'}
                  disabled={room.status === 'playing'}
                  onClick={() => handleLaunchGame(room)}
                  style={{ flex: 1 }}
                >
                  {room.status === 'playing' ? 'Spectate' : 'Join Battle'}
                </button>
              </div>

            </motion.div>
          ))}
        </div>
      </main>

      {/* Sidebar: Chat & Friends */}
      <aside className="glass-card" style={{ margin: '10px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '20px', borderBottom: '1px solid var(--border-color)' }}>
          <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <MessageSquare size={18} /> Arena Chat
          </h4>
        </div>
        <div style={{ flex: 1, padding: '15px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          <p style={{ marginBottom: '10px' }}><span style={{ color: 'var(--primary-color)' }}>System:</span> Welcome to BP-Arena!</p>
          <p style={{ marginBottom: '10px' }}><span style={{ color: '#fff' }}>ProGamer:</span> Mời anh em vào nhé, map Large 4-4.</p>
        </div>
        <div style={{ padding: '15px', borderTop: '1px solid var(--border-color)' }}>
          <div style={{ position: 'relative' }}>
            <input 
              type="text" 
              placeholder="Type message..." 
              style={{
                width: '100%', padding: '10px', borderRadius: '8px',
                background: 'var(--bg-input)', border: 'none', color: '#fff'
              }} 
            />
            <ChevronRight size={18} style={{ position: 'absolute', right: '10px', top: '10px', color: 'var(--primary-color)' }} />
          </div>
        </div>
      </aside>

      {/* Settings Modal */}
      <AnimatePresence>
        {isSettingsOpen && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, backdropFilter: 'blur(4px)'
          }}>
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="glass-card"
              style={{ width: '500px', padding: '40px', position: 'relative' }}
            >
              <h2 style={{ marginBottom: '30px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Settings size={24} color="var(--primary-color)" /> Game Settings
              </h2>

              <div style={{ marginBottom: '25px' }}>
                <label style={{ display: 'block', marginBottom: '10px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                  AOE Executable Path (.exe)
                </label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <input 
                    type="text" 
                    value={gamePath} 
                    readOnly
                    style={{
                      flex: 1, padding: '10px', borderRadius: '8px',
                      background: 'var(--bg-input)', border: '1px solid var(--border-color)',
                      color: 'var(--text-muted)', fontSize: '0.85rem'
                    }}
                  />
                  <button className="btn-secondary" onClick={handleBrowseGame}>
                    Browse
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '40px' }}>
                <button className="btn-primary" onClick={() => setIsSettingsOpen(false)}>
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};

export default Lobby;

