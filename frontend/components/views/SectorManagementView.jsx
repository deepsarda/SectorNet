import React, { useState, useEffect } from 'react';
import useSectorStore from '../../store/sectorStore';
import useAuthStore from '../../store/authStore';
import useGlobalFeedStore from '../../store/globalFeedStore';

const SectorManagementView = () => {
  const { activeSectorData, updateSectorConfig, isDetailsLoading, error: sectorError } = useSectorStore();
  const [name, setName] = useState('');
  const [abbreviation, setAbbreviation] = useState('');
  const [description, setDescription] = useState('');
  
  useEffect(() => {
    if (activeSectorData) {
      setName(activeSectorData.name);
      setAbbreviation(activeSectorData.abbreviation);
      setDescription(activeSectorData.description);
    }
  }, [activeSectorData]);

  const handleConfigUpdate = async (e) => {
    e.preventDefault();
    await updateSectorConfig({ name, abbreviation, description });
  };
  

  if (!activeSectorData) {
    return <span className="loading loading-spinner"></span>;
  }

  return (
    <div className="font-mono text-slate-200 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-4">Sector Management: {activeSectorData.name}</h2>
      
      <div className="p-4 bg-slate-800/50 border border-glassterm-border rounded-md">
        <h3 className="text-lg text-glassterm-accent mb-2">[ Moderator Controls ]</h3>
        <form onSubmit={handleConfigUpdate} className="space-y-4">
          <div>
            <label className="label"><span className="label-text text-slate-300">Sector Name</span></label>
            <input type="text" className="input input-bordered w-full bg-slate-900" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <label className="label"><span className="label-text text-slate-300">Abbreviation (Max 3 Chars)</span></label>
            <input type="text" className="input input-bordered w-full bg-slate-900" value={abbreviation} onChange={e => setAbbreviation(e.target.value.toUpperCase())} maxLength={3} />
          </div>
          <div>
            <label className="label"><span className="label-text text-slate-300">Description</span></label>
            <textarea className="textarea textarea-bordered w-full bg-slate-900 h-24" value={description} onChange={e => setDescription(e.target.value)}></textarea>
          </div>
          {sectorError && <p className="text-red-400 text-xs">{sectorError}</p>}
          <div className="text-right">
            <button type="submit" className="btn btn-primary" disabled={isDetailsLoading}>
              {isDetailsLoading ? <span className="loading loading-spinner"></span> : "Save Changes"}
            </button>
          </div>
        </form>
      </div>

    </div>
  );
};

export default SectorManagementView;
