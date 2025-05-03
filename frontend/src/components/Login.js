// Login.js
import React, { useState } from 'react';
import axios from 'axios';
import './Login.css'; // Import the CSS file for styling

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

function Login({ setLoggedIn }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleEmailChange = (event) => setEmail(event.target.value);
  const handlePasswordChange = (event) => setPassword(event.target.value);

  const handleSubmit = async (event) => {
    event.preventDefault();
    try {
      const formData = new URLSearchParams();
      formData.append('username', email);
      formData.append('password', password);

      const response = await axios.post(`${BACKEND_URL}/login`, formData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      // Store token
      localStorage.setItem('token', response.data.access_token);

      // Also store user ID - extract from email or use email directly as ID
      const userId = email.split('@')[0] || 'default_user';
      localStorage.setItem('userId', userId);

      setLoggedIn(true);
    } catch (error) {
      console.error('Login failed:', error);
      setError('Login failed. Please check your credentials.');
    }
  };

  return (
    <div className="login-container">
      <h2>Login</h2>
      {error && <div className="error-message">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Email:</label>
          <input type="email" value={email} onChange={handleEmailChange} required />
        </div>
        <div className="form-group">
          <label>Password:</label>
          <input type="password" value={password} onChange={handlePasswordChange} required />
        </div>
        <button type="submit">Login</button>
      </form>
    </div>
  );
}

export default Login;
