import React, { useState } from 'react';
import './SplashScreen.css';
import koalaImage from '../assets/images/splash_screen.webp'; // Ensure the path to your image is correct

const SplashScreen = ({ onProceed }) => {
  const [isVisible, setIsVisible] = useState(true);

  const handleProceed = () => {
    setIsVisible(false);
    onProceed();
  };

  if (!isVisible) return null;

  return (
    <div className="splash-screen">
      <div className="splash-content">
        <h1 className="splash-title">Koala UI</h1>
        <p className="splash-description">
          Welcome to Koala UI, your go-to tool for exploring and visualizing entity linking results. Click the button below to start your journey!
        </p>
        <img src={koalaImage} alt="Koala" className="koala-image" />
        <button className="explore-button" onClick={handleProceed}>Explore It</button>
      </div>
    </div>
  );
};

export default SplashScreen;