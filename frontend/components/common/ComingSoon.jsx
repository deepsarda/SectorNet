import React from 'react';

const ComingSoon = ({ featureName }) => {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center font-mono p-4">
      <h2 className="text-3xl font-bold text-slate-100 mb-2">{featureName}</h2>
      <p className="text-xl text-glassterm-accent">[ Feature Coming Soon ]</p>
      <p className="text-slate-400 mt-4 max-w-md">
        This area is under active development. Check back later for updates on community proposals, voting, and the full implementation of the SectorNet DAO.
      </p>
    </div>
  );
};

export default ComingSoon;
