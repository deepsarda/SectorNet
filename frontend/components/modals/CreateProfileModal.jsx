import React, { useState, useRef, useEffect } from 'react';
import useAuthStore from '../../store/authStore';

const CreateProfileModal = ({ isVisible }) => {
  const { createProfile } = useAuthStore();
  const [username, setUsername] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialogNode = dialogRef.current;
    if (isVisible) {
      if (!dialogNode?.open) {
        dialogNode?.showModal();
      }
    } else {
      if (dialogNode?.open) {
        dialogNode?.close();
      }
    }
  }, [isVisible]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || username.length < 3) {
      setError("Username must be at least 3 characters.");
      return;
    }
    setIsLoading(true);
    setError('');

    // All crypto operations are handled inside the authStore.
    const result = await createProfile(username);

    if (result && 'Err' in result) {
      console.log(result)
      const errorObject = result.Err;
      // Get the first (and only) key from the error object, e.g., "AlreadyExists"
      const errorKey = Object.keys(errorObject)[0]; 
      // Get the value associated with that key, which is our error string.
      const errorMessage = errorObject[errorKey];

      setError(errorMessage);
      setIsLoading(false);
    }
    // On success, the store handles everything, and App.jsx will re-render,
    // causing this modal to be hidden.
  };

  return (
    <dialog ref={dialogRef} className="modal bg-slate-900/50 backdrop-blur-sm">
      <div className="modal-box bg-slate-800/20 border border-glassterm-border font-mono">
        <h3 className="font-bold text-2xl text-slate-100">Finalize Registration</h3>
        <p className="py-4 text-slate-300">Choose a unique username. This will also generate your permanent cryptographic identity. This cannot be changed later.</p>
        
        <form onSubmit={handleSubmit} method="dialog" className="flex flex-col space-y-4">
          <div className="form-control">
            <input
              type="text"
              placeholder="Username"
              className="input input-bordered w-full bg-slate-900"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={3}
            />
            {error && (
              <label className="label">
                <span className="label-text-alt text-red-400">{error}</span>
              </label>
            )}
          </div>

          <div className="modal-action">
            <button type="submit" className="btn btn-primary bg-glassterm-accent text-black" disabled={isLoading}>
              {isLoading ? <span className="loading loading-spinner"></span> : "Generate Identity & Create Profile"}
            </button>
          </div>
        </form>
      </div>
      
      <form method="dialog" className="modal-backdrop">
        <button onClick={(e) => e.preventDefault()}>close</button>
      </form>
    </dialog>
  );
};

export default CreateProfileModal;