import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { AppBar, Toolbar, IconButton, Button, Typography, Avatar, Box } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import logo from '../assets/images/alligator_logo.webp';  // Make sure the path to your logo is correct

const NavigationBar = ({ onLogout, profileName }) => {
    const navigate = useNavigate();

    return (
        <AppBar position="static">
            <Toolbar style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box style={{ display: 'flex', alignItems: 'center' }}>
                    <IconButton edge="start" color="inherit" aria-label="back" onClick={() => navigate(-1)}>
                        <ArrowBackIcon />
                    </IconButton>
                    <IconButton edge="start" color="inherit" aria-label="forward" onClick={() => navigate(1)}>
                        <ArrowForwardIcon />
                    </IconButton>
                </Box>
                <Typography variant="h6" style={{ flexGrow: 1, textAlign: 'center' }}>
                    <img src={logo} alt="Alligator UI" style={{ height: '80px', width: '90px' }} />
                </Typography>
                <Box style={{ display: 'flex', alignItems: 'center' }}>
                    <NavLink to="/dataset" style={{ color: 'inherit', textDecoration: 'none' }}>
                        <Button color="inherit">Datasets</Button>
                    </NavLink>
                    <Avatar src="https://via.placeholder.com/40" alt={profileName} style={{ width: 30, height: 30, marginLeft: 10, marginRight: 10 }} />
                    <Typography variant="subtitle1" style={{ marginRight: 20 }}>{profileName}</Typography>
                    <Button color="inherit" onClick={onLogout}>
                        Logout
                    </Button>
                </Box>
            </Toolbar>
        </AppBar>
    );
};

export default NavigationBar;
