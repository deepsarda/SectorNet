import React from 'react';

const LoadingSpinner = ({ message = "Initializing..." }) => {
  return (
    <div className="hero min-h-screen">
      <div className="hero-content text-center">
        <div className="flex flex-col items-center">
          <span className="loading loading-spinner loading-lg text-glassterm-accent"></span>
          <p className="mt-4 text-slate-300 font-mono">{message}</p>
        </div>
      </div>
    </div>
  );
};

export default LoadingSpinner;
