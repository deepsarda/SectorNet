use candid::{ CandidType, Deserialize, Principal, Encode, Decode };
use ic_cdk::api::{ msg_caller, time };
use ic_cdk_macros::*;
use ic_stable_structures::memory_manager::{ MemoryId, MemoryManager, VirtualMemory };
use ic_stable_structures::{ DefaultMemoryImpl, StableBTreeMap, Storable };
use std::borrow::Cow;
use std::cell::RefCell;
use std::collections::HashSet;
use ic_stable_structures::storable::Bound;

// ==================================================================================================
// === Types & State ===
// ==================================================================================================

// **FIXED**: Added the missing struct definition for StorablePrincipal.
// This wrapper allows Principal to be used as a key in StableBTreeMap.
#[derive(CandidType, Deserialize, Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct StorablePrincipal(pub Principal);

#[derive(CandidType, Deserialize, Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum UserTag {
    Admin,
    GlobalPoster,
    User,
}

#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct Profile {
    owner: Principal,
    username: String,
    public_key: Vec<u8>,
    created_at: u64,
    last_seen_timestamp: u64,
    tags: HashSet<UserTag>, // Using HashSet for efficient add/remove/check
    joined_sectors: HashSet<Principal>,
}

// Custom Error Type
#[derive(CandidType, Deserialize, Debug)]
pub enum Error {
    Unauthorized,
    NotFound,
    AlreadyExists(String),
    InvalidInput(String),
}

// Stable Memory Setup
type Memory = VirtualMemory<DefaultMemoryImpl>;

// Define Storable implementations for complex types
impl Storable for Profile {
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
const PROFILES_MEMORY_ID: MemoryId = MemoryId::new(0);
const USERNAMES_MEMORY_ID: MemoryId = MemoryId::new(1);

thread_local! {
    static MEMORY_MANAGER: RefCell<MemoryManager<DefaultMemoryImpl>> = RefCell::new(
        MemoryManager::init(DefaultMemoryImpl::default())
    );

    // Primary profile store: Principal -> Profile
    static PROFILES: RefCell<StableBTreeMap<StorablePrincipal, Profile, Memory>> = RefCell::new(
        StableBTreeMap::init(MEMORY_MANAGER.with(|m| m.borrow().get(PROFILES_MEMORY_ID)))
    );

    // Secondary index for unique username lookup: Username -> Principal
    static USERNAMES: RefCell<StableBTreeMap<String, StorablePrincipal, Memory>> = RefCell::new(
        StableBTreeMap::init(MEMORY_MANAGER.with(|m| m.borrow().get(USERNAMES_MEMORY_ID)))
    );

    // Manually-persisted state (small lists)
    static ADMINS: RefCell<HashSet<Principal>> = RefCell::new(HashSet::new());
    static OWNER: RefCell<Option<Principal>> = RefCell::new(None);
}

// ==================================================================================================
// === Upgrade Hooks ===
// ==================================================================================================

#[derive(CandidType, Deserialize)]
struct NonStableState {
    owner: Option<Principal>,
    admins: HashSet<Principal>,
}

#[pre_upgrade]
fn pre_upgrade() {
    let state = NonStableState {
        owner: OWNER.with(|o| *o.borrow()),
        admins: ADMINS.with(|a| a.borrow().clone()),
    };
    ic_cdk::storage::stable_save((state,)).unwrap();
}

#[post_upgrade]
fn post_upgrade() {
    let (state,): (NonStableState,) = ic_cdk::storage::stable_restore().unwrap();
    OWNER.with(|o| {
        *o.borrow_mut() = state.owner;
    });
    ADMINS.with(|a| {
        *a.borrow_mut() = state.admins;
    });
}

// ==================================================================================================
// === Initialization & Authorization ===
// ==================================================================================================

#[init]
fn init(initial_owner: Principal) {
    OWNER.with(|o| {
        *o.borrow_mut() = Some(initial_owner);
    });
    ADMINS.with(|a| {
        a.borrow_mut().insert(initial_owner);
    });
}

fn is_admin() -> Result<(), Error> {
    let caller = msg_caller();
    if ADMINS.with(|a| a.borrow().contains(&caller)) {
        Ok(())
    } else {
        Err(Error::Unauthorized)
    }
}

// ==================================================================================================
// === Public Update Calls ===
// ==================================================================================================

#[update]
fn create_profile(username: String, public_key: Vec<u8>) -> Result<(), Error> {
    let caller = msg_caller();
    let now = time();

    if caller == Principal::anonymous() {
        return Err(Error::InvalidInput("Anonymous principal not allowed.".to_string()));
    }

    if PROFILES.with(|p| p.borrow().contains_key(&StorablePrincipal(caller))) {
        return Err(Error::AlreadyExists("Profile already exists for this principal.".to_string()));
    }

    if USERNAMES.with(|u| u.borrow().contains_key(&username)) {
        return Err(Error::AlreadyExists("Username is already taken.".to_string()));
    }

    let new_profile = Profile {
        owner: caller,
        username: username.clone(),
        public_key,
        created_at: now,
        last_seen_timestamp: now,
        tags: [UserTag::User].iter().cloned().collect(),
        joined_sectors: HashSet::new(),
    };

    PROFILES.with(|p| p.borrow_mut().insert(StorablePrincipal(caller), new_profile));
    USERNAMES.with(|u| u.borrow_mut().insert(username, StorablePrincipal(caller)));

    Ok(())
}

#[update]
fn add_joined_sector(sector_id: Principal) -> Result<(), Error> {
    let caller = StorablePrincipal(msg_caller());
    PROFILES.with(|p| {
        let mut profiles_map = p.borrow_mut();
        // **FIXED**: Must clone the profile to modify it, as `get` provides an immutable reference.
        let mut profile = profiles_map.get(&caller).ok_or(Error::NotFound)?.clone();
        profile.joined_sectors.insert(sector_id);
        profiles_map.insert(caller, profile); // Insert the modified clone back into the map
        Ok(())
    })
}

#[update]
fn remove_joined_sector(sector_id: Principal) -> Result<(), Error> {
    let caller = StorablePrincipal(msg_caller());
    PROFILES.with(|p| {
        let mut profiles_map = p.borrow_mut();
        // **FIXED**: Must clone to modify
        let mut profile = profiles_map.get(&caller).ok_or(Error::NotFound)?.clone();
        profile.joined_sectors.remove(&sector_id);
        profiles_map.insert(caller, profile);
        Ok(())
    })
}

#[update]
fn update_activity() -> Result<(), Error> {
    let caller = StorablePrincipal(msg_caller());
    PROFILES.with(|p| {
        let mut profiles_map = p.borrow_mut();
        // **FIXED**: Must clone to modify
        let mut profile = profiles_map.get(&caller).ok_or(Error::NotFound)?.clone();
        profile.last_seen_timestamp = time();
        profiles_map.insert(caller, profile);
        Ok(())
    })
}

// ==================================================================================================
// === Public Query Calls ===
// ==================================================================================================

#[query]
fn profile_exists(id: Principal) -> bool {
    PROFILES.with(|p| p.borrow().contains_key(&StorablePrincipal(id)))
}

#[query]
fn get_profile_by_principal(id: Principal) -> Option<Profile> {
    PROFILES.with(|p| p.borrow().get(&StorablePrincipal(id)))
}

#[query]
fn get_profile_by_username(username: String) -> Option<Profile> {
    USERNAMES.with(|u| {
        u.borrow()
            .get(&username)
            .and_then(|principal| { PROFILES.with(|p| p.borrow().get(&principal)) })
    })
}

#[query]
fn get_admins() -> Vec<Principal> {
    ADMINS.with(|a| a.borrow().iter().cloned().collect())
}

// ==================================================================================================
// === Admin Functions ===
// ==================================================================================================

#[update]
fn add_admin(principal: Principal) -> Result<(), Error> {
    is_admin()?;

    let storable_principal = StorablePrincipal(principal);
    PROFILES.with(|p| {
        let mut profiles_map = p.borrow_mut();
        // **FIXED**: Must clone to modify
        let mut profile = profiles_map.get(&storable_principal).ok_or(Error::NotFound)?.clone();

        ADMINS.with(|a| a.borrow_mut().insert(principal));
        profile.tags.insert(UserTag::Admin);
        profiles_map.insert(storable_principal, profile);

        Ok(())
    })
}

#[update]
fn set_user_tag(target_user: Principal, new_tag: UserTag) -> Result<(), Error> {
    is_admin()?;

    let storable_principal = StorablePrincipal(target_user);
    PROFILES.with(|p| {
        let mut profiles_map = p.borrow_mut();
        // **FIXED**: Must clone to modify
        let mut profile = profiles_map.get(&storable_principal).ok_or(Error::NotFound)?.clone();

        // This example replaces all other tags. To add, just use .insert()
        profile.tags.clear();
        profile.tags.insert(new_tag);
        profiles_map.insert(storable_principal, profile);

        Ok(())
    })
}

// Export the interface for the smart contract.
ic_cdk::export_candid!();
