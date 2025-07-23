import React from 'react';
import useAuthStore from '../store/authStore';

const LandingPage = () => {
  const { login, status } = useAuthStore();
  const isLoggingIn = status === 'initializing'; 

  return (
    <div className="hero min-h-screen">
      <div className="hero-content text-center">
        <div className="max-w-md">
          <h1 className="text-5xl md:text-7xl font-bold text-slate-100 font-mono">
            SectorNet
          </h1>
          <p className="py-6 text-lg text-slate-300">
            A decentralized communication platform. Your data, your communities, your control.
          </p>
          <button 
            onClick={login}
            disabled={isLoggingIn}
            className="btn btn-primary btn-outline border-glassterm-accent text-glassterm-accent hover:bg-glassterm-accent hover:text-black transition-all duration-300 text-2xl px-8 py-4 h-auto font-mono"
          >
            {isLoggingIn 
              ? <span className="loading loading-spinner"></span> 
              : '> ENTER SECTORNET_'
            }
          </button>
        </div>
      </div>
    </div>
  );
};

export default LandingPage;
