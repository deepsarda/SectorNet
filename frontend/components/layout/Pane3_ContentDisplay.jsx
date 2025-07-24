import React from 'react';
import useUiStore from '../../store/uiStore';
import GlobalFeedView from '../views/GlobalFeedView';
import ChatView from '../views/ChatView';
import WelcomeGuide from '../views/WelcomeGuideView';
import SectorManagementView from '../views/SectorManagementView';
import ComingSoon from '../common/ComingSoon';



const WelcomeGuideView = () => ( 
  <div className="p-4">
   <WelcomeGuide />
  </div>
);

const SectorFeedView = ({ sectorId }) => ( <div><h2 className="text-xl text-slate-100">Sector Feed for {sectorId}</h2></div> );

const Pane3_ContentDisplay = () => {
  const { activeNavigator, activeContext } = useUiStore();

  const renderContent = () => {
    // Global Context
    if (activeNavigator === 'global') {
      switch (activeContext) {
        case 'feed':
          return <GlobalFeedView />;
        case 'guide':
          return <WelcomeGuideView />;
        case 'proposals':
          return <ComingSoon featureName="Community Proposals" />;
        default:
          return <GlobalFeedView />;
      }
    }

    // Sector Context
    if (activeContext.startsWith('channel-')) {
      const channelName = activeContext.split('-')[1];
      return <ChatView channelName={channelName} />;
    }
    
    switch (activeContext) {
        case 'feed':
            return <SectorFeedView sectorId={activeNavigator} />;
        case 'about':
             return <ComingSoon featureName="About Sector" />;
        case 'management':
             return <SectorManagementView />;
        default:
            return <SectorFeedView sectorId={activeNavigator} />;
    }
  };

  return (
    <div className="h-full p-4 overflow-y-auto">
      {renderContent()}
    </div>
  );
};

export default Pane3_ContentDisplay;
