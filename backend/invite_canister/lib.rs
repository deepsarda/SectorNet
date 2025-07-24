use candid::{ CandidType, Deserialize, Principal };
use ic_cdk::api::caller;
use ic_cdk_macros::*;
use std::cell::RefCell;
use std::collections::HashMap;

// ==================================================================================================
// === Types & State ===
// ==================================================================================================

type InviteCodeMap = HashMap<String, Principal>;
type AuthorizedSectorSet = HashMap<Principal, ()>;

// In-memory State
thread_local! {
    static INVITE_CODES: RefCell<InviteCodeMap> = RefCell::new(HashMap::new());
    static AUTHORIZED_SECTORS: RefCell<AuthorizedSectorSet> = RefCell::new(HashMap::new());
    static OWNER: RefCell<Principal> = RefCell::new(Principal::anonymous());
    static FACTORY_CANISTER_ID: RefCell<Principal> = RefCell::new(Principal::anonymous());
}

// Stable State for Upgrades
#[derive(CandidType, Deserialize)]
struct StableState {
    invite_codes: Vec<(String, Principal)>,
    authorized_sectors: Vec<(Principal, ())>,
    owner: Principal,
    factory_canister_id: Principal,
}

// ==================================================================================================
// === Upgrade Hooks ===
// ==================================================================================================

#[pre_upgrade]
fn pre_upgrade() {
    let state = StableState {
        invite_codes: INVITE_CODES.with(|codes|
            codes
                .borrow()
                .iter()
                .map(|(k, v)| (k.clone(), *v))
                .collect()
        ),
        authorized_sectors: AUTHORIZED_SECTORS.with(|sectors|
            sectors
                .borrow()
                .iter()
                .map(|(k, v)| (*k, *v))
                .collect()
        ),
        owner: OWNER.with(|o| *o.borrow()),
        factory_canister_id: FACTORY_CANISTER_ID.with(|id| *id.borrow()),
    };
    ic_cdk::storage::stable_save((state,)).unwrap();
}

#[post_upgrade]
fn post_upgrade() {
    let (state,): (StableState,) = ic_cdk::storage::stable_restore().unwrap();
    INVITE_CODES.with(|codes| {
        *codes.borrow_mut() = state.invite_codes.into_iter().collect();
    });
    AUTHORIZED_SECTORS.with(|sectors| {
        *sectors.borrow_mut() = state.authorized_sectors.into_iter().collect();
    });
    OWNER.with(|o| {
        *o.borrow_mut() = state.owner;
    });
    FACTORY_CANISTER_ID.with(|id| {
        *id.borrow_mut() = state.factory_canister_id;
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
}

// Private helper for authorization
fn is_owner(principal: Principal) -> bool {
    principal == OWNER.with(|o| *o.borrow())
}

#[update]
fn set_factory_canister(id: Principal) -> Result<(), String> {
    if !is_owner(caller()) {
        return Err("Unauthorized".to_string());
    }
    FACTORY_CANISTER_ID.with(|f_id| {
        *f_id.borrow_mut() = id;
    });
    Ok(())
}

// ==================================================================================================
// === Public Update Calls ===
// ==================================================================================================

#[update]
fn register_new_private_sector(sector_id: Principal) {
    if caller() == FACTORY_CANISTER_ID.with(|id| *id.borrow()) {
        AUTHORIZED_SECTORS.with(|sectors| sectors.borrow_mut().insert(sector_id, ()));
    }
}

#[update]
fn register_code(code: String) -> Result<(), String> {
    let caller = caller();

    if !AUTHORIZED_SECTORS.with(|s| s.borrow().contains_key(&caller)) {
        return Err("Unauthorized: This canister is not an authorized private sector.".to_string());
    }

    if INVITE_CODES.with(|c| c.borrow().contains_key(&code)) {
        return Err("Invite code is already taken.".to_string());
    }

    INVITE_CODES.with(|c| c.borrow_mut().insert(code, caller));
    Ok(())
}

#[update]
fn revoke_code(code: String) -> Result<(), String> {
    let caller = caller();
    let maybe_owner = INVITE_CODES.with(|c| c.borrow().get(&code).cloned());

    match maybe_owner {
        None => {
            // Code doesn't exist, which is a valid end state.
            Ok(())
        }
        Some(sector_principal) => {
            if caller != sector_principal {
                return Err("Unauthorized: You do not own this invite code.".to_string());
            }
            INVITE_CODES.with(|c| c.borrow_mut().remove(&code));
            Ok(())
        }
    }
}

// ==================================================================================================
// === Public Query Calls ===
// ==================================================================================================

#[query]
fn resolve_code(code: String) -> Option<Principal> {
    INVITE_CODES.with(|c| c.borrow().get(&code).cloned())
}

// Export the interface for the smart contract.
ic_cdk::export_candid!();
