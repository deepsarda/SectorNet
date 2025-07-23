import React from 'react';
import useAuthStore from '../store/authStore';

const LoginButton = () => {
    const { login } = useAuthStore();
    return (
        <button 
            onClick={login}
            className="btn btn-outline border-glassterm-accent text-glassterm-accent hover:bg-glassterm-accent hover:text-black transition-all duration-300 text-2xl px-8 py-4">
            {'> ENTER SECTORNET_'}
        </button>
    )
}

const LandingPage = () => {
  return (
    <div className="w-full h-screen flex flex-col justify-center items-center text-center p-4">
      <h1 className="text-5xl md:text-7xl font-bold mb-4 text-slate-100">
        SectorNet
      </h1>
      <p className="text-lg md:text-xl text-slate-300 mb-12 max-w-2xl">
        A decentralized social communication platform. Your data, your communities, your control.
      </p>
      <LoginButton />
    </div>
  );
};

export default LandingPage;