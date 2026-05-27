import React from 'react';
import { Minus, Square, X } from 'lucide-react';

const isElectron = window && window.process && window.process.type === 'renderer';
let ipcRenderer = null;
if (isElectron) {
  ipcRenderer = window.require('electron').ipcRenderer;
}

const WindowControls = () => {
  if (!isElectron) return null;

  const handleMinimize = () => ipcRenderer.send('window-minimize');
  const handleMaximize = () => ipcRenderer.send('window-maximize');
  const handleClose = () => ipcRenderer.send('window-close');

  return (
    <div className="window-controls" style={{
      position: 'absolute',
      top: 0,
      right: 0,
      display: 'flex',
      zIndex: 1000,
      WebkitAppRegion: 'no-drag' // IMPORTANT: Makes buttons clickable
    }}>
      <div className="control-btn" onClick={handleMinimize}>
        <Minus size={16} />
      </div>
      <div className="control-btn" onClick={handleMaximize}>
        <Square size={12} />
      </div>
      <div className="control-btn hover-red" onClick={handleClose}>
        <X size={16} />
      </div>
    </div>
  );
};

export default WindowControls;
