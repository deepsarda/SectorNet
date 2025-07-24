import { createActor } from './ic';
import useAuthStore from '../store/authStore';

const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

// Cache structure: Map<sectorId: string, Map<principalText: string, { role: SectorRole, timestamp: number }>>
const roleCache = new Map();

/**
 * A cached function to retrieve a user's role within a specific Sector.
 *
 * @param {import("@dfinity/principal").Principal} sectorId The Principal of the Sector.
 * @param {import("@dfinity/principal").Principal} principal The Principal of the user whose role is needed.
 * @returns {Promise<object|null>} The user's sector role object (e.g., { Member: null }) or null.
 */
const getSectorRole = async (sectorId, principal) => {
  if (!sectorId || !principal) return null;

  const sectorIdText = sectorId.toText();
  const principalText = principal.toText();
  const now = Date.now();

  // Check for a valid, non-expired cache entry
  const sectorCache = roleCache.get(sectorIdText);
  if (sectorCache && sectorCache.has(principalText)) {
    const cachedEntry = sectorCache.get(principalText);
    if (now - cachedEntry.timestamp < CACHE_DURATION_MS) {
      return cachedEntry.role;
    }
  }

  // If not cached or expired, fetch from the canister
  try {
    const { identity } = useAuthStore.getState();
    // This call requires an identity to prove membership for querying roles
    const actor = createActor('sector_canister', { canisterId: sectorId, agentOptions: { identity } });
    
    const result = await actor.get_member_role(principal);
    const role = result.length > 0 ? result[0] : null;

    // Update the cache
    if (!roleCache.has(sectorIdText)) {
      roleCache.set(sectorIdText, new Map());
    }
    roleCache.get(sectorIdText).set(principalText, { role, timestamp: now });
    
    return role;

  } catch (err) {
    // This can happen if the user is not a member of the sector, which is normal.
    return null;
  }
};

export default getSectorRole;