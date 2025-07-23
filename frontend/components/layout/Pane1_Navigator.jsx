import React, { useEffect } from 'react';
import useUiStore from '../../store/uiStore';
import useSectorStore from '../../store/sectorStore';

const Pane1_Navigator = () => {
  const { activeNavigator, setNavigator } = useUiStore();
  const { joinedSectors, isListLoading, fetchJoinedSectors } = useSectorStore();

  useEffect(() => {
    // Fetch the list of joined sectors when the component mounts
    fetchJoinedSectors();
  }, [fetchJoinedSectors]);

  const baseClasses = "w-12 h-12 flex items-center justify-center font-bold text-lg cursor-pointer transition-all duration-200 hover:scale-110";
  const activeClasses = "bg-glassterm-accent text-black scale-110";
  const inactiveClasses = "bg-slate-700 hover:bg-slate-600";

  return (
    <div className="bg-black/20 h-full p-2 flex flex-col items-center space-y-4 pt-4 font-mono">
      <div className="tooltip tooltip-right" data-tip="Global">
        <div
          onClick={() => setNavigator('global')}
          className={`${baseClasses} ${activeNavigator === 'global' ? activeClasses : inactiveClasses}`}
        >
          [G]
        </div>
      </div>
      
      <div className="w-full border-b border-slate-700 my-2"></div>

      <div className="flex flex-col items-center space-y-4 overflow-y-auto">
        {isListLoading ? (
          <span className="loading loading-spinner loading-sm"></span>
        ) : (
          joinedSectors.map(sector => (
            <div key={sector.id.toText()} className="tooltip tooltip-right" data-tip={sector.name}>
              <div
                onClick={() => setNavigator(sector.id)}
                className={`${baseClasses} ${activeNavigator === sector.id ? activeClasses : inactiveClasses}`}
              >
                [{sector.abbreviation}]
              </div>
            </div>
          ))
        )}
      </div>

      <div className="w-12 h-12 border-2 border-dashed border-slate-500 flex items-center justify-center font-bold text-lg mt-auto cursor-pointer hover:bg-slate-700 transition-colors">
        [+]
      </div>
    </div>
  );
};

export default Pane1_Navigator;
