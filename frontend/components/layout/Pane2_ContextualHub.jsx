import React, { useEffect } from 'react';
import useUiStore from '../../store/uiStore';
import useSectorStore from '../../store/sectorStore';

const Pane2_ContextualHub = () => {
  const { activeNavigator, activeContext, setContext } = useUiStore();
  const { activeSectorData, isDetailsLoading, fetchSectorDetails, error } = useSectorStore();

  // This effect will run whenever the user clicks a different sector in Pane 1
  useEffect(() => {
    if (activeNavigator !== 'global') {
      fetchSectorDetails(activeNavigator);
    }
  }, [activeNavigator, fetchSectorDetails]);

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
    if (isDetailsLoading) {
      return <span className="loading loading-spinner loading-sm mx-auto mt-4"></span>;
    }

    if (error || !activeSectorData) {
      return <p className="text-red-400 text-xs p-2">{error || "Could not load sector."}</p>;
    }
    
    // Check if the user is a Moderator based on the role object
    const isModerator = 'Moderator' in activeSectorData.my_role;

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
              <div className="divider before:bg-slate-700 after:bg-slate-700 my-2 text-slate-500 text-sm">[ ADMIN ]</div>
              <p onClick={() => setContext('management')} className={activeContext === 'management' ? activeClasses : baseClasses}>&gt; Sector Management</p>
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