import React from 'react';
import useUiStore from './store/uiStore';
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/solid';

// Keep mock panes for now, they will be built out next.
const Pane1_Navigator = () => (
    <div className="bg-black/20 h-full p-2 flex flex-col items-center space-y-4 pt-4">
        <div className="tooltip tooltip-right" data-tip="Global">
            <div className="w-12 h-12 bg-glassterm-accent text-black flex items-center justify-center font-bold text-lg cursor-pointer">[G]</div>
        </div>
        <div className="tooltip tooltip-right" data-tip="Digital Artists">
            <div className="w-12 h-12 bg-slate-700 hover:bg-slate-600 flex items-center justify-center font-bold text-lg cursor-pointer">[DA]</div>
        </div>
        <div className="tooltip tooltip-right" data-tip="Sci-Fi Readers">
            <div className="w-12 h-12 bg-slate-700 hover:bg-slate-600 flex items-center justify-center font-bold text-lg cursor-pointer">[SF]</div>
        </div>
        <div className="w-12 h-12 border-2 border-dashed border-slate-500 flex items-center justify-center font-bold text-lg mt-auto cursor-pointer hover:bg-slate-700">[+]</div>
    </div>
);
const Pane2_ContextualHub = () => (
    <div className="bg-black/10 h-full p-4 prose">
        <p className="text-glassterm-accent cursor-pointer">> Global Feed</p>
        <p className="cursor-pointer hover:text-glassterm-accent">> Welcome Guide</p>
        <p className="cursor-pointer hover:text-glassterm-accent">> Community Proposals</p>
    </div>
);
const Pane3_ContentDisplay = () => (
    <div className="h-full p-4 overflow-y-auto">
        <h2 className="text-xl text-slate-100">Global Feed</h2>
        <div className="mt-4 border border-slate-700 p-4 bg-slate-900/20">
            <p className="text-sm text-slate-400">Posted by <User_Alice> [Admin|Moderator] from [Vetted Sector]</p>
            <hr className="border-slate-600 my-2" />
            <div className="prose prose-invert prose-sm">
                <p>This is a sample post on the global feed...</p>
                <p>It supports `markdown` and will be rendered by the client.</p>
            </div>
        </div>
    </div>
);


const MainLayout = () => {
    const { isMobileNavOpen, toggleMobileNav } = useUiStore();

    return (
        <div className="p-2 sm:p-4 md:p-8 h-screen w-screen flex items-center justify-center">
            <div className="mockup-window border bg-glassterm-panel border-glassterm-border shadow-2xl shadow-cyan-500/10 w-full h-full flex flex-col backdrop-blur-lg">
                <div className="flex items-center justify-between px-4 py-2 bg-slate-800/80 border-b border-glassterm-border">
                    <div className="flex space-x-2">
                        <div className="w-3 h-3 rounded-full bg-red-500"></div>
                        <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                        <div className="w-3 h-3 rounded-full bg-green-500"></div>
                    </div>
                    <div className="text-slate-300 hidden sm:block">SectorNet v1.1</div>
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
    );
};

export default MainLayout;
