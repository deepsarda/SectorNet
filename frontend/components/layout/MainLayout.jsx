// Mock Panes for demonstration
const Pane1_Navigator = () => (
    <div className="bg-black/20 h-full p-2 flex flex-col items-center space-y-4">
        <div className="w-12 h-12 bg-glassterm-accent text-black flex items-center justify-center font-bold text-lg">[G]</div>
        <div className="w-12 h-12 bg-slate-700 flex items-center justify-center font-bold text-lg">[DA]</div>
        <div className="w-12 h-12 bg-slate-700 flex items-center justify-center font-bold text-lg">[SF]</div>
        <div className="w-12 h-12 border-2 border-dashed border-slate-500 flex items-center justify-center font-bold text-lg mt-auto">[+]</div>
    </div>
);
const Pane2_ContextualHub = () => (
    <div className="bg-black/10 h-full p-4">
        <p className="text-glassterm-accent">&gt;Global Feed</p>
        <p>&gt; Welcome Guide</p>
        <p>&gt; Community Proposals</p>
    </div>
);
const Pane3_ContentDisplay = () => (
    <div className="h-full p-4">
        <h2 className="text-xl text-slate-100">Global Feed</h2>
        <div className="mt-4 border border-slate-700 p-4">
            <p className="text-sm text-slate-400">Posted by User_Alice [Admin|Moderator] from [Vetted Sector]</p>
            <hr className="border-slate-600 my-2" />
            <p className="text-slate-200">This is a sample post on the global feed...</p>
        </div>
    </div>
);


const MainLayout = () => {
    const [isNavOpen, setIsNavOpen] = useState(false);

    return (
        <div className="p-4 md:p-8 h-screen w-screen flex items-center justify-center">
            {/* The DaisyUI Window Mockup with Glassterm styling */}
            <div className="mockup-window border bg-glassterm-panel border-glassterm-border shadow-2xl shadow-cyan-500/10 w-full h-full flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-2 bg-slate-800/80 border-b border-glassterm-border">
                    <div className="flex space-x-2">
                        <div className="w-3 h-3 rounded-full bg-red-500"></div>
                        <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                        <div className="w-3 h-3 rounded-full bg-green-500"></div>
                    </div>
                    <div className="text-slate-300">SectorNet v1.1</div>
                    {/* Mobile Navigation Toggle */}
                    <div className="md:hidden">
                        <button onClick={() => setIsNavOpen(!isNavOpen)} className="text-slate-300">
                            {isNavOpen ? <XMarkIcon className="h-6 w-6" /> : <Bars3Icon className="h-6 w-6" />}
                        </button>
                    </div>
                </div>

                {/* Main Content Area with Sliding Panes */}
                <div className="flex-1 flex overflow-hidden relative">
                    
                    {/* --- Mobile Navigation Pane (Pane 1 & 2 Combined) --- */}
                    {/* This pane slides in from the left on mobile */}
                    <div className={`
                        absolute top-0 left-0 h-full w-full z-20 flex
                        md:static md:w-auto md:z-auto md:flex
                        transform transition-transform duration-300 ease-in-out
                        ${isNavOpen ? 'translate-x-0' : '-translate-x-full'}
                        md:translate-x-0
                    `}>
                        {/* Pane 1: Main Navigator */}
                        <div className="w-20 flex-shrink-0">
                            <Pane1_Navigator />
                        </div>
                        {/* Pane 2: Contextual Hub */}
                        <div className="flex-1 border-l border-r border-slate-800">
                            <Pane2_ContextualHub />
                        </div>
                    </div>
                    
                    {/* --- Pane 3: Content Display --- */}
                    {/* This is the main content area that is always visible on desktop */}
                    <div className="flex-1 h-full overflow-y-auto">
                        <Pane3_ContentDisplay />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MainLayout;
