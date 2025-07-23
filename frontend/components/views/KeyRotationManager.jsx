import React, { useState } from 'react';
import useSectorStore from '../../store/sectorStore';
import { KeyIcon } from '@heroicons/react/24/solid';

const KeyRotationManager = (isModerator) => {
  const { performKeyRotation, isDetailsLoading, error } = useSectorStore();
  const [isRotating, setIsRotating] = useState(false);
  const [rotationError, setRotationError] = useState(null);

  const handleRekey = async () => {
    setIsRotating(true);
    setRotationError(null);
    const result = await performKeyRotation();
    if (result && 'Err' in result) {
      setRotationError(result.Err);
    }
    // On success, the store will automatically update the `rekey_required` flag,
    // and this component will no longer be rendered by its parent.
    setIsRotating(false);
  };

  // Use the isDetailsLoading from the store as an indicator that a process is running.
  const isLoading = isDetailsLoading || isRotating;

  return (
    <div className="alert alert-error mt-2">
      <div className="flex-1">
        <KeyIcon className="w-6 h-6 mr-2" />
        <div>
            <h3 className="font-bold">Security Alert: Rekey Required!</h3>
            <div className="text-xs">A member has left, compromising the current encryption key. To ensure forward secrecy, you must generate and distribute a new key.</div>
            {rotationError && <p className="text-xs mt-2 font-bold">Error: {rotationError}</p>}
        </div>
      </div>
      <div className="flex-none">
        {isModerator? <button className="btn btn-sm btn-outline" onClick={handleRekey} disabled={isLoading}>
          {isLoading ? <span className="loading loading-spinner loading-xs"></span> : 'Rotate Sector Key'}
        </button> : <span> Contact a Moderator.</span>}
      </div>
    </div>
  );
};

export default KeyRotationManager;
