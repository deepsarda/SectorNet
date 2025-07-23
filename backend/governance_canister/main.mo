import Principal "mo:base/Principal";
import Result "mo:base/Result";
import Time "mo:base/Time";
import BTree "mo:stableheapbtreemap/BTree";
import Nat "mo:base/Nat";
import Nat64 "mo:base/Nat64";
import Text "mo:base/Text";
import ExperimentalCycles "mo:base/ExperimentalCycles";
import Error "mo:base/Error";

/**
* The Governance Canister facilitates democratic control of the platform.
* Its primary V1 function is to manage the censorship voting system, allowing the community
* to remove vetted status from sectors that violate community standards.
*/
actor GovernanceCanister {

    // ==================================================================================================
    // === Types & State ===
    // ==================================================================================================

    public type VoteChoice = { #For; #Against; };

    public type Vote = {
        id: Nat64;
        target_sector: Principal;
        initiator: Principal;
        start_timestamp: Time.Time;
        end_timestamp: Time.Time;
        votes_for: Nat;
        votes_against: Nat;
        voters: BTree.BTree<Principal, VoteChoice>; // Tracks who has voted and their choice.
        is_tallied: Bool;
    };

    // --- Actor Interfaces for Inter-Canister Calls ---
    type UserCanisterActor = actor {
        get_profile_by_principal: (Principal) -> async ?record {
            created_at: Time.Time;
            last_seen_timestamp: Time.Time;
        };
    };

    type GlobalFeedActor = actor {
        set_sector_vetted_status: (Principal, Bool) -> async Result.Result<(), Text>;
    };

    // --- Stable State ---
    stable var votes: BTree.BTree<Nat64, Vote> = BTree.new(10);
    stable var next_vote_id: Nat64 = 0;
    stable var owner: Principal;

    // --- Canister Dependencies ---
    stable var user_canister_id: Principal;
    stable var global_feed_canister_id: Principal;

    // --- Governance Parameters ---
    stable var VOTE_DURATION_NS: Nat = 3 * 24 * 3_600 * 1_000_000_000; // 72 hours
    stable var INITIATION_FEE_CYCLES: Nat = 100_000_000_000; // 100B cycles (0.1T)
    stable var MIN_ACCOUNT_TENURE_NS: Nat = 10 * 24 * 3_600 * 1_000_000_000; // 10 days
    stable var MAX_ACCOUNT_INACTIVITY_NS: Nat = 30 * 24 * 3_600 * 1_000_000_000; // 30 days
    stable var QUORUM_PERCENTAGE: Nat = 5; // Minimum 5% of active users must vote.
    stable var MAJORITY_THRESHOLD_PERCENTAGE: Nat = 66; // 2/3 majority needed (66.66... rounded down)


    // ==================================================================================================
    // === Initialization & Setup (Owner Only) ===
    // ==================================================================================================

    public init(initial_owner: Principal, user_canister: Principal, global_feed_canister: Principal) {
        owner := initial_owner;
        user_canister_id := user_canister;
        global_feed_canister_id := global_feed_canister;
    };

    // ==================================================================================================
    // === Public Update Calls ===
    // ==================================================================================================

    /**
    * Initiates a 72-hour community vote to de-list a Vetted Sector.
    * Requires a cycle fee to prevent spam.
    * @param target_sector The Principal of the sector to be voted on.
    */
    public shared(msg) func initiate_censor_vote(target_sector: Principal): async Result.Result<Nat64, Text> {
        // Fee Check: Ensure the call includes the required cycle fee.
        let cycles_attached = ExperimentalCycles.accept(INITIATION_FEE_CYCLES);
        if (cycles_attached < INITIATION_FEE_CYCLES) {
            return Result.Err("Insufficient cycle fee. Required: " # Nat.toText(INITIATION_FEE_CYCLES));
        };

        // Eligibility Check: The initiator must also be an eligible voter.
        let is_eligible = await check_voter_eligibility(msg.caller);
        if (Result.isErr(is_eligible)) {
            return Result.Err("Initiator does not meet voting eligibility requirements: " # Result.unwrapErr(is_eligible));
        };
        
        let now = Time.now();
        let id = next_vote_id;
        next_vote_id += 1;

        let new_vote: Vote = {
            id;
            target_sector;
            initiator = msg.caller;
            start_timestamp = now;
            end_timestamp = now + Nat.fromInt(VOTE_DURATION_NS);
            votes_for = 0;
            votes_against = 0;
            voters = BTree.new(10);
            is_tallied = false;
        };

        votes.put(id, new_vote);
        return Result.Ok(id);
    };

    /**
    * Casts a vote in an active censorship proposal.
    * @param vote_id The ID of the vote to participate in.
    * @param choice The voter's choice (#For or #Against de-listing).
    */
    public shared(msg) func cast_vote(vote_id: Nat64, choice: VoteChoice): async Result.Result<(), Text> {
        let caller = msg.caller;

        // Get the vote object.
        let vote = switch(votes.get(vote_id)) {
            case (null) { return Result.Err("Vote not found."); };
            case (?v) { v };
        };
        
        // Pre-condition checks on the vote itself.
        if (vote.is_tallied) { 
            return Result.Err("Vote has already been tallied."); 
        };
        if (Time.now() > vote.end_timestamp) { 
            return Result.Err("Voting period has ended."); 
        };

        if (vote.voters.get(caller) != null) { 
            return Result.Err("You have already voted."); 
        };

        // Eligibility Check: Verify the voter has sufficient tenure and activity.
        let is_eligible = await check_voter_eligibility(caller);
        if (Result.isErr(is_eligible)) {
            return Result.Err(Result.unwrapErr(is_eligible));
        };

        // Record the vote.
        let mut updated_vote = vote;
        updated_vote.voters.put(caller, choice);
        switch(choice) {
            case (#For) { updated_vote.votes_for += 1; };
            case (#Against) { updated_vote.votes_against += 1; };
        };
        votes.put(vote_id, updated_vote);
        
        return Result.Ok(());
    };
    
    /**
    * Tallies a completed vote, checks quorum and majority, and executes the result.
    * Can be called by anyone after the voting period has ended.
    */
    public shared(msg) func tally_vote(vote_id: Nat64): async Result.Result<Text, Text> {
        let vote = switch(votes.get(vote_id)) {
            case (null) { return Result.Err("Vote not found."); };
            case (?v) { v };
        };
        
        if (vote.is_tallied) { return Result.Err("Vote has already been tallied."); };
        if (Time.now() <= vote.end_timestamp) { return Result.Err("Voting period has not yet ended."); };

        let total_votes = vote.votes_for + vote.votes_against;

        // Quorum check is simplified in V1. A full implementation would need to query the UserCanister
        // for the total number of active users, which is a very expensive operation.
        // For now, we'll use a minimum number of votes as a proxy for quorum.
        let QUORUM_MIN_VOTES = 10; // Placeholder for a dynamic calculation.
        if (total_votes < QUORUM_MIN_VOTES) {
            vote.is_tallied := true;
            votes.put(vote_id, vote);
            return Result.Ok("Vote failed to meet quorum.");
        };

        // Majority check
        if (total_votes > 0 and (vote.votes_for * 100 / total_votes) >= MAJORITY_THRESHOLD_PERCENTAGE) {
            // Censor vote PASSED. Execute the outcome.
            let global_feed_actor = actor(global_feed_canister_id) : GlobalFeedActor;
            let result = await global_feed_actor.set_sector_vetted_status(vote.target_sector, false);
            
            vote.is_tallied := true;
            votes.put(vote_id, vote);
            
            switch (result) {
                case (Result.Ok()) { 
                    return Result.Ok("Vote passed. Sector has been de-vetted."); 
                };
                case (Result.Err(err)) { 
                    return Result.Err("Vote passed, but failed to execute: " # err); 
                };
            };
        } else {
            // Censor vote FAILED.
            vote.is_tallied := true;
            votes.put(vote_id, vote);
            return Result.Ok("Vote failed to pass majority threshold.");
        }
    };

    // ==================================================================================================
    // === Private Helper Functions ===
    // ==================================================================================================

    /**
    * Checks if a user is eligible to vote based on account tenure and recent activity.
    * This is a critical Sybil resistance measure.
    */
    private async func check_voter_eligibility(voter: Principal): async Result.Result<(), Text> {
        let user_canister_actor = actor(user_canister_id) : UserCanisterActor;
        let profile_opt = await user_canister_actor.get_profile_by_principal(voter);
        
        let profile = switch(profile_opt) {
            case (null) { return Result.Err("Voter does not have a profile."); };
            case (?p) { p };
        };

        let now = Time.now();

        // Check 1: Account Tenure
        let account_age = now - profile.created_at;
        if (Nat.fromInt(account_age) < MIN_ACCOUNT_TENURE_NS) {
            return Result.Err("Account tenure is too new to vote.");
        };

        // Check 2: Account Activity
        let inactivity_duration = now - profile.last_seen_timestamp;
        if (Nat.fromInt(inactivity_duration) > MAX_ACCOUNT_INACTIVITY_NS) {
            return Result.Err("Account has been inactive for too long to vote.");
        };

        return Result.Ok(());
    };

    // ==================================================================================================
    // === Public Query Calls ===
    // ==================================================================================================

    public query func get_vote(vote_id: Nat64): async ?Vote {
        return votes.get(vote_id);
    };

    public query func get_active_votes(): async [Vote] {
        let mut active_votes: [Vote] = [];
        let now = Time.now();
        for ((_, vote) in votes.entries()) {
            if (not vote.is_tallied and now <= vote.end_timestamp) {
                active_votes.push(vote);
            };
        };
        return active_votes;
    };
}