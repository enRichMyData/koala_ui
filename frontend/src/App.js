import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import DatasetList from './components/DatasetList';
import TableList from './components/TableList';
import TableDataViewer from './components/TableDataViewer';
import Login from './components/Login';
import NavigationBar from './components/NavigationBar';
import SplashScreen from './components/SplashScreen';
import { CssBaseline } from '@mui/material';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem('token'));
  const [showSplash, setShowSplash] = useState(true); // State for splash screen visibility
  const profileName = "Koby Koalawood"; // Assuming the profile name is static for demonstration

  useEffect(() => {
    if (window.location.hostname !== 'localhost' || window.location.pathname !== '/') {
      setShowSplash(false);
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    setIsLoggedIn(false);
  };

  const handleProceed = () => {
    setShowSplash(false);
  };

  if (showSplash) {
    return <SplashScreen onProceed={handleProceed} />;
  }

  return (
    <Router>
      <CssBaseline />  
      {isLoggedIn && <NavigationBar onLogout={handleLogout} profileName={profileName} />}
      <Routes>
        <Route path="/" element={isLoggedIn ? <Navigate replace to="/dataset" /> : <Login setLoggedIn={setIsLoggedIn} />} />
        <Route path="/login" element={!isLoggedIn ? <Login setLoggedIn={setIsLoggedIn} /> : <Navigate replace to="/dataset" />} />
        <Route path="/dataset" element={isLoggedIn ? <DatasetList setIsLoggedIn={setIsLoggedIn} /> : <Navigate replace to="/login" />} />
        <Route path="/dataset/:datasetName" element={isLoggedIn ? <TableList /> : <Navigate replace to="/login" />} />
        <Route path="/dataset/:datasetName/table/:tableName" element={isLoggedIn ? <TableDataViewer /> : <Navigate replace to="/login" />} />
      </Routes>
    </Router>
  );
}

export default App;