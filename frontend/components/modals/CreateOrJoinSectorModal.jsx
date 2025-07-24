import React, { useState, useRef, useEffect } from 'react';
import useSectorStore from '../../store/sectorStore';

const CreateOrJoinSectorModal = ({ isVisible, onClose }) => {
  const { createNewSector, joinPrivateSector, error, isDetailsLoading } = useSectorStore();
  const [activeTab, setActiveTab] = useState('create');
  const dialogRef = useRef(null);

  // Form state for creating a sector
  const [name, setName] = useState('');
  const [abbreviation, setAbbreviation] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [securityModel, setSecurityModel] = useState('StandardAccessControl');

  // Form state for joining a sector
  const [inviteCode, setInviteCode] = useState('');
  
  // Local error state for form validation
  const [formError, setFormError] = useState('');

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

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    if (abbreviation.length > 3) {
      setFormError('Abbreviation must be 3 characters or less.');
      return;
    }

    const config = {
      name,
      abbreviation,
      description,
      is_private: isPrivate,
      // The security model from the backend is an object variant
      security_model: { [securityModel]: null },
    };

    const result = await createNewSector(config);
    if (result?.Ok) {
      onClose(); // Close modal on success
    } else {
      // Show error from the store
      setFormError(error);
    }
  };

  const handleJoinSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    const result = await joinPrivateSector(inviteCode);
    if (result?.Ok) {
      onClose();
    } else {
      setFormError(error);
    }
  };

  return (
    <dialog ref={dialogRef} className="modal bg-slate-900/50 backdrop-blur-sm">
      <div className="modal-box bg-slate-800/20 border border-glassterm-border font-mono">
        <button onClick={onClose} className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">✕</button>
        
        <div role="tablist" className="tabs tabs-boxed bg-slate-900/50 mb-4">
          <a role="tab" className={`tab ${activeTab === 'create' ? 'tab-active bg-glassterm-accent text-black' : ''}`} onClick={() => setActiveTab('create')}>Create Sector</a>
          <a role="tab" className={`tab ${activeTab === 'join' ? 'tab-active bg-glassterm-accent text-black' : ''}`} onClick={() => setActiveTab('join')}>Join with Invite</a>
        </div>

        {activeTab === 'create' && (
          <form onSubmit={handleCreateSubmit} className="flex flex-col space-y-4">
            <h3 className="font-bold text-lg text-slate-100">Create a New Sector</h3>
            <p className="text-xs text-slate-400">Rate Limit: You can create one new sector every 6 hours.</p>
            
            <input type="text" placeholder="Sector Name (e.g., 'Digital Artists')" className="input input-bordered w-full bg-slate-900" value={name} onChange={(e) => setName(e.target.value)} required />
            <input type="text" placeholder="Abbreviation (e.g., 'AD')" className="input input-bordered w-full bg-slate-900" value={abbreviation} maxLength={2} onChange={(e) => setAbbreviation(e.target.value.toUpperCase())} required />
            <textarea className="textarea textarea-bordered bg-slate-900" placeholder="A brief description of your community." value={description} onChange={(e) => setDescription(e.target.value)} required></textarea>

            <div className="form-control">
              <label className="label cursor-pointer">
                <span className="label-text text-slate-300">Private Sector (Invite-Only)</span> 
                <input type="checkbox" className="toggle toggle-primary" checked={isPrivate} onChange={() => setIsPrivate(!isPrivate)} />
              </label>
            </div>
            
            {isPrivate && (
              <div className="p-3 bg-slate-900/50 rounded-md">
                 <h4 className="text-slate-200 mb-2">Chat Security Level</h4>
                 <div className="form-control">
                    <label className="label cursor-pointer">
                      <span className="label-text text-slate-300">High-Security E2EE <span className="text-xs text-slate-500">(Max 50 members, Recommeneded)</span></span> 
                      <input type="radio" name="security-model" className="radio radio-primary" value="HighSecurityE2EE" checked={securityModel === 'HighSecurityE2EE'} onChange={(e) => setSecurityModel(e.target.value)} />
                    </label>
                  </div>
                  <div className="form-control">
                    <label className="label cursor-pointer">
                      <span className="label-text text-slate-300">Standard Access Control <span className="text-xs text-slate-500">(For larger groups)</span></span> 
                      <input type="radio" name="security-model" className="radio radio-primary" value="StandardAccessControl" checked={securityModel === 'StandardAccessControl'} onChange={(e) => setSecurityModel(e.target.value)} />
                    </label>
                  </div>
              </div>
            )}
            
            {formError && <p className="text-red-400 text-xs">{formError}</p>}

            <div className="modal-action">
              <button type="submit" className="btn btn-primary bg-glassterm-accent text-black" disabled={isDetailsLoading}>
                {isDetailsLoading ? <span className="loading loading-spinner"></span> : "Create Sector"}
              </button>
            </div>
          </form>
        )}

        {activeTab === 'join' && (
          <form onSubmit={handleJoinSubmit} className="flex flex-col space-y-4">
            <h3 className="font-bold text-lg text-slate-100">Join a Private Sector</h3>
            <p className="text-xs text-slate-400">Enter an invite code provided by a Sector Moderator.</p>
            <input type="text" placeholder="Invite Code" className="input input-bordered w-full bg-slate-900" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} required />
            
            {formError && <p className="text-red-400 text-xs">{formError}</p>}

            <div className="modal-action">
              <button type="submit" className="btn btn-primary bg-glassterm-accent text-black" disabled={isDetailsLoading}>
                 {isDetailsLoading ? <span className="loading loading-spinner"></span> : "Join Sector"}
              </button>
            </div>
          </form>
        )}
      </div>
    </dialog>
  );
};

export default CreateOrJoinSectorModal;