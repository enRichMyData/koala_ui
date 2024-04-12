import React, { useState } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import DatasetList from './components/DatasetList';
import TableList from './components/TableList'; // Import the new detail component
import Login from './components/Login';
import './App.css';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem('token'));

  const handleLogout = () => {
    localStorage.removeItem('token');
    setIsLoggedIn(false);
  };

  return (
    <Router>
      <div className="app-container">
        <div className="app-header">
          {isLoggedIn && (
            <div className="profile">
              <img src="https://via.placeholder.com/40" alt="Profile" className="profile-image" />
              <span className="profile-name">John Doe</span>
            </div>
          )}
          {isLoggedIn && (
            <button onClick={handleLogout} className="logout-button">
              Logout
            </button>
          )}
        </div>
        <div className="app-content">
          <Routes>
            <Route path="/" element={isLoggedIn ? <Navigate replace to="/datasets" /> : <Navigate replace to="/login" />} />
            <Route path="/login" element={!isLoggedIn ? <Login setLoggedIn={setIsLoggedIn} /> : <Navigate replace to="/datasets" />} />
            <Route path="/dataset" element={isLoggedIn ? <DatasetList setIsLoggedIn={setIsLoggedIn} /> : <Navigate replace to="/login" />} />
            <Route path="/dataset/:datasetName" element={isLoggedIn ? <TableList /> : <Navigate replace to="/login" />} />
            {/* Add other routes as needed */}
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default App;
