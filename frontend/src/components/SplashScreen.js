import React, { useEffect, useState } from 'react';
import './SplashScreen.css';
import splashImage from '../assets/images/combined_splash_screen.png';

const SplashScreen = () => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
    }, 3000); // Display splash screen for 3 seconds

    return () => clearTimeout(timer);
  }, []);

  if (!isVisible) return null;

  return (
    <div className="splash-screen">
      <div className="splash-content">
        <h1 className="splash-title">Koala UI</h1>
        <img src={splashImage} alt="App Screenshot" className="app-screenshot" />
      </div>
    </div>
  );
};

export default SplashScreen;