import React from 'react';

const LoadingSpinner = ({ message = "Initializing..." }) => {
  return (
    <div className="w-full h-screen flex flex-col justify-center items-center text-center">
      <span className="loading loading-lg text-glassterm-accent"></span>
      <p className="mt-4 text-slate-300">{message}</p>
    </div>
  );
};

export default LoadingSpinner;