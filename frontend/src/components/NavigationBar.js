import React, { useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { 
  AppBar, 
  Toolbar, 
  Button, 
  Typography, 
  Avatar, 
  Box, 
  IconButton, 
  Menu, 
  MenuItem, 
  Tooltip, 
  Divider,
  ListItemIcon,
  Container,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemText
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import LogoutIcon from '@mui/icons-material/Logout';
import HomeIcon from '@mui/icons-material/Home';
import TableChartIcon from '@mui/icons-material/TableChart';
import DatasetIcon from '@mui/icons-material/Dataset';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import logo from '../assets/images/logo.png';

const NavigationBar = ({ onLogout, profileName }) => {
    const [anchorEl, setAnchorEl] = useState(null);
    const [mobileOpen, setMobileOpen] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();
    
    const handleOpenUserMenu = (event) => {
        setAnchorEl(event.currentTarget);
    };
    
    const handleCloseUserMenu = () => {
        setAnchorEl(null);
    };
    
    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('userId');
        localStorage.removeItem('userEmail');
        handleCloseUserMenu();
        onLogout();
    };
    
    const handleDrawerToggle = () => {
        setMobileOpen(!mobileOpen);
    };
    
    const isActive = (path) => {
        return location.pathname.startsWith(path);
    };
    
    const menuItems = [
        { text: 'Home', icon: <HomeIcon />, path: '/' },
        { text: 'Datasets', icon: <DatasetIcon />, path: '/dataset' },
        { text: 'Documentation', icon: <HelpOutlineIcon />, path: '/docs' }
    ];
    
    const drawer = (
        <Box onClick={handleDrawerToggle} sx={{ textAlign: 'center' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}>
                <Avatar src={logo} alt="Koala" sx={{ width: 40, height: 40, mr: 1 }} />
                <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
                    Koala
                </Typography>
            </Box>
            <Divider />
            <List>
                {menuItems.map((item) => (
                    <ListItem key={item.text} disablePadding>
                        <ListItemButton 
                            component={NavLink} 
                            to={item.path}
                            sx={{
                                textAlign: 'center',
                                color: isActive(item.path) ? 'primary.main' : 'inherit'
                            }}
                        >
                            <ListItemIcon sx={{ minWidth: 40 }}>
                                {item.icon}
                            </ListItemIcon>
                            <ListItemText primary={item.text} />
                        </ListItemButton>
                    </ListItem>
                ))}
            </List>
        </Box>
    );

    return (
        <>
            <AppBar position="static" color="default" elevation={1} sx={{ backgroundColor: 'white' }}>
                <Container maxWidth="xl">
                    <Toolbar disableGutters>
                        {/* Mobile menu icon */}
                        <IconButton
                            color="inherit"
                            aria-label="open drawer"
                            edge="start"
                            onClick={handleDrawerToggle}
                            sx={{ mr: 2, display: { sm: 'none' } }}
                        >
                            <MenuIcon />
                        </IconButton>
                        
                        {/* Logo and brand */}
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            <Avatar 
                                src={logo} 
                                alt="Koala" 
                                sx={{ 
                                    width: { xs: 40, md: 50 }, 
                                    height: { xs: 40, md: 50 }, 
                                    mr: 1,
                                    transition: 'all 0.2s'
                                }} 
                            />
                            <Typography
                                variant="h6"
                                noWrap
                                component={NavLink}
                                to="/"
                                sx={{
                                    mr: 2,
                                    display: { xs: 'none', md: 'flex' },
                                    fontFamily: 'monospace',
                                    fontWeight: 700,
                                    letterSpacing: '.2rem',
                                    color: 'inherit',
                                    textDecoration: 'none',
                                }}
                            >
                                KOALA
                            </Typography>
                        </Box>

                        {/* Navigation items - desktop */}
                        <Box sx={{ flexGrow: 1, display: { xs: 'none', sm: 'flex' } }}>
                            {menuItems.map((item) => (
                                <Button
                                    key={item.text}
                                    component={NavLink}
                                    to={item.path}
                                    startIcon={item.icon}
                                    sx={{ 
                                        my: 2, 
                                        color: 'text.primary', 
                                        display: 'flex',
                                        textTransform: 'none',
                                        fontWeight: isActive(item.path) ? 'bold' : 'regular',
                                        backgroundColor: isActive(item.path) ? 'rgba(0, 0, 0, 0.04)' : 'transparent'
                                    }}
                                >
                                    {item.text}
                                </Button>
                            ))}
                        </Box>

                        {/* User menu */}
                        <Box sx={{ flexGrow: 0, display: 'flex', alignItems: 'center' }}>
                            <Tooltip title="Account settings">
                                <IconButton onClick={handleOpenUserMenu} sx={{ p: 0, ml: 2 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                        <Typography 
                                            variant="body2" 
                                            sx={{ 
                                                mr: 1, 
                                                display: { xs: 'none', sm: 'block' } 
                                            }}
                                        >
                                            {profileName}
                                        </Typography>
                                        <Avatar 
                                            sx={{ 
                                                bgcolor: 'primary.main',
                                                width: 32,
                                                height: 32
                                            }}
                                        >
                                            {profileName ? profileName[0].toUpperCase() : 'U'}
                                        </Avatar>
                                    </Box>
                                </IconButton>
                            </Tooltip>
                            <Menu
                                sx={{ mt: '45px' }}
                                id="menu-appbar"
                                anchorEl={anchorEl}
                                anchorOrigin={{
                                    vertical: 'top',
                                    horizontal: 'right',
                                }}
                                keepMounted
                                transformOrigin={{
                                    vertical: 'top',
                                    horizontal: 'right',
                                }}
                                open={Boolean(anchorEl)}
                                onClose={handleCloseUserMenu}
                                PaperProps={{
                                    elevation: 0,
                                    sx: {
                                        overflow: 'visible',
                                        filter: 'drop-shadow(0px 2px 8px rgba(0,0,0,0.32))',
                                        mt: 1.5,
                                        '& .MuiAvatar-root': {
                                            width: 32,
                                            height: 32,
                                            ml: -0.5,
                                            mr: 1,
                                        },
                                        '&:before': {
                                            content: '""',
                                            display: 'block',
                                            position: 'absolute',
                                            top: 0,
                                            right: 14,
                                            width: 10,
                                            height: 10,
                                            bgcolor: 'background.paper',
                                            transform: 'translateY(-50%) rotate(45deg)',
                                            zIndex: 0,
                                        },
                                    },
                                }}
                            >
                                <MenuItem onClick={() => { handleCloseUserMenu(); navigate('/profile'); }}>
                                    <ListItemIcon>
                                        <AccountCircleIcon fontSize="small" />
                                    </ListItemIcon>
                                    Profile
                                </MenuItem>
                                <Divider />
                                <MenuItem onClick={handleLogout}>
                                    <ListItemIcon>
                                        <LogoutIcon fontSize="small" />
                                    </ListItemIcon>
                                    Logout
                                </MenuItem>
                            </Menu>
                        </Box>
                    </Toolbar>
                </Container>
            </AppBar>
            
            {/* Mobile drawer */}
            <Drawer
                variant="temporary"
                open={mobileOpen}
                onClose={handleDrawerToggle}
                ModalProps={{ keepMounted: true }}
                sx={{
                    display: { xs: 'block', sm: 'none' },
                    '& .MuiDrawer-paper': { boxSizing: 'border-box', width: 240 },
                }}
            >
                {drawer}
            </Drawer>
        </>
    );
};

export default NavigationBar;
