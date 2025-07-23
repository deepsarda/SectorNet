import { createActor } from './ic';

// The cache will hold profiles for 5 minutes.
const CACHE_DURATION_MS = 5 * 60 * 1000; 

// This is our in-memory cache.
// The structure will be: Map<principalText: string, { profile: Profile, timestamp: number }>
const cache = new Map();

// The public actor for the user canister doesn't need an identity.
const userCanisterActor = createActor('user_canister');

/**
 * A cached function to retrieve a user's profile by their Principal.
 * If the profile is in the cache and not expired, it returns it instantly.
 * Otherwise, it fetches from the canister, updates the cache, and returns the result.
 * 
 * @param {import("@dfinity/principal").Principal} principal The principal of the user to fetch.
 * @returns {Promise<object|null>} The user's profile object or null if not found.
 */
const getUserProfile = async (principal) => {
  if (!principal) return null;
  const principalText = principal.toText();
  const now = Date.now();

  // 1. Check if a valid, non-expired entry exists in the cache.
  if (cache.has(principalText)) {
    const cachedEntry = cache.get(principalText);
    if (now - cachedEntry.timestamp < CACHE_DURATION_MS) {
      return cachedEntry.profile; // Return from cache
    }
  }

  // 2. If not in cache or expired, fetch from the canister.
  try {
    const result = await userCanisterActor.get_profile_by_principal(principal);
    const profile = result.length > 0 ? result[0] : null;

    if (profile) {
      // 3. Update the cache with the new data and timestamp.
      cache.set(principalText, { profile, timestamp: now });
    }
    
    return profile;

  } catch (err) {
    console.error(`Failed to fetch profile for ${principalText}:`, err);
    return null; // Return null on error
  }
};

export default getUserProfile;
