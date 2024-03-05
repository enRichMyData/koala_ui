import React, { useState } from 'react';
import axios from 'axios'; // Make sure to install axios with `npm install axios`

function App() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const handleEmailChange = (event) => {
    setEmail(event.target.value);
  };

  const handlePasswordChange = (event) => {
    setPassword(event.target.value);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    try {
      const response = await axios.post('http://localhost:5001/login', {
        email,
        password
      });
      localStorage.setItem('token', response.data.access_token);
      setIsLoggedIn(true);
    } catch (error) {
      console.error('Login failed:', error);
      // Handle login failure (e.g., display an error message)
    }
  };

  return (
    <div className="App">
      {!isLoggedIn ? (
        <form onSubmit={handleSubmit}>
          <input type="email" value={email} onChange={handleEmailChange} placeholder="Email" required />
          <input type="password" value={password} onChange={handlePasswordChange} placeholder="Password" required />
          <button type="submit">Login</button>
        </form>
      ) : (
        <div>Welcome back!</div>
      )}
    </div>
  );
}

export default App;
