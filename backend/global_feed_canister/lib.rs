use candid::{CandidType, Deserialize, Principal};
use ic_cdk::api::time;
use ic_cdk_macros::*;
use std::cell::RefCell;
use std::collections::HashMap;

// === Types & State ===

#[derive(CandidType, Deserialize, Clone, Copy, PartialEq, Eq, Hash)]
pub enum UserTag {
    Admin,
    GlobalPoster,
    User,
}

#[derive(CandidType, Deserialize, Clone, Copy, PartialEq, Eq, Hash)]
pub enum SectorRole {
    Moderator,
    Poster,
    Member,
}

#[derive(CandidType, Deserialize, Clone)]
pub struct GlobalPost {
    id: u64,
    author_principal: Principal,
    author_username: String,
    author_user_tag: Option<UserTag>,
    author_sector_role: Option<SectorRole>,
    content_markdown: String,
    timestamp: u64, // Represented as nanoseconds from epoch
    origin_sector_id: Option<Principal>,
}

#[derive(CandidType, Deserialize)]
pub struct DirectPostSubmission {
    content_markdown: String,
}

#[derive(CandidType, Deserialize)]
pub struct SectorPostSubmission {
    author_principal: Principal,
    author_username: String,
    content_markdown: String,
    origin_sector_id: Principal,
}

type PostStore = HashMap<u64, GlobalPost>;
type PrincipalSet = HashMap<Principal, ()>;

// In-memory State
thread_local! {
    static POSTS: RefCell<PostStore> = RefCell::new(HashMap::new());
    static VETTED_SECTORS: RefCell<PrincipalSet> = RefCell::new(HashMap::new());
    static GLOBAL_POSTERS: RefCell<PrincipalSet> = RefCell::new(HashMap::new());
    static ADMINS: RefCell<PrincipalSet> = RefCell::new(HashMap::new());
    static NEXT_POST_ID: RefCell<u64> = RefCell::new(0);
    static OWNER: RefCell<Principal> = RefCell::new(Principal::from_text("2vxsx-fae").unwrap());
    static GOVERNANCE_CANISTER_ID: RefCell<Option<Principal>> = RefCell::new(None);
}

// === Upgrade Hooks ===

#[pre_upgrade]
fn pre_upgrade() {
    let posts_entries: Vec<(u64, GlobalPost)> = POSTS.with(|p| p.borrow().iter().map(|(k, v)| (*k, v.clone())).collect());
    let vetted_sectors_entries: Vec<(Principal, ())> = VETTED_SECTORS.with(|s| s.borrow().iter().map(|(k, v)| (*k, *v)).collect());
    let global_posters_entries: Vec<(Principal, ())> = GLOBAL_POSTERS.with(|p| p.borrow().iter().map(|(k, v)| (*k, *v)).collect());
    let admins_entries: Vec<(Principal, ())> = ADMINS.with(|a| a.borrow().iter().map(|(k, v)| (*k, *v)).collect());
    
    let state = (
        posts_entries,
        NEXT_POST_ID.with(|id| *id.borrow()),
        vetted_sectors_entries,
        global_posters_entries,
        admins_entries,
        OWNER.with(|o| *o.borrow()),
        GOVERNANCE_CANISTER_ID.with(|id| *id.borrow()),
    );
    
    ic_cdk::storage::stable_save((state,)).unwrap();
}

#[post_upgrade]
fn post_upgrade() {
    let (
        posts_entries,
        next_post_id,
        vetted_sectors_entries,
        global_posters_entries,
        admins_entries,
        owner,
        governance_canister_id,
    ): (Vec<(u64, GlobalPost)>, u64, Vec<(Principal, ())>, Vec<(Principal, ())>, Vec<(Principal, ())>, Principal, Option<Principal>) = ic_cdk::storage::stable_restore().unwrap();

    POSTS.with(|p| *p.borrow_mut() = posts_entries.into_iter().collect());
    NEXT_POST_ID.with(|id| *id.borrow_mut() = next_post_id);
    VETTED_SECTORS.with(|s| *s.borrow_mut() = vetted_sectors_entries.into_iter().collect());
    GLOBAL_POSTERS.with(|p| *p.borrow_mut() = global_posters_entries.into_iter().collect());
    ADMINS.with(|a| *a.borrow_mut() = admins_entries.into_iter().collect());
    OWNER.with(|o| *o.borrow_mut() = owner);
    GOVERNANCE_CANISTER_ID.with(|id| *id.borrow_mut() = governance_canister_id);
}


// === Initialization & Setup (Owner Only) ===

#[init]
fn init(initial_owner: Principal) {
    OWNER.with(|o| *o.borrow_mut() = initial_owner);
    ADMINS.with(|a| a.borrow_mut().insert(initial_owner, ()));
}

// Helper to check if a principal is an admin.
fn is_admin(p: &Principal) -> bool {
    ADMINS.with(|a| a.borrow().contains_key(p))
}

#[update]
fn set_governance_canister(id: Principal) -> Result<(), String> {
    let caller = ic_cdk::api::msg_caller();
    if caller != OWNER.with(|o| *o.borrow()) {
        return Err("Unauthorized: Only owner can set governance ID.".to_string());
    }
    GOVERNANCE_CANISTER_ID.with(|gov_id| *gov_id.borrow_mut() = Some(id));
    Ok(())
}


// === Public Update Calls (Content Submission) ===

#[update]
fn submit_post_from_sector(post_data: SectorPostSubmission) -> Result<u64, String> {
    let caller = ic_cdk::api::msg_caller();
    if !VETTED_SECTORS.with(|s| s.borrow().contains_key(&caller)) {
        return Err("Unauthorized: Calling canister is not a vetted sector.".to_string());
    }

    let id = NEXT_POST_ID.with(|next_id| {
        let mut next_id = next_id.borrow_mut();
        let id = *next_id;
        *next_id += 1;
        id
    });

    let new_post = GlobalPost {
        id,
        author_principal: post_data.author_principal,
        author_username: post_data.author_username,
        author_user_tag: None,
        author_sector_role: None,
        content_markdown: post_data.content_markdown,
        timestamp: time(),
        origin_sector_id: Some(post_data.origin_sector_id),
    };

    POSTS.with(|p| p.borrow_mut().insert(id, new_post));
    Ok(id)
}

#[update]
fn submit_direct_post(post_data: DirectPostSubmission, author_username: String, author_tag: UserTag) -> Result<u64, String> {
    let caller = ic_cdk::api::msg_caller();
    let is_admin = is_admin(&caller);
    let is_global_poster = GLOBAL_POSTERS.with(|gp| gp.borrow().contains_key(&caller));

    if !is_admin && !is_global_poster {
        return Err("Unauthorized: Caller is not an admin or global poster.".to_string());
    }

    let id = NEXT_POST_ID.with(|next_id| {
        let mut next_id = next_id.borrow_mut();
        let id = *next_id;
        *next_id += 1;
        id
    });

    let new_post = GlobalPost {
        id,
        author_principal: caller,
        author_username,
        author_user_tag: Some(author_tag),
        author_sector_role: None,
        content_markdown: post_data.content_markdown,
        timestamp: time(),
        origin_sector_id: None,
    };

    POSTS.with(|p| p.borrow_mut().insert(id, new_post));
    Ok(id)
}

// === Public Update Calls (ACL Management) ===

#[update]
fn set_sector_vetted_status(sector_id: Principal, new_status: bool) -> Result<(), String> {
    let caller = ic_cdk::api::msg_caller();
    let owner = OWNER.with(|o| *o.borrow());
    let governance_id = GOVERNANCE_CANISTER_ID.with(|id| *id.borrow());
    
    // Default governance to a dummy principal if not set
    let governance_id = governance_id.unwrap_or_else(|| Principal::from_text("2vxsx-fae").unwrap());

    if caller != owner && caller != governance_id {
        return Err("Unauthorized: Caller is not the owner or governance canister.".to_string());
    }

    if new_status {
        VETTED_SECTORS.with(|s| s.borrow_mut().insert(sector_id, ()));
    } else {
        VETTED_SECTORS.with(|s| s.borrow_mut().remove(&sector_id));
    }
    Ok(())
}

#[update]
fn add_global_poster(user: Principal) -> Result<(), String> {
    if !is_admin(&ic_cdk::api::msg_caller()) {
        return Err("Unauthorized".to_string());
    }
    GLOBAL_POSTERS.with(|gp| gp.borrow_mut().insert(user, ()));
    Ok(())
}

#[update]
fn remove_global_poster(user: Principal) -> Result<(), String> {
    if !is_admin(&ic_cdk::api::msg_caller()) {
        return Err("Unauthorized".to_string());
    }
    GLOBAL_POSTERS.with(|gp| gp.borrow_mut().remove(&user));
    Ok(())
}

// === Public Query Calls ===

#[query]
fn get_global_feed(page: u64, size: u64) -> Vec<GlobalPost> {
    POSTS.with(|p| {
        let posts_map = p.borrow();
        let mut posts: Vec<_> = posts_map.values().cloned().collect();

        // Sort by post ID, newest first (descending)
        posts.sort_by(|a, b| b.id.cmp(&a.id));

        // Paginate
        let start_index = (page * size) as usize;
        if start_index >= posts.len() {
            return vec![];
        }
        let end_index = (start_index + size as usize).min(posts.len());

        posts[start_index..end_index].to_vec()
    })
}

#[query]
fn get_vetted_sectors() -> Vec<Principal> {
    VETTED_SECTORS.with(|s| s.borrow().keys().cloned().collect())
}


// Export the interface for the smart contract.
ic_cdk::export_candid!();