#![allow(warnings)] 

use candid::{ CandidType, Deserialize, Encode, Principal };
use ic_cdk::api::{ caller, time };
use ic_cdk_macros::*;
use ic_stable_structures::memory_manager::{ MemoryId, MemoryManager, VirtualMemory };
use ic_stable_structures::{ DefaultMemoryImpl, StableBTreeMap, Storable };
use std::borrow::Cow;
use std::cell::RefCell;
use ic_stable_structures::storable::Bound;
use ic_cdk::api::management_canister::main::{
    create_canister, install_code, CanisterInstallMode, CanisterSettings, CreateCanisterArgument,
    InstallCodeArgument, CanisterIdRecord,
};

// ==================================================================================================
// === Types & State ===
// ==================================================================================================

// Imported Types (from other canisters)
#[derive(CandidType, Clone, Deserialize)]
pub enum ChatSecurityModel {
    HighSecurityE2EE,
    StandardAccessControl,
}

#[derive(CandidType, Clone, Deserialize)]
pub struct SectorConfig {
    name: String,
    abbreviation: String,
    description: String,
    is_private: bool,
    security_model: ChatSecurityModel,
    owner: Principal,
}

#[derive(CandidType, Deserialize)]
pub struct SectorInfo {
    id: Principal,
    name: String,
    abbreviation: String,
    description: String,
    member_count: u64,
    is_vetted: bool,
}

// Custom Error Type
#[derive(CandidType, Deserialize)]
pub enum Error {
    Unauthorized,
    ConfigError(String),
    RateLimitExceeded,
    CreationFailed(String),
    InstallFailed(String),
    CallFailed(String),
}

// Stable Memory Setup
type Memory = VirtualMemory<DefaultMemoryImpl>;

// Define storable wrapper for Principal for use in StableBTreeMap
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
struct StorablePrincipal(Principal);

impl Storable for StorablePrincipal {
    fn to_bytes(&self) -> Cow<[u8]> {
        Cow::from(self.0.as_slice())
    }

    fn from_bytes(bytes: Cow<[u8]>) -> Self {
        Self(Principal::from_slice(&bytes))
    }

    fn into_bytes(self) -> Vec<u8> {
        self.0.as_slice().to_vec()
    }

    const BOUND: Bound = Bound::Bounded {
        max_size: 29, // Max size for a Principal
        is_fixed_size: false,
    };
}

// Memory IDs for stable structures
const RATE_LIMIT_MAP_MEMORY_ID: MemoryId = MemoryId::new(0);
static SECTOR_WASM_BYTES: &[u8] = include_bytes!("../../target/wasm32-unknown-unknown/release/sector_canister.wasm");

thread_local! {
    // Manages stable memory allocation
    static MEMORY_MANAGER: RefCell<MemoryManager<DefaultMemoryImpl>> = RefCell::new(
        MemoryManager::init(DefaultMemoryImpl::default())
    );

    // Stable state that persists across upgrades automatically
    static RATE_LIMIT_MAP: RefCell<StableBTreeMap<StorablePrincipal, u64, Memory>> = RefCell::new(
        StableBTreeMap::init(MEMORY_MANAGER.with(|m| m.borrow().get(RATE_LIMIT_MAP_MEMORY_ID)))
    );

    // State that needs manual saving on upgrade
    static OWNER: RefCell<Option<Principal>> = RefCell::new(None);
    static SECTOR_WASM: RefCell<Vec<u8>> = RefCell::new(SECTOR_WASM_BYTES.to_vec());
    static REGISTRY_CANISTER_ID: RefCell<Option<Principal>> = RefCell::new(None);
    static INVITE_CANISTER_ID: RefCell<Option<Principal>> = RefCell::new(None);
    static GLOBAL_FEED_CANISTER_ID: RefCell<Option<Principal>> = RefCell::new(None);
}

// Constants
const RATE_LIMIT_DURATION: u64 = 6 * 3_600 * 1_000_000_000; // 6 hours
const INITIAL_SECTOR_CYCLES: u128 = 2_000_000_000_000; // 2T cycles recommended by IC docs

// ==================================================================================================
// === Upgrade Hooks ===
// ==================================================================================================

#[derive(CandidType, Deserialize)]
struct NonStableState {
    owner: Option<Principal>,
    registry_canister_id: Option<Principal>,
    invite_canister_id: Option<Principal>,
    global_feed_canister_id: Option<Principal>
}

#[pre_upgrade]
fn pre_upgrade() {
    let state = NonStableState {
        owner: OWNER.with(|o| *o.borrow()),
        registry_canister_id: REGISTRY_CANISTER_ID.with(|id| *id.borrow()),
        invite_canister_id: INVITE_CANISTER_ID.with(|id| *id.borrow()),
        global_feed_canister_id: GLOBAL_FEED_CANISTER_ID.with(|id| *id.borrow()),
    };
    ic_cdk::storage::stable_save((state,)).unwrap();
}

#[post_upgrade]
fn post_upgrade() {
    let (state,): (NonStableState,) = ic_cdk::storage::stable_restore().unwrap();
    OWNER.with(|o| {
        *o.borrow_mut() = state.owner;
    });
    REGISTRY_CANISTER_ID.with(|id| {
        *id.borrow_mut() = state.registry_canister_id;
    });
    INVITE_CANISTER_ID.with(|id| {
        *id.borrow_mut() = state.invite_canister_id;
    });
    GLOBAL_FEED_CANISTER_ID.with(|id| {
        *id.borrow_mut() = state.global_feed_canister_id;
    });
}

// ==================================================================================================
// === Initialization & Setup (Owner Only) ===
// ==================================================================================================

#[init]
fn init(initial_owner: Principal) {
    OWNER.with(|o| {
        *o.borrow_mut() = Some(initial_owner);
    });
}

fn is_owner() -> Result<(), Error> {
    let caller = caller();
    OWNER.with(|o| {
        match *o.borrow() {
            Some(owner) if owner == caller => Ok(()),
            _ => Err(Error::Unauthorized),
        }
    })
}

#[update]
fn set_registry_canister(id: Principal) -> Result<(), Error> {
    is_owner()?;
    REGISTRY_CANISTER_ID.with(|reg_id| *reg_id.borrow_mut() = Some(id));
    Ok(())
}


#[update]
fn set_invite_canister(id: Principal) -> Result<(), Error> {
    is_owner()?;
    INVITE_CANISTER_ID.with(|inv_id| {
        *inv_id.borrow_mut() = Some(id);
    });
    Ok(())
}

#[update]
fn set_global_feed_canister(id: Principal) -> Result<(), Error> {
    is_owner()?;
    GLOBAL_FEED_CANISTER_ID.with(|glo_id| {
        *glo_id.borrow_mut() = Some(id);
    });
    Ok(())
}

// ==================================================================================================
// === Core Public Function ===
// ==================================================================================================

#[update]
async fn create_new_sector(config: SectorConfig) -> Result<Principal, Error> {
    let caller = caller();
    let now = time();

    // Authorization & Pre-condition Checks
    if caller == Principal::anonymous() {
        return Err(Error::Unauthorized);
    }
    let wasm_module = SECTOR_WASM.with(|w| w.borrow().clone());

    // Enforce Rate Limiting
    RATE_LIMIT_MAP.with(|map| {
        if let Some(last_creation) = map.borrow().get(&StorablePrincipal(caller)) {
            if now - last_creation < RATE_LIMIT_DURATION {
                return Err(Error::RateLimitExceeded);
            }
        }
        Ok(())
    })?;

    let invite_id = INVITE_CANISTER_ID.with(|id| id.borrow().clone()).ok_or_else(|| Error::ConfigError("Invite canister ID not configured in factory.".to_string()))?;
    let global_feed_id = GLOBAL_FEED_CANISTER_ID.with(|id| id.borrow().clone()).ok_or_else(|| Error::ConfigError("Global Feed canister ID not configured in factory.".to_string()))?;
    let user_id = caller;

    // Prepare canister settings
    let create_arg = CreateCanisterArgument { settings: Some(CanisterSettings {
            controllers: Some(vec![caller, ic_cdk::id()]), // Set creator and factory as controllers
            ..Default::default()
    })};

    let (canister_result,): (CanisterIdRecord,) = create_canister(create_arg, INITIAL_SECTOR_CYCLES).await
        .map_err(|(code, msg)| Error::CreationFailed(format!("Code {:?}: {}", code, msg)))?;
    
    let new_canister_id = canister_result.canister_id;

    // Encode ALL the arguments required by the sector's init function.
    let install_arg = Encode!(&config, &invite_id, &global_feed_id, &user_id)
        .map_err(|e| Error::InstallFailed(format!("Failed to encode init arguments: {}", e)))?;


    // Install the SectorCanister code on the new instance
    let install_arg = Encode!(&config).map_err(|e| Error::InstallFailed(format!("Failed to encode arg: {}", e)))?;
    let install_code_arg = InstallCodeArgument {
        mode: CanisterInstallMode::Install,
        canister_id: new_canister_id,
        wasm_module,
        arg: install_arg,
    };

    install_code(install_code_arg).await
        .map_err(|(code, msg)| Error::InstallFailed(format!("Install Failed Code {:?}: {}", code, msg)))?;
    
    // Register the new sector with the appropriate directory service
    if config.is_private {
        if let Some(invite_id) = INVITE_CANISTER_ID.with(|id| *id.borrow()) {
            let _ = ic_cdk::call::<_, ()>(invite_id, "register_new_private_sector", (new_canister_id,)).await;
        }
    } else {
        if let Some(registry_id) = REGISTRY_CANISTER_ID.with(|id| *id.borrow()) {
            let sector_info = SectorInfo {
                id: new_canister_id,
                name: config.name,
                abbreviation: config.abbreviation,
                description: config.description,
                member_count: 1,
                is_vetted: false,
            };
            let _ = ic_cdk::call::<_, (Result<(), String>,)>(registry_id, "register_sector", (sector_info,)).await;
        }
    }
    
    // On success, update the rate-limit map
    RATE_LIMIT_MAP.with(|map| map.borrow_mut().insert(StorablePrincipal(caller), now));

    Ok(new_canister_id)
}

// Export the interface for the smart contract.
ic_cdk::export_candid!();
