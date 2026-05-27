import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Sword, Users, Shield, Trophy } from 'lucide-react';
import axios from 'axios';

const Login = ({ onLogin }) => {
  const [isRegister, setIsRegister] = useState(false);
  const [formData, setFormData] = useState({ username: '', password: '', email: '' });
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      const response = await axios.post('http://localhost:8081/api/login', {
        username: formData.username,
        password: formData.password
      });


      if (response.data.username) {
        onLogin(response.data.username);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Check server connection.');
    }
  };


  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  return (
    <div className="login-container" style={{
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'url("https://www.ageofempires.com/wp-content/uploads/2019/11/aoede-keyart-tall.jpg") center/cover no-repeat', // AOE background
      position: 'relative'
    }}>
      {/* Background Overlay */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'linear-gradient(rgba(11, 14, 20, 0.85), rgba(11, 14, 20, 0.95))'
      }} />

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card"
        style={{
          width: '400px',
          padding: '40px',
          zIndex: 1,
          textAlign: 'center'
        }}
      >
        <div style={{ marginBottom: '30px' }}>
          <motion.div
            animate={{ rotate: [0, -10, 10, 0] }}
            transition={{ repeat: Infinity, duration: 4 }}
            style={{ display: 'inline-block', marginBottom: '10px' }}
          >
            <Sword size={48} color="var(--primary-color)" strokeWidth={1.5} />
          </motion.div>
          <h1 style={{ 
            fontSize: '1.8rem', 
            fontWeight: '700', 
            letterSpacing: '2px',
            color: 'var(--primary-color)',
            textTransform: 'uppercase'
          }}>
            BP ARENA
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Internal AOE Community Hub
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {isRegister && (
            <div className="input-group">
              <label>Email Address</label>
              <input 
                type="email" 
                name="email" 
                placeholder="email@company.com"
                value={formData.email}
                onChange={handleInputChange}
                required
              />
            </div>
          )}
          <div className="input-group">
            <label>Username</label>
            <input 
              type="text" 
              name="username" 
              placeholder="Your handle"
              value={formData.username}
              onChange={handleInputChange}
              required
            />
          </div>
          <div className="input-group">
            <label>Password</label>
            <input 
              type="password" 
              name="password" 
              placeholder="••••••••"
              value={formData.password}
              onChange={handleInputChange}
              required
            />
          </div>

          {error && (
            <div style={{ color: 'var(--accent-color)', fontSize: '0.8rem', marginBottom: '15px' }}>
              {error}
            </div>
          )}

          <button type="submit" className="btn-primary" style={{ width: '100%', padding: '12px' }}>

            {isRegister ? 'Create Account' : 'Enter the Arena'}
          </button>
        </form>

        <div style={{ marginTop: '20px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          {isRegister ? 'Already an old warrior?' : 'New in town?'} 
          <span 
            onClick={() => setIsRegister(!isRegister)}
            style={{ 
              color: 'var(--primary-color)', 
              marginLeft: '5px', 
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            {isRegister ? 'Log In' : 'Sign Up'}
          </span>
        </div>

        {/* Feature Icons */}
        <div style={{ 
          marginTop: '40px', 
          display: 'flex', 
          justifyContent: 'space-around',
          borderTop: '1px solid var(--border-color)',
          paddingTop: '20px'
        }}>
          <Users size={18} color="rgba(255,255,255,0.3)" />
          <Shield size={18} color="rgba(255,255,255,0.3)" />
          <Trophy size={18} color="rgba(255,255,255,0.3)" />
        </div>
      </motion.div>
    </div>
  );
};

export default Login;
