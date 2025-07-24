use candid::{ CandidType, Deserialize, Principal };
use ic_cdk::{ api::{ canister_self, msg_caller, time }, call, management_canister::raw_rand };
use ic_cdk_macros::*;
use std::cell::RefCell;
use std::collections::{ HashMap, HashSet };
use uuid::Uuid;
use hex;

// ==================================================================================================
// === Types & State ===
// ==================================================================================================

// Public Types
#[derive(CandidType, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum SectorRole {
    Moderator,
    Poster,
    Member,
}

#[derive(CandidType, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum PostStatus {
    Private,
    PendingGlobal,
    ApprovedGlobal,
}

#[derive(CandidType, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum ChatSecurityModel {
    HighSecurityE2EE,
    StandardAccessControl,
}

#[derive(CandidType, Deserialize, Clone)]
pub struct SectorConfig {
    name: String,
    abbreviation: String,
    description: String,
    is_private: bool,
    security_model: ChatSecurityModel,
    owner: Principal,
}

#[derive(CandidType, Deserialize, Clone)]
pub struct SectorDetails {
    name: String,
    description: String,
    abbreviation: String,
    is_private: bool,
    my_role: SectorRole,
    channels: Vec<String>,
    rekey_required: bool,
    current_key_epoch: u32,
}

#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct CryptoState {
    rekey_required: bool,
    current_key_epoch: u32,
}

#[derive(CandidType, Deserialize, Clone)]
pub struct Post {
    id: String, // Using UUID
    author_principal: Principal,
    encrypted_content_markdown: Vec<u8>,
    timestamp: u64,
    status: PostStatus,
    global_post_id: Option<u64>,
}

#[derive(CandidType, Deserialize, Clone)]
pub struct Message {
    id: String, // Using UUID
    key_epoch_id: u32,
    author_principal: Principal,
    timestamp: u64,
    encrypted_content_markdown: Vec<u8>,
}

// Custom Types for State
#[derive(CandidType, Deserialize, Clone)]
struct Member {
    principal: Principal,
    role: SectorRole,
}

#[derive(CandidType, Deserialize, Clone)]
struct Channel {
    name: String,
    messages: HashMap<String, Message>, // Keyed by Message ID (UUID)
}

// Custom Error Type
#[derive(CandidType, Deserialize, Debug)]
pub enum Error {
    Unauthorized(String),
    NotFound(String),
    InvalidState(String),
    ConfigError(String),
    AlreadyExists(String),
    CallFailed(String),
    ValidationError(String),
}

// Custom Type For State Update
#[derive(CandidType, Deserialize, Clone)]
pub struct SectorConfigUpdate {
    name: String,
    abbreviation: String,
    description: String,
}

// State Definition
type MemberStore = HashMap<Principal, Member>;
type PostStore = HashMap<String, Post>; // Keyed by Post ID (UUID)
type ChannelStore = HashMap<String, Channel>; // Keyed by channel name

const HIGH_SECURITY_MEMBER_LIMIT: usize = 50;

thread_local! {
    static CONFIG: RefCell<Option<SectorConfig>> = RefCell::new(None);
    static MEMBERS: RefCell<MemberStore> = RefCell::new(HashMap::new());
    static POSTS: RefCell<PostStore> = RefCell::new(HashMap::new());
    static CHANNELS: RefCell<ChannelStore> = RefCell::new(HashMap::new());
    static CRYPTO_STATE: RefCell<CryptoState> = RefCell::new(CryptoState {
        rekey_required: false,
        current_key_epoch: 1,
    });

    // Canister dependencies
    static INVITE_CANISTER_ID: RefCell<Option<Principal>> = RefCell::new(None);
    static GLOBAL_FEED_CANISTER_ID: RefCell<Option<Principal>> = RefCell::new(None);
    static USER_CANISTER_ID: RefCell<Option<Principal>> = RefCell::new(None);
}

// Stable state for upgrades
#[derive(CandidType, Deserialize)]
struct StableState {
    config: Option<SectorConfig>,
    members: MemberStore,
    posts: PostStore,
    channels: ChannelStore,
    crypto_state: CryptoState,
    invite_canister_id: Option<Principal>,
    global_feed_canister_id: Option<Principal>,
    user_canister_id: Option<Principal>,
}

// ==================================================================================================
// === Upgrade Hooks ===
// ==================================================================================================

#[pre_upgrade]
fn pre_upgrade() {
    let state = StableState {
        config: CONFIG.with(|s| s.borrow().clone()),
        members: MEMBERS.with(|s| s.borrow().clone()),
        posts: POSTS.with(|s| s.borrow().clone()),
        channels: CHANNELS.with(|s| s.borrow().clone()),
        crypto_state: CRYPTO_STATE.with(|s| s.borrow().clone()),
        invite_canister_id: INVITE_CANISTER_ID.with(|s| s.borrow().clone()),
        global_feed_canister_id: GLOBAL_FEED_CANISTER_ID.with(|s| s.borrow().clone()),
        user_canister_id: USER_CANISTER_ID.with(|s| s.borrow().clone()),
    };
    ic_cdk::storage::stable_save((state,)).unwrap();
}

#[post_upgrade]
fn post_upgrade() {
    let (state,): (StableState,) = ic_cdk::storage::stable_restore().unwrap();
    CONFIG.with(|s| {
        *s.borrow_mut() = state.config;
    });
    MEMBERS.with(|s| {
        *s.borrow_mut() = state.members;
    });
    POSTS.with(|s| {
        *s.borrow_mut() = state.posts;
    });
    CHANNELS.with(|s| {
        *s.borrow_mut() = state.channels;
    });
    CRYPTO_STATE.with(|s| {
        *s.borrow_mut() = state.crypto_state;
    });
    INVITE_CANISTER_ID.with(|s| {
        *s.borrow_mut() = state.invite_canister_id;
    });
    GLOBAL_FEED_CANISTER_ID.with(|s| {
        *s.borrow_mut() = state.global_feed_canister_id;
    });
    USER_CANISTER_ID.with(|s| {
        *s.borrow_mut() = state.user_canister_id;
    });
}

// ==================================================================================================
// === Initialization ===
// ==================================================================================================

#[init]
fn init(
    initial_config: SectorConfig,
    invite_id: Principal,
    global_feed_id: Principal,
    user_id: Principal
) {
    let owner = initial_config.owner;
    CONFIG.with(|c| {
        *c.borrow_mut() = Some(initial_config);
    });
    INVITE_CANISTER_ID.with(|id| {
        *id.borrow_mut() = Some(invite_id);
    });
    GLOBAL_FEED_CANISTER_ID.with(|id| {
        *id.borrow_mut() = Some(global_feed_id);
    });
    USER_CANISTER_ID.with(|id| {
        *id.borrow_mut() = Some(user_id);
    });

    MEMBERS.with(|m|
        m.borrow_mut().insert(owner, Member { principal: owner, role: SectorRole::Moderator })
    );
    CHANNELS.with(|c|
        c
            .borrow_mut()
            .insert("general".to_string(), Channel {
                name: "general".to_string(),
                messages: HashMap::new(),
            })
    );
}

// ==================================================================================================
// === Authorization Helper Queries ===
// ==================================================================================================

fn get_caller_role() -> Result<SectorRole, Error> {
    let caller = msg_caller();
    MEMBERS.with(|m| {
        m.borrow()
            .get(&caller)
            .map(|member| member.role)
            .ok_or_else(||
                Error::Unauthorized("Caller is not a member of this sector.".to_string())
            )
    })
}

fn is_moderator() -> Result<(), Error> {
    match get_caller_role()? {
        SectorRole::Moderator => Ok(()),
        _ => Err(Error::Unauthorized("Action requires moderator role.".to_string())),
    }
}

fn is_poster() -> Result<(), Error> {
    match get_caller_role()? {
        SectorRole::Moderator | SectorRole::Poster => Ok(()),
        _ => Err(Error::Unauthorized("Action requires poster or moderator role.".to_string())),
    }
}

// ==================================================================================================
// === Public Query Calls ===
// ==================================================================================================

#[query]
fn get_my_details() -> Result<SectorDetails, Error> {
    let my_role = get_caller_role()?;
    let config = CONFIG.with(|c|
        c
            .borrow()
            .clone()
            .ok_or_else(|| Error::ConfigError("Sector not initialized.".to_string()))
    )?;
    let crypto_state = CRYPTO_STATE.with(|cs| cs.borrow().clone());
    let channel_names = CHANNELS.with(|c| c.borrow().keys().cloned().collect());

    Ok(SectorDetails {
        name: config.name,
        description: config.description,
        abbreviation: config.abbreviation,
        is_private: config.is_private,
        my_role,
        channels: channel_names,
        rekey_required: crypto_state.rekey_required,
        current_key_epoch: crypto_state.current_key_epoch,
    })
}

#[query]
fn get_crypto_state() -> CryptoState {
    CRYPTO_STATE.with(|cs| cs.borrow().clone())
}

#[query]
fn get_sector_feed(page: usize, size: usize) -> Vec<Post> {
    POSTS.with(|p| {
        let mut posts: Vec<_> = p.borrow().values().cloned().collect();
        posts.sort_by(|a, b| b.timestamp.cmp(&a.timestamp)); // Newest first
        posts
            .into_iter()
            .skip(page * size)
            .take(size)
            .collect()
    })
}

#[query]
fn get_messages(
    channel_name: String,
    limit: usize,
    before_id: Option<String>
) -> Result<Vec<Message>, Error> {
    get_caller_role()?; // Authorize: only members can poll for messages

    CHANNELS.with(|c| {
        let channels = c.borrow();
        let channel = channels
            .get(&channel_name)
            .ok_or_else(|| Error::NotFound("Channel not found.".to_string()))?;

        let mut messages: Vec<_> = channel.messages.values().cloned().collect();
        messages.sort_by(|a, b| b.timestamp.cmp(&a.timestamp)); // Newest first

        let maybe_before_msg = before_id.and_then(|id| channel.messages.get(&id));
        let before_timestamp = maybe_before_msg.map_or(u64::MAX, |msg| msg.timestamp);

        Ok(
            messages
                .into_iter()
                .filter(|msg| msg.timestamp < before_timestamp)
                .take(limit)
                .collect()
        )
    })
}

#[query]
fn get_new_messages(channel_name: String, after_id: String) -> Result<Vec<Message>, Error> {
    get_caller_role()?; // Authorize: only members can poll for messages

    CHANNELS.with(|c| {
        let channels = c.borrow();
        let channel = channels
            .get(&channel_name)
            .ok_or_else(|| Error::NotFound("Channel not found.".to_string()))?;

        let mut messages: Vec<_> = channel.messages
            .values()
            .filter(|msg| msg.id > after_id) // Filter for messages newer than the last known ID
            .cloned()
            .collect();

        // Sort by timestamp to ensure chronological order, although ID order should be the same
        messages.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));

        Ok(messages)
    })
}

#[query]
fn get_members() -> Result<Vec<Principal>, Error> {
    is_moderator()?;
    Ok(MEMBERS.with(|m| m.borrow().keys().cloned().collect()))
}

#[query]
fn get_member_role(principal: Principal) -> Option<SectorRole> {
    // This is a public query, but only returns a role if the principal is a member.
    MEMBERS.with(|m| {
        m.borrow()
            .get(&principal)
            .map(|member| member.role)
    })
}

// ==================================================================================================
// === Membership & Roles ===
// ==================================================================================================

#[update]
fn join() -> Result<(), Error> {
    let caller = msg_caller();
    let config = CONFIG.with(|c|
        c
            .borrow()
            .clone()
            .ok_or_else(|| Error::ConfigError("Sector not initialized.".to_string()))
    )?;
    if config.is_private {
        return Err(
            Error::Unauthorized("This is a private sector. Use an invite code to join.".to_string())
        );
    }

    MEMBERS.with(|m| {
        let mut members = m.borrow_mut();
        if members.contains_key(&caller) {
            return Err(Error::AlreadyExists("Already a member.".to_string()));
        }

        if
            config.security_model == ChatSecurityModel::HighSecurityE2EE &&
            members.len() >= HIGH_SECURITY_MEMBER_LIMIT
        {
            return Err(Error::InvalidState("Sector is at its maximum capacity.".to_string()));
        }

        members.insert(caller, Member { principal: caller, role: SectorRole::Member });
        Ok(())
    })
}

#[update]
async fn create_invite_code() -> Result<String, Error> {
    is_moderator()?;
    let config = CONFIG.with(|c|
        c
            .borrow()
            .clone()
            .ok_or_else(|| Error::ConfigError("Sector not initialized.".to_string()))
    )?;
    if !config.is_private {
        return Err(Error::InvalidState("Cannot create invites for a public sector.".to_string()));
    }

    let invite_canister = INVITE_CANISTER_ID.with(|id|
        id.borrow().ok_or_else(|| Error::ConfigError("Invite canister not configured.".to_string()))
    )?;

    let result = raw_rand().await.map_err(|e|
        Error::CallFailed(format!("Failed to get randomness: {:?}", e))
    )?;

    let rand_bytes = result;

    let code = hex::encode(&rand_bytes[0..8]);

    // Await the call and handle both transport and application errors
    let call_result: Result<(Result<(), String>,), _> = call(invite_canister, "register_code", (
        code.clone(),
    )).await;

    match call_result {
        Ok((inner_result,)) => {
            // The application-level result from the remote canister
            inner_result.map(|()| code).map_err(Error::CallFailed)
        }
        Err((code, msg)) => {
            // The transport-level error
            Err(Error::CallFailed(format!("Canister call failed ({:?}): {}", code, msg)))
        }
    }
}

#[update]
fn leave() -> Result<(), Error> {
    let caller = msg_caller();
    get_caller_role()?;

    MEMBERS.with(|m| m.borrow_mut().remove(&caller));

    let config = CONFIG.with(|c| c.borrow().clone().unwrap());
    if config.security_model == ChatSecurityModel::HighSecurityE2EE {
        CRYPTO_STATE.with(|cs| {
            cs.borrow_mut().rekey_required = true;
        });
    }

    Ok(())
}

#[update]
fn set_sector_role(target_user: Principal, new_role: SectorRole) -> Result<(), Error> {
    is_moderator()?;
    let caller = msg_caller();
    let config = CONFIG.with(|c|
        c
            .borrow()
            .clone()
            .ok_or_else(|| Error::ConfigError("Sector not initialized.".to_string()))
    )?;

    if target_user == config.owner {
        return Err(Error::InvalidState("The sector owner's role cannot be changed.".to_string()));
    }
    if target_user == caller {
        return Err(Error::InvalidState("Moderators cannot change their own role.".to_string()));
    }

    MEMBERS.with(|m| {
        let mut members = m.borrow_mut();
        let member = members
            .get_mut(&target_user)
            .ok_or_else(||
                Error::NotFound("Target user is not a member of this sector.".to_string())
            )?;

        member.role = new_role;
        Ok(())
    })
}

// ==================================================================================================
// === Sector Feed & Chat ===
// ==================================================================================================

#[update]
fn create_post(
    encrypted_content_markdown: Vec<u8>,
    for_global_feed: bool
) -> Result<String, Error> {
    is_poster()?;

    let id = Uuid::new_v4().to_string();
    let post = Post {
        id: id.clone(),
        author_principal: msg_caller(),
        encrypted_content_markdown,
        timestamp: time(),
        status: if for_global_feed {
            PostStatus::PendingGlobal
        } else {
            PostStatus::Private
        },
        global_post_id: None,
    };

    POSTS.with(|p| p.borrow_mut().insert(id.clone(), post));
    Ok(id)
}

#[derive(CandidType, Deserialize)]
struct UserProfileResponse {
    username: String,
}

#[derive(CandidType, Deserialize)]
struct GlobalFeedSubmission {
    author_principal: Principal,
    author_username: String,
    content_markdown: String,
    origin_sector_id: Principal,
}

#[update]
async fn approve_global_post(
    post_id: String,
    decrypted_content_markdown: String
) -> Result<(), Error> {
    is_moderator()?;
    let this_canister = canister_self();

    let config = CONFIG.with(|c| c.borrow().clone()).ok_or_else(||
        Error::ConfigError("Sector not initialized.".to_string())
    )?;
    let user_canister_id = USER_CANISTER_ID.with(|id| *id.borrow()).ok_or_else(||
        Error::ConfigError("User canister not configured.".to_string())
    )?;
    let global_feed_canister_id = GLOBAL_FEED_CANISTER_ID.with(|id| *id.borrow()).ok_or_else(||
        Error::ConfigError("Global feed canister not configured.".to_string())
    )?;

    if config.is_private {
        return Err(
            Error::InvalidState(
                "Cannot approve posts to global feed from a private sector.".to_string()
            )
        );
    }

    let author_principal = POSTS.with(|p| {
        let mut posts = p.borrow_mut();
        let post = posts
            .get_mut(&post_id)
            .ok_or_else(|| Error::NotFound("Post not found.".to_string()))?;

        if post.status != PostStatus::PendingGlobal {
            return Err(Error::InvalidState("Post is not pending global approval.".to_string()));
        }

        Ok(post.author_principal)
    })?;

    // Get author username
    let username = match
        call::<_, (Option<UserProfileResponse>,)>(user_canister_id, "get_profile_by_principal", (
            author_principal,
        )).await
    {
        Ok((Some(profile),)) => profile.username,
        _ => "anonymous".to_string(), // Default on error or if no profile
    };

    // Submit to global feed
    let submission = GlobalFeedSubmission {
        author_principal,
        author_username: username,
        content_markdown: decrypted_content_markdown,
        origin_sector_id: this_canister,
    };

    let global_id = match
        call::<_, (Result<u64, String>,)>(global_feed_canister_id, "submit_post_from_sector", (
            submission,
        )).await
    {
        Ok((Ok(id),)) => id,
        Ok((Err(e),)) => {
            return Err(Error::CallFailed(format!("Global feed submission failed: {}", e)));
        }
        Err((code, msg)) => {
            return Err(Error::CallFailed(format!("Canister call failed ({:?}): {}", code, msg)));
        }
    };

    // Update post state on success
    POSTS.with(|p| {
        let mut posts = p.borrow_mut();
        if let Some(post) = posts.get_mut(&post_id) {
            post.status = PostStatus::ApprovedGlobal;
            post.global_post_id = Some(global_id);
        }
    });

    Ok(())
}

#[update]
fn send_message(
    channel_name: String,
    encrypted_content: Vec<u8>,
    key_epoch: u32
) -> Result<String, Error> {
    get_caller_role()?;

    CHANNELS.with(|c| {
        let mut channels = c.borrow_mut();
        let channel = channels
            .get_mut(&channel_name)
            .ok_or_else(|| Error::NotFound("Channel not found.".to_string()))?;

        let id = Uuid::new_v4().to_string();
        let message = Message {
            id: id.clone(),
            key_epoch_id: key_epoch,
            author_principal: msg_caller(),
            timestamp: time(),
            encrypted_content_markdown: encrypted_content,
        };

        channel.messages.insert(id.clone(), message);
        Ok(id)
    })
}

// ==================================================================================================
// === Sector Management (Moderator Only) ===
// ==================================================================================================

#[update]
fn update_sector_config(update_data: SectorConfigUpdate) -> Result<(), Error> {
    is_moderator()?; // Authorize

    CONFIG.with(|c| {
        let mut config_borrow = c.borrow_mut();
        if let Some(config) = config_borrow.as_mut() {
            config.name = update_data.name;
            config.description = update_data.description;
            config.abbreviation = update_data.abbreviation;
            Ok(())
        } else {
            Err(Error::ConfigError("Sector configuration not found.".to_string()))
        }
    })
}


#[update]
fn create_channel(channel_name: String) -> Result<(), Error> {
    is_moderator()?;

    CHANNELS.with(|c| {
        let mut channels = c.borrow_mut();
        if channels.contains_key(&channel_name) {
            return Err(Error::AlreadyExists("Channel already exists.".to_string()));
        }

        channels.insert(channel_name.clone(), Channel {
            name: channel_name,
            messages: HashMap::new(),
        });
        Ok(())
    })
}

#[update]
fn rotate_sector_key(key_batch: Vec<(Principal, Vec<u8>)>) -> Result<(), Error> {
    is_moderator()?;
    let config = CONFIG.with(|c| c.borrow().clone()).ok_or_else(||
        Error::ConfigError("Sector not initialized.".to_string())
    )?;
    if config.security_model != ChatSecurityModel::HighSecurityE2EE {
        return Err(
            Error::InvalidState(
                "Key rotation is not applicable for standard security mode sectors.".to_string()
            )
        );
    }

    let members = MEMBERS.with(|m| m.borrow().clone());
    if key_batch.len() != members.len() {
        return Err(
            Error::ValidationError(
                format!(
                    "Key batch size ({}) does not match the current number of sector members ({}).",
                    key_batch.len(),
                    members.len()
                )
            )
        );
    }

    let batch_principals: HashSet<Principal> = key_batch
        .iter()
        .map(|(p, _)| *p)
        .collect();
    if batch_principals.len() != key_batch.len() {
        return Err(Error::ValidationError("Duplicate principals found in key batch.".to_string()));
    }

    let member_principals: HashSet<Principal> = members.keys().cloned().collect();
    if batch_principals != member_principals {
        return Err(
            Error::ValidationError(
                "Key batch principals do not match the exact set of current members.".to_string()
            )
        );
    }

    // Key batch is valid, update the crypto state
    CRYPTO_STATE.with(|cs| {
        let mut state = cs.borrow_mut();
        state.rekey_required = false;
        state.current_key_epoch += 1;
    });

    Ok(())
}

// Export the interface for the smart contract.
ic_cdk::export_candid!();
