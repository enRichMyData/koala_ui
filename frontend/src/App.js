import React, { useState } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import DatasetList from './components/DatasetList';
import TableList from './components/TableList';
import TableDataViewer from './components/TableDataViewer';
import Login from './components/Login';
import NavigationBar from './components/NavigationBar';
import LandingPage from './components/LandingPage';
import Profile from './components/Profile';
import Documentation from './components/Documentation';
import { CssBaseline } from '@mui/material';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(
    !!(localStorage.getItem('token') || localStorage.getItem('refresh_token'))
  );
  // Display the logged-in user's email or fallback to userId
  const profileName =
    localStorage.getItem('userEmail')
    || localStorage.getItem('userId')
    || 'User';

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('userId');
    localStorage.removeItem('userRole');
    setIsLoggedIn(false);
  };

  return (
    <Router>
      <CssBaseline />  
      {isLoggedIn && <NavigationBar onLogout={handleLogout} profileName={profileName} />}
      <Routes>
        <Route path="/" element={<LandingPage isLoggedIn={isLoggedIn} />} />
        <Route path="/docs" element={<Documentation />} />
        <Route path="/login" element={!isLoggedIn ? <Login setLoggedIn={setIsLoggedIn} /> : <Navigate replace to="/dataset" />} />
        <Route path="/dataset" element={isLoggedIn ? <DatasetList setIsLoggedIn={setIsLoggedIn} /> : <Navigate replace to="/login" />} />
        <Route path="/profile" element={isLoggedIn ? <Profile /> : <Navigate replace to="/login" />} />
        <Route path="/dataset/:datasetName" element={isLoggedIn ? <TableList /> : <Navigate replace to="/login" />} />
        <Route path="/dataset/:datasetName/table/:tableName" element={isLoggedIn ? <TableDataViewer /> : <Navigate replace to="/login" />} />
      </Routes>
    </Router>
  );
}

export default App;
