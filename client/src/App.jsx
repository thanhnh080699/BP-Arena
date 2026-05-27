import React, { useState } from 'react'
import Login from './pages/Login'
import Lobby from './pages/Lobby'
import WindowControls from './components/WindowControls'

function App() {

  const [user, setUser] = useState(null)

  const handleLogin = (username) => {
    setUser({ username, id: Math.random().toString(36).substr(2, 9) });
  };

  const handleLogout = () => {
    setUser(null);
  };

  return (
    <div className="App">
       <div className="title-bar-drag" />
       <WindowControls />
      {!user ? (


        <Login onLogin={handleLogin} />
      ) : (
        <Lobby user={user} onLogout={handleLogout} />
      )}
    </div>
  )
}

export default App

