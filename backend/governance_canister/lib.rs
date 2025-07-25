#![allow(warnings)] 

use candid::{ CandidType, Deserialize, Principal };
use ic_cdk::api::{ caller, time };
use ic_cdk_macros::*;
use std::cell::RefCell;

// ==================================================================================================
// === Types & State ===
// ==================================================================================================

#[derive(CandidType, Deserialize, Clone, Copy, PartialEq, Eq)]
pub enum VoteChoice {
    For,
    Against,
}

#[derive(CandidType, Deserialize, Clone)]
pub struct Vote {
    id: u64,
    target_sector: Principal,
    initiator: Principal,
    start_timestamp: u64,
    end_timestamp: u64,
    votes_for: u64,
    votes_against: u64,
    voters: Vec<(Principal, VoteChoice)>,
    is_tallied: bool,
}

// Actor Interfaces for Inter-Canister Calls
// Note: These are not stored in state but are used for deserializing inter-canister call responses.
#[derive(CandidType, Deserialize, Clone)]
pub struct UserProfile {
    created_at: u64,
    last_seen_timestamp: u64,
}

// State
thread_local! {
    // Stable State
    static VOTES: RefCell<Vec<Vote>> = RefCell::new(Vec::new());
    static NEXT_VOTE_ID: RefCell<u64> = RefCell::new(0);
    static OWNER: RefCell<Option<Principal>> = RefCell::new(None);

    // Canister Dependencies
    static USER_CANISTER_ID: RefCell<Option<Principal>> = RefCell::new(None);
    static GLOBAL_FEED_CANISTER_ID: RefCell<Option<Principal>> = RefCell::new(None);

    // Governance Parameters
    static VOTE_DURATION_NS: RefCell<u64> = RefCell::new(3 * 24 * 3_600 * 1_000_000_000); // 72 hours
    static INITIATION_FEE_CYCLES: RefCell<u128> = RefCell::new(100_000_000_000); // 100B cycles (0.1T)
    static MIN_ACCOUNT_TENURE_NS: RefCell<u64> = RefCell::new(10 * 24 * 3_600 * 1_000_000_000); // 10 days
    static MAX_ACCOUNT_INACTIVITY_NS: RefCell<u64> = RefCell::new(30 * 24 * 3_600 * 1_000_000_000); // 30 days
    static QUORUM_PERCENTAGE: RefCell<u64> = RefCell::new(5); // Minimum 5% of active users must vote.
    static MAJORITY_THRESHOLD_PERCENTAGE: RefCell<u64> = RefCell::new(66); // 2/3 majority needed
}

// Helper struct for stable storage
#[derive(CandidType, Deserialize)]
struct StableState {
    votes: Vec<Vote>,
    next_vote_id: u64,
    owner: Option<Principal>,
    user_canister_id: Option<Principal>,
    global_feed_canister_id: Option<Principal>,
    vote_duration_ns: u64,
    initiation_fee_cycles: u128,
    min_account_tenure_ns: u64,
    max_account_inactivity_ns: u64,
    quorum_percentage: u64,
    majority_threshold_percentage: u64,
}

// ==================================================================================================
// === Upgrade Hooks ===
// ==================================================================================================

#[pre_upgrade]
fn pre_upgrade() {
    let state = StableState {
        votes: VOTES.with(|s| s.borrow().clone()),
        next_vote_id: NEXT_VOTE_ID.with(|s| *s.borrow()),
        owner: OWNER.with(|s| *s.borrow()),
        user_canister_id: USER_CANISTER_ID.with(|s| *s.borrow()),
        global_feed_canister_id: GLOBAL_FEED_CANISTER_ID.with(|s| *s.borrow()),
        vote_duration_ns: VOTE_DURATION_NS.with(|s| *s.borrow()),
        initiation_fee_cycles: INITIATION_FEE_CYCLES.with(|s| *s.borrow()),
        min_account_tenure_ns: MIN_ACCOUNT_TENURE_NS.with(|s| *s.borrow()),
        max_account_inactivity_ns: MAX_ACCOUNT_INACTIVITY_NS.with(|s| *s.borrow()),
        quorum_percentage: QUORUM_PERCENTAGE.with(|s| *s.borrow()),
        majority_threshold_percentage: MAJORITY_THRESHOLD_PERCENTAGE.with(|s| *s.borrow()),
    };
    ic_cdk::storage::stable_save((state,)).unwrap();
}

#[post_upgrade]
fn post_upgrade() {
    let (state,): (StableState,) = ic_cdk::storage::stable_restore().unwrap();
    VOTES.with(|s| {
        *s.borrow_mut() = state.votes;
    });
    NEXT_VOTE_ID.with(|s| {
        *s.borrow_mut() = state.next_vote_id;
    });
    OWNER.with(|s| {
        *s.borrow_mut() = state.owner;
    });
    USER_CANISTER_ID.with(|s| {
        *s.borrow_mut() = state.user_canister_id;
    });
    GLOBAL_FEED_CANISTER_ID.with(|s| {
        *s.borrow_mut() = state.global_feed_canister_id;
    });
    VOTE_DURATION_NS.with(|s| {
        *s.borrow_mut() = state.vote_duration_ns;
    });
    INITIATION_FEE_CYCLES.with(|s| {
        *s.borrow_mut() = state.initiation_fee_cycles;
    });
    MIN_ACCOUNT_TENURE_NS.with(|s| {
        *s.borrow_mut() = state.min_account_tenure_ns;
    });
    MAX_ACCOUNT_INACTIVITY_NS.with(|s| {
        *s.borrow_mut() = state.max_account_inactivity_ns;
    });
    QUORUM_PERCENTAGE.with(|s| {
        *s.borrow_mut() = state.quorum_percentage;
    });
    MAJORITY_THRESHOLD_PERCENTAGE.with(|s| {
        *s.borrow_mut() = state.majority_threshold_percentage;
    });
}

// ==================================================================================================
// === Initialization & Setup (Owner Only) ===
// ==================================================================================================

#[init]
fn init(initial_owner: Principal, user_canister: Principal, global_feed_canister: Principal) {
    OWNER.with(|o| {
        *o.borrow_mut() = Some(initial_owner);
    });
    USER_CANISTER_ID.with(|id| {
        *id.borrow_mut() = Some(user_canister);
    });
    GLOBAL_FEED_CANISTER_ID.with(|id| {
        *id.borrow_mut() = Some(global_feed_canister);
    });
}

// ==================================================================================================
// === Public Query Calls ===
// ==================================================================================================

#[query]
fn get_vote(vote_id: u64) -> Option<Vote> {
    VOTES.with(|votes| {
        votes
            .borrow()
            .iter()
            .find(|v| v.id == vote_id)
            .cloned()
    })
}

#[query]
fn get_active_votes() -> Vec<Vote> {
    let now = time();
    VOTES.with(|votes| {
        votes
            .borrow()
            .iter()
            .filter(|v| !v.is_tallied && now <= v.end_timestamp)
            .cloned()
            .collect()
    })
}

// ==================================================================================================
// === Public Update Calls ===
// ==================================================================================================

#[update]
async fn initiate_censor_vote(target_sector: Principal) -> Result<u64, String> {
    let fee = INITIATION_FEE_CYCLES.with(|f| *f.borrow());
    //TODO: Fix this
    //let cycles_attached = ic_cdk::api::msg_cycles_accept(fee);
    //if cycles_attached < fee {
    //    return Err(format!("Insufficient cycle fee. Required: {}", fee));
    //}

    let initiator = caller();
    check_voter_eligibility(initiator).await.map_err(|e|
        format!("Initiator does not meet voting eligibility requirements: {}", e)
    )?;

    let now = time();
    let id = NEXT_VOTE_ID.with(|id| {
        let mut next_id = id.borrow_mut();
        let current_id = *next_id;
        *next_id += 1;
        current_id
    });

    let new_vote = Vote {
        id,
        target_sector,
        initiator,
        start_timestamp: now,
        end_timestamp: now + VOTE_DURATION_NS.with(|d| *d.borrow()),
        votes_for: 0,
        votes_against: 0,
        voters: Vec::new(),
        is_tallied: false,
    };

    VOTES.with(|v| v.borrow_mut().push(new_vote));
    Ok(id)
}

#[update]
async fn cast_vote(vote_id: u64, choice: VoteChoice) -> Result<(), String> {
    let voter = caller();
    let now = time();

    // Find the vote and its index.
    VOTES.with(|v| {
        let mut votes = v.borrow_mut(); // Now you can borrow_mut() on the RefCell
        let vote = votes
            .iter_mut()
            .find(|v| v.id == vote_id)
            .ok_or("Vote not found.")?;

        // Pre-condition checks
        if vote.is_tallied {
            return Err("Vote has already been tallied.".to_string());
        }
        if now > vote.end_timestamp {
            return Err("Voting period has ended.".to_string());
        }

        // Check if already voted
        if vote.voters.iter().any(|(p, _)| *p == voter) {
            return Err("You have already voted.".to_string());
        }

        // Record the vote
        vote.voters.push((voter, choice.clone()));
        match choice {
            VoteChoice::For => {
                vote.votes_for += 1;
            }
            VoteChoice::Against => {
                vote.votes_against += 1;
            }
        }

        Ok(())
    })?; // The ? will propagate the error out of the closure

    // The eligibility check must be done OUTSIDE the .with() block.
    check_voter_eligibility(voter).await?;

    Ok(())
}

#[update]
async fn tally_vote(vote_id: u64) -> Result<String, String> {
    let now = time();
    // Find the vote and check its status.
    let vote_to_tally = VOTES.with(|v| {
        let votes = v.borrow();
        let vote = votes
            .iter()
            .find(|v| v.id == vote_id)
            .cloned() // Clone it so we can use it after the borrow ends
            .ok_or_else(|| "Vote not found.".to_string())?;

        if vote.is_tallied {
            return Err("Vote has already been tallied.".to_string());
        }
        if now <= vote.end_timestamp {
            return Err("Voting period has not yet ended.".to_string());
        }

        Ok(vote)
    })?;

    // Mark as tallied and proceed with logic
    VOTES.with(|v| {
        let mut votes = v.borrow_mut();
        let vote = votes
            .iter_mut()
            .find(|v| v.id == vote_id)
            .unwrap(); // Safe to unwrap, we found it above
        vote.is_tallied = true;
    });

    let total_votes = vote_to_tally.votes_for + vote_to_tally.votes_against;

    // Quorum check (using a placeholder for total active users)
    // TODO: We need to make an inter-canister call to get this number.
    let quorum_min_votes: u64 = 10;
    if total_votes < quorum_min_votes {
        return Ok("Vote failed to meet quorum.".to_string());
    }

    // Majority check
    let majority_threshold = MAJORITY_THRESHOLD_PERCENTAGE.with(|p| *p.borrow());
    if total_votes > 0 && (vote_to_tally.votes_for * 100) / total_votes >= majority_threshold {
        // Censor vote PASSED. Execute the outcome.
        let global_feed_canister = GLOBAL_FEED_CANISTER_ID.with(|id|
            id.borrow().expect("Global Feed Canister ID not set.")
        );
        let call_result: Result<(Result<(), String>,), _> = ic_cdk::call(
            global_feed_canister,
            "set_sector_vetted_status",
            (vote_to_tally.target_sector, false)
        ).await;

        match call_result {
            Ok((Ok(()),)) => Ok("Vote passed. Sector has been de-vetted.".to_string()),
            Ok((Err(err),)) => Err(format!("Vote passed, but failed to execute: {}", err)),
            Err((code, msg)) =>
                Err(format!("Vote passed, but canister call failed ({:?}): {}", code, msg)),
        }
    } else {
        // Censor vote FAILED.
        Ok("Vote failed to pass majority threshold.".to_string())
    }
}

// ==================================================================================================
// === Private Helper Functions ===
// ==================================================================================================

async fn check_voter_eligibility(voter: Principal) -> Result<(), String> {
    let canister_id = USER_CANISTER_ID.with(|id| id.borrow().expect("User Canister ID not set."));
    let response: Result<(Option<UserProfile>,), _> = ic_cdk::call(
        canister_id,
        "get_profile_by_principal",
        (voter,)
    ).await;

    let profile = match response {
        Ok((Some(p),)) => p,
        Ok((None,)) => {
            return Err("Voter does not have a profile.".to_string());
        }
        Err((code, msg)) => {
            return Err(format!("Failed to get profile ({:?}): {}", code, msg));
        }
    };

    let now = time();
    let min_tenure = MIN_ACCOUNT_TENURE_NS.with(|t| *t.borrow());
    let max_inactivity = MAX_ACCOUNT_INACTIVITY_NS.with(|i| *i.borrow());

    // Account Tenure
    let account_age = now.saturating_sub(profile.created_at);
    if account_age < min_tenure {
        return Err("Account tenure is too new to vote.".to_string());
    }

    // Account Activity
    let inactivity_duration = now.saturating_sub(profile.last_seen_timestamp);
    if inactivity_duration > max_inactivity {
        return Err("Account has been inactive for too long to vote.".to_string());
    }

    Ok(())
}

// Export the interface for the smart contract.
ic_cdk::export_candid!();
