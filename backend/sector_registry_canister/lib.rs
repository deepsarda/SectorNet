#![allow(warnings)] 

use candid::{ CandidType, Deserialize, Principal, Encode, Decode };
use ic_cdk::api::caller;
use ic_cdk_macros::*;
use ic_stable_structures::memory_manager::{ MemoryId, MemoryManager, VirtualMemory };
// Use the correct path for the 'Bound' enum
use ic_stable_structures::storable::Bound;
use ic_stable_structures::{ DefaultMemoryImpl, StableBTreeMap, Storable };
use std::borrow::Cow;
use std::cell::RefCell;

// ==================================================================================================
// === Types & State ===
// ==================================================================================================

#[derive(CandidType, Clone, Deserialize, Debug)]
pub struct SectorInfo {
    pub id: Principal,
    pub name: String,
    pub abbreviation: String,
    pub description: String,
    pub member_count: u64,
    pub is_vetted: bool,
}

// Custom Error Type
#[derive(CandidType, Deserialize)]
pub enum Error {
    Unauthorized,
    NotFound,
    AlreadyRegistered,
}

// Stable Memory Setup
type Memory = VirtualMemory<DefaultMemoryImpl>;

// Define storable wrappers for use in StableBTreeMap
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

impl Storable for SectorInfo {
    fn to_bytes(&self) -> Cow<[u8]> {
        Cow::Owned(Encode!(self).unwrap())
    }

    fn from_bytes(bytes: Cow<[u8]>) -> Self {
        Decode!(&bytes, Self).unwrap()
    }

    fn into_bytes(self) -> Vec<u8> {
        Encode!(&self).unwrap()
    }

    const BOUND: Bound = Bound::Unbounded;
}

// Memory IDs for stable structures
const SECTORS_MAP_MEMORY_ID: MemoryId = MemoryId::new(0);

thread_local! {
    static MEMORY_MANAGER: RefCell<MemoryManager<DefaultMemoryImpl>> = RefCell::new(
        MemoryManager::init(DefaultMemoryImpl::default())
    );

    // The main directory of all public sectors
    static SECTORS: RefCell<StableBTreeMap<StorablePrincipal, SectorInfo, Memory>> = RefCell::new(
        StableBTreeMap::init(MEMORY_MANAGER.with(|m| m.borrow().get(SECTORS_MAP_MEMORY_ID)))
    );

    // Manually-persisted stable state
    static OWNER: RefCell<Principal> = RefCell::new(Principal::anonymous());
    static FACTORY_CANISTER_ID: RefCell<Principal> = RefCell::new(Principal::anonymous());
    // In a real app, this would be the Governance canister principal
    static GOVERNANCE_CANISTER_ID: RefCell<Principal> = RefCell::new(Principal::anonymous());
}

// ==================================================================================================
// === Upgrade Hooks ===
// ==================================================================================================

#[derive(CandidType, Deserialize)]
struct NonStableState {
    owner: Principal,
    factory_canister_id: Principal,
    governance_canister_id: Principal,
}

#[pre_upgrade]
fn pre_upgrade() {
    let state = NonStableState {
        owner: OWNER.with(|o| *o.borrow()),
        factory_canister_id: FACTORY_CANISTER_ID.with(|id| *id.borrow()),
        governance_canister_id: GOVERNANCE_CANISTER_ID.with(|id| *id.borrow()),
    };
    ic_cdk::storage::stable_save((state,)).unwrap();
}

#[post_upgrade]
fn post_upgrade() {
    let (state,): (NonStableState,) = ic_cdk::storage::stable_restore().unwrap();
    OWNER.with(|o| {
        *o.borrow_mut() = state.owner;
    });
    FACTORY_CANISTER_ID.with(|id| {
        *id.borrow_mut() = state.factory_canister_id;
    });
    GOVERNANCE_CANISTER_ID.with(|id| {
        *id.borrow_mut() = state.governance_canister_id;
    });
}

// ==================================================================================================
// === Initialization & Setup (Owner Only) ===
// ==================================================================================================

#[init]
fn init(initial_owner: Principal, initial_factory: Principal) {
    OWNER.with(|o| {
        *o.borrow_mut() = initial_owner;
    });
    FACTORY_CANISTER_ID.with(|id| {
        *id.borrow_mut() = initial_factory;
    });
    // The governance canister can be set post-init by the owner
    GOVERNANCE_CANISTER_ID.with(|id| {
        *id.borrow_mut() = initial_owner;
    });
}

fn is_owner() -> Result<(), Error> {
    if caller() != OWNER.with(|o| *o.borrow()) { Err(Error::Unauthorized) } else { Ok(()) }
}

fn is_governance() -> Result<(), Error> {
    if caller() != GOVERNANCE_CANISTER_ID.with(|id| *id.borrow()) {
        Err(Error::Unauthorized)
    } else {
        Ok(())
    }
}

#[update]
fn set_factory_canister(id: Principal) -> Result<(), Error> {
    is_owner()?;
    FACTORY_CANISTER_ID.with(|f_id| {
        *f_id.borrow_mut() = id;
    });
    Ok(())
}

// ==================================================================================================
// === Public Update Calls ===
// ==================================================================================================

#[update]
fn register_sector(info: SectorInfo) -> Result<(), Error> {
    if caller() != FACTORY_CANISTER_ID.with(|id| *id.borrow()) {
        return Err(Error::Unauthorized);
    }

    let id = StorablePrincipal(info.id);
    SECTORS.with(|s| {
        if s.borrow().contains_key(&id) {
            return Err(Error::AlreadyRegistered);
        }
        s.borrow_mut().insert(id, info);
        Ok(())
    })
}

#[update]
fn update_sector_listing(info: SectorInfo) -> Result<(), Error> {
    if caller() != info.id {
        return Err(Error::Unauthorized);
    }

    let id = StorablePrincipal(info.id);
    SECTORS.with(|s| {
        let mut sectors_map = s.borrow_mut();
        let old_info = sectors_map.get(&id).ok_or(Error::NotFound)?;

        let updated_info = SectorInfo {
            is_vetted: old_info.is_vetted, // Preserve vetted status
            ..info
        };
        sectors_map.insert(id, updated_info);
        Ok(())
    })
}

#[update]
fn set_sector_vetted_status(sector_id: Principal, new_status: bool) -> Result<(), Error> {
    // In a real app, this should check for the governance canister
    is_governance()?;

    let id = StorablePrincipal(sector_id);
    SECTORS.with(|s| {
        let mut sectors_map = s.borrow_mut();
        let mut info = sectors_map.get(&id).ok_or(Error::NotFound)?;

        info.is_vetted = new_status;
        sectors_map.insert(id, info);
        Ok(())
    })
}

// ==================================================================================================
// === Public Query Calls ===
// ==================================================================================================

#[query]
fn search_sectors(query_text: String) -> Vec<SectorInfo> {
    if query_text.is_empty() {
        // To get only the values, use the '.values()' iterator.
        return SECTORS.with(|s| s.borrow().values().collect());
    }

    let query_lower = query_text.to_lowercase();
    SECTORS.with(|s| {
        s.borrow()
            .values() // Use '.values()' for efficiency when keys are not needed.
            .filter(
                |info|
                    info.name.to_lowercase().contains(&query_lower) ||
                    info.description.to_lowercase().contains(&query_lower)
            )
            .collect()
    })
}

#[query]
fn get_vetted_sectors() -> Vec<SectorInfo> {
    SECTORS.with(|s| {
        s.borrow()
            .values() // Use '.values()' to iterate over values directly.
            .filter(|info| info.is_vetted)
            .collect()
    })
}

// Export the interface for the smart contract.
ic_cdk::export_candid!();
