// src/components/Login.js
import React, { useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { login } from '../services/authService';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { setAuthData } = useContext(AuthContext);

  const handleSubmit = async (event) => {
    event.preventDefault();
    try {
      const data = await login(email, password);
      setAuthData(data); // Save the JWT returned from the backend in context
      localStorage.setItem('token', data.token); // Optionally save the token in localStorage
    } catch (error) {
      console.error('Login failed:', error);
      // Handle errors, such as showing an alert to the user
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        required
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        required
      />
      <button type="submit">Login</button>
    </form>
  );
}

export default Login;
