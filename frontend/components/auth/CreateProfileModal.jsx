import React, { useState } from 'react';
import useAuthStore from '../../store/authStore';

const CreateProfileModal = () => {
  const { createProfile } = useAuthStore();
  const [username, setUsername] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim()) {
      setError("Username cannot be empty.");
      return;
    }
    setIsLoading(true);
    setError('');

    // In a real app, you would generate a real public key here.
    const mockPublicKey = new Uint8Array([1, 2, 3, 4]);
    const result = await createProfile(username, mockPublicKey);
    
    if (result && 'Err' in result) {
      setError(result.Err);
    }
    // If successful, the authStore will automatically update and re-render App.jsx
    setIsLoading(false);
  };

  return (
    <div className="w-full h-screen flex justify-center items-center">
      <div className="mockup-window border bg-glassterm-panel border-glassterm-border w-full max-w-md">
        <div className="flex flex-col px-4 py-8 bg-slate-800/80">
          <h2 className="text-2xl font-bold text-center text-slate-100">Welcome to SectorNet</h2>
          <p className="text-center text-slate-300 mt-2">Choose a unique username to complete your registration.</p>
          <form onSubmit={handleSubmit} className="flex flex-col space-y-4 mt-8">
            <input
              type="text"
              placeholder="Username"
              className="input input-bordered w-full bg-slate-900"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button type="submit" className="btn btn-primary bg-glassterm-accent text-black" disabled={isLoading}>
              {isLoading ? <span className="loading loading-spinner"></span> : "Create Profile"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CreateProfileModal;
