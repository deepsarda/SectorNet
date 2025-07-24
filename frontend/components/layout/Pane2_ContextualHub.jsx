import React, { useEffect } from 'react';
import useUiStore from '../../store/uiStore';
import useSectorStore from '../../store/sectorStore';
import useAuthStore from '../../store/authStore';
import useSectorRegistryStore from '../../store/sectorRegistryStore'; 
import useGlobalFeedStore from '../../store/globalFeedStore';

const Pane2_ContextualHub = () => {
  const { activeNavigator, activeContext, setContext } = useUiStore();
  const { userProfile } = useAuthStore();
  const { activeSectorData, fetchSectorDetails, isDetailsLoading: isSectorLoading, error: sectorError } = useSectorStore();
  
  const { publicSectors, fetchPublicSectorInfo, isLoading: isRegistryLoading } = useSectorRegistryStore();
  const { setVettedStatus, isLoading: isVettingLoading } = useGlobalFeedStore();

  const sectorId = activeNavigator !== 'global' ? activeNavigator : null;
  const publicInfo = sectorId ? publicSectors.get(sectorId.toText()) : null;

useEffect(() => {
    if (sectorId) {
      // Fetch both private details and public info when navigator changes
      fetchSectorDetails(sectorId);
      fetchPublicSectorInfo(sectorId);
    }
  }, [sectorId, fetchSectorDetails, fetchPublicSectorInfo]);

  const handleVettingToggle = async (e) => {
    const newStatus = e.target.checked;
    if (sectorId) {
      await setVettedStatus(sectorId, newStatus);
    }
  }

  const isModerator = activeSectorData?.my_role && 'Moderator' in activeSectorData.my_role;
  const isAdmin = userProfile?.tags?.some(tag => 'Admin' in tag);
  const isLoading = isSectorLoading || isRegistryLoading;

  const baseClasses = "cursor-pointer hover:text-glassterm-accent transition-colors duration-150";
  const activeClasses = "text-glassterm-accent";

  const renderGlobalContext = () => (
    <>
      <p onClick={() => setContext('feed')} className={activeContext === 'feed' ? activeClasses : baseClasses}>&gt; Global Feed</p>
      <p onClick={() => setContext('guide')} className={activeContext === 'guide' ? activeClasses : baseClasses}>&gt; Welcome Guide</p>
      <p onClick={() => setContext('proposals')} className={activeContext === 'proposals' ? activeClasses : baseClasses}>&gt; Community Proposals</p>
    </>
  );

  const renderSectorContext = () => {
    if (isLoading) {
      return <span className="loading loading-spinner loading-sm mx-auto mt-4"></span>;
    }

    if (sectorError || !activeSectorData) {
      return <p className="text-red-400 text-xs p-2">{sectorError || "Could not load sector."}</p>;
    }
    
    return (
      <>
        <h3 className="text-lg text-slate-200 mb-2">{activeSectorData.name}</h3>
        <p onClick={() => setContext('feed')} className={activeContext === 'feed' ? activeClasses : baseClasses}>&gt; Sector Feed</p>
        <p onClick={() => setContext('about')} className={activeContext === 'about' ? activeClasses : baseClasses}>&gt; About</p>
        
        <div className="divider before:bg-slate-700 after:bg-slate-700 my-2 text-slate-500 text-sm">[ CHANNELS ]</div>
        
        {activeSectorData.channels.map(channel => (
          <p key={channel} onClick={() => setContext(`channel-${channel}`)} className={activeContext === `channel-${channel}` ? activeClasses : baseClasses}># {channel}</p>
        ))}

        {isModerator && (
           <>
              <div className="divider before:bg-slate-700 after:bg-slate-700 my-2 text-slate-500 text-sm">[ MODERATOR ]</div>
              <p onClick={() => setContext('management')} className={activeContext === 'management' ? activeClasses : baseClasses}>&gt; Sector Management</p>
           </>
        )}

        {isAdmin && (
            <>
                <div className="divider before:bg-red-800 after:bg-red-800 my-2 text-red-500 text-sm">[ PLATFORM ADMIN ]</div>
                <div className="p-2 bg-red-900/20 border border-red-500/30 rounded-md">
                    <div className="form-control">
                        <label className="label cursor-pointer py-1">
                            <span className="label-text text-slate-300">Vet for Global Feed</span> 
                            <input 
                              type="checkbox" 
                              className="toggle toggle-sm toggle-error" 
                              checked={publicInfo?.is_vetted || false}
                              onChange={handleVettingToggle}
                              disabled={isVettingLoading}
                            />
                        </label>
                    </div>
                </div>
            </>
        )}
      </>
    );
  };

  return (
    <div className="bg-black/10 h-full p-4 font-mono text-slate-300 flex flex-col space-y-2">
      {activeNavigator === 'global' ? renderGlobalContext() : renderSectorContext()}
    </div>
  );
};

export default Pane2_ContextualHub;
