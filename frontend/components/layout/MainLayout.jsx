import React from 'react';
import useUiStore from '../../store/uiStore';
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/solid';

import Pane1_Navigator from './Pane1_Navigator';
import Pane2_ContextualHub from './Pane2_ContextualHub';
import Pane3_ContentDisplay from './Pane3_ContentDisplay';
import CreateOrJoinSectorModal from '../modals/CreateOrJoinSectorModal';

const MainLayout = () => {
  const { isMobileNavOpen, toggleMobileNav, isCreateJoinModalOpen, closeCreateJoinModal } = useUiStore();


  return (
    <>
    <div className="p-2 sm:p-4 md:p-8 h-screen w-screen flex items-center justify-center">
      <div className="mockup-window border bg-glassterm-panel border-glassterm-border shadow-2xl shadow-cyan-500/10 w-full h-full flex flex-col backdrop-blur-lg">
        <div className="flex items-center justify-between px-4 py-2 bg-slate-800/20 border-b border-glassterm-border">
          
          <div className="text-slate-300 hidden sm:block font-mono">SectorNet</div>
          <div className="md:hidden">
            <button onClick={toggleMobileNav} className="text-slate-300">
              {isMobileNavOpen ? <XMarkIcon className="h-6 w-6" /> : <Bars3Icon className="h-6 w-6" />}
            </button>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden relative">
          <div className={`
            absolute top-0 left-0 h-full w-3/4 max-w-sm z-20 flex bg-slate-900/90 backdrop-blur-sm
            md:static md:w-auto md:z-auto md:flex md:bg-transparent md:backdrop-blur-none
            transform transition-transform duration-300 ease-in-out
            ${isMobileNavOpen ? 'translate-x-0' : '-translate-x-full'}
            md:translate-x-0
          `}>
            <div className="w-20 flex-shrink-0">
              <Pane1_Navigator />
            </div>
            <div className="flex-1 border-l border-r border-slate-800">
              <Pane2_ContextualHub />
            </div>
          </div>
          
          <div className="flex-1 h-full overflow-y-auto">
            <Pane3_ContentDisplay />
          </div>
        </div>
      </div>
    </div>
    <CreateOrJoinSectorModal isVisible={isCreateJoinModalOpen} onClose={closeCreateJoinModal} />

    </>
  );
};

export default MainLayout;
