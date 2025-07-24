import React from 'react';
import useUiStore from '../../store/uiStore';
import GlobalFeedView from '../views/GlobalFeedView';
import ChatView from '../views/ChatView';

const WelcomeGuideView = () => ( <div><h2 className="text-xl text-slate-100">Welcome Guide</h2></div> );
const SectorFeedView = ({ sectorId }) => ( <div><h2 className="text-xl text-slate-100">Sector Feed for {sectorId}</h2></div> );

const Pane3_ContentDisplay = () => {
  const { activeNavigator, activeContext } = useUiStore();

  const renderContent = () => {
    if (activeNavigator === 'global') {
      switch (activeContext) {
        case 'feed':
          return <GlobalFeedView />;
        case 'guide':
          return <WelcomeGuideView />;
        default:
          return <GlobalFeedView />;
      }
    }

    if (activeContext.startsWith('channel-')) {
      const channelName = activeContext.split('-')[1];
      return <ChatView channelName={channelName} />;
    }
    
    switch (activeContext) {
        case 'feed':
            return <SectorFeedView sectorId={activeNavigator} />;
        default:
            return <SectorFeedView sectorId={activeNavigator} />;
    }
  };

  return (
    <div className="h-full p-4">
      {renderContent()}
    </div>
  );
};

export default Pane3_ContentDisplay;
