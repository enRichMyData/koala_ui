import React, { useState } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import DatasetList from './components/DatasetList';
import TableList from './components/TableList';
import TableDataViewer from './components/TableDataViewer';
import Login from './components/Login';
import NavigationBar from './components/NavigationBar'; // Import the updated NavigationBar
import { CssBaseline } from '@mui/material';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem('token'));
  const profileName = "John Doe"; // Assuming the profile name is static for demonstration

  const handleLogout = () => {
    localStorage.removeItem('token');
    setIsLoggedIn(false);
  };

  return (
    <Router>
      <CssBaseline />  
      {isLoggedIn && <NavigationBar onLogout={handleLogout} profileName={profileName} />}
      <Routes>
        <Route path="/" element={isLoggedIn ? <Navigate replace to="/dataset" /> : <Navigate replace to="/login" />} />
        <Route path="/login" element={!isLoggedIn ? <Login setLoggedIn={setIsLoggedIn} /> : <Navigate replace to="/dataset" />} />
        <Route path="/dataset" element={isLoggedIn ? <DatasetList setIsLoggedIn={setIsLoggedIn} /> : <Navigate replace to="/login" />} />
        <Route path="/dataset/:datasetName" element={isLoggedIn ? <TableList /> : <Navigate replace to="/login" />} />
        <Route path="/dataset/:datasetName/table/:tableName" element={isLoggedIn ? <TableDataViewer /> : <Navigate replace to="/login" />} />
      </Routes>
    </Router>
  );
}

export default App;
