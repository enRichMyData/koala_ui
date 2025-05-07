import React from 'react';
import { NavLink } from 'react-router-dom';
import { AppBar, Toolbar, Button, Typography, Avatar, Box } from '@mui/material';
import logo from '../assets/images/logo.png';

const NavigationBar = ({ onLogout, profileName }) => {
    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('userId');
        localStorage.removeItem('userEmail');
        onLogout();
    };

    return (
        <AppBar position="static">
            <Toolbar sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                {/* arrows removed for cleaner UI */}
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <NavLink to="/dataset" style={{ color: 'inherit', textDecoration: 'none' }}>
                        <Button color="inherit">Datasets</Button>
                    </NavLink>
                    <Avatar src={logo} alt={profileName} sx={{ width: 40, height: 40, mx: 1 }} />
                    <Typography variant="subtitle1" sx={{ mr: 2 }}>{profileName}</Typography>
                    <Button color="inherit" onClick={handleLogout}>
                        Logout
                    </Button>
                </Box>
            </Toolbar>
        </AppBar>
    );
};

export default NavigationBar;
