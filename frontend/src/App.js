import React, { useState } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import DatasetList from './components/DatasetList';
import TableList from './components/TableList';
import TableDataViewer from './components/TableDataViewer';
import Login from './components/Login';
import NavigationBar from './components/NavigationBar'; // Import the NavigationBar
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
        {isLoggedIn && <NavigationBar onLogout={handleLogout} />}
        <div className="app-header">
          {isLoggedIn && (
            <div className="profile">
              <img src="https://via.placeholder.com/40" alt="Profile" className="profile-image" />
              <span className="profile-name">John Doe</span>
            </div>
          )}
        </div>
        <div className="app-content">
          <Routes>
            <Route path="/" element={isLoggedIn ? <Navigate replace to="/dataset" /> : <Navigate replace to="/login" />} />
            <Route path="/login" element={!isLoggedIn ? <Login setLoggedIn={setIsLoggedIn} /> : <Navigate replace to="/dataset" />} />
            <Route path="/dataset" element={isLoggedIn ? <DatasetList setIsLoggedIn={setIsLoggedIn} /> : <Navigate replace to="/login" />} />
            <Route path="/dataset/:datasetName" element={isLoggedIn ? <TableList /> : <Navigate replace to="/login" />} />
            <Route path="/dataset/:datasetName/table/:tableName" element={isLoggedIn ? <TableDataViewer /> : <Navigate replace to="/login" />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default App;
