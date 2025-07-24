import { Actor, HttpAgent } from "@dfinity/agent";

// Import all generated Candid interfaces from the 'declarations' alias
// WARNING: This assumes `dfx generate backend` has been run successfully.
import { idlFactory as userCanisterIdl } from 'declarations/user_canister';
import { idlFactory as sectorFactoryCanisterIdl } from 'declarations/sector_factory_canister';
import { idlFactory as sectorRegistryCanisterIdl } from 'declarations/sector_registry_canister';
import { idlFactory as inviteCanisterIdl } from 'declarations/invite_canister';
import { idlFactory as sectorCanisterIdl } from 'declarations/sector_canister';
import { idlFactory as globalFeedCanisterIdl } from 'declarations/global_feed_canister';
import { idlFactory as governanceCanisterIdl } from 'declarations/governance_canister';


// Map of canister names to their CANISTER_ID from the .env file
const canisterIds = {
  user_canister: process.env.CANISTER_ID_USER_CANISTER,
  sector_factory_canister: process.env.CANISTER_ID_SECTOR_FACTORY_CANISTER,
  sector_registry_canister: process.env.CANISTER_ID_SECTOR_REGISTRY_CANISTER,
  invite_canister: process.env.CANISTER_ID_INVITE_CANISTER,
  sector_canister: process.env.CANISTER_ID_SECTOR_CANISTER, // Note: This will be dynamically handled for multiple sectors
  global_feed_canister: process.env.CANISTER_ID_GLOBAL_FEED_CANISTER,
  governance_canister: process.env.CANISTER_ID_GOVERNANCE_CANISTER,
};

// Map of canister names to their imported IDL factory
const idlFactories = {
  user_canister: userCanisterIdl,
  sector_factory_canister: sectorFactoryCanisterIdl,
  sector_registry_canister: sectorRegistryCanisterIdl,
  invite_canister: inviteCanisterIdl,
  sector_canister: sectorCanisterIdl,
  global_feed_canister: globalFeedCanisterIdl,
  governance_canister: governanceCanisterIdl,
};

const host = process.env.DFX_NETWORK === "ic" ? "https://icp-api.io" : "http://localhost:4943";

/**
 * Creates an actor for a specified canister. This is the main function used by the stores.
 * @param {string} canisterName - The name of the canister as defined in the maps above (e.g., "user_canister").
 * @param {object} [options] - Optional actor configuration.
 * @param {object} [options.agentOptions] - Options for creating a new HttpAgent (e.g., providing an identity).
 * @param {Principal | string} [options.canisterId] - Optionally override the canister ID. This is ESSENTIAL for creating actors for dynamic canisters like individual Sectors.
 * @returns {import("@dfinity/agent").ActorSubclass}
 */
export const createActor = (canisterName, options = {}) => {
  const agent = new HttpAgent({ ...options.agentOptions, host });

  // Fetches the root key for local development.
  if (process.env.DFX_NETWORK !== "ic") {
    agent.fetchRootKey().catch(err => {
      console.warn("Unable to fetch root key. Check to ensure the local replica is running.");
      console.error(err);
    });
  }

  // Determine the canister ID: use the override if provided, otherwise use the default from .env
  const canisterId = options.canisterId || canisterIds[canisterName];
  
  if (!idlFactories[canisterName]) {
    throw new Error(`No IDL factory found for canister: ${canisterName}`);
  }
  if (!canisterId) {
    throw new Error(`No canister ID found for canister: ${canisterName}`);
  }

  return Actor.createActor(idlFactories[canisterName], {
    agent,
    canisterId,
  });
};