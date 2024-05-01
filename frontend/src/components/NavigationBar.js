import React from 'react';
import { NavLink } from 'react-router-dom';
import NavigationControls from './NavigationControls'; // Make sure this import path is correct
import './NavigationBar.css'; // Ensure your CSS styles are correctly imported

const NavigationBar = ({ onLogout }) => {
    return (
        <nav className="navbar">
            <NavLink to="/dataset" className="nav-link">Datasets</NavLink>
            <NavigationControls /> 
            <button onClick={onLogout} className="logout-button">
                Logout
            </button>
        </nav>
    );
};

export default NavigationBar;
