import Principal "mo:base/Principal";
import Result "mo:base/Result";
import Time "mo:base/Time";
import Array "mo:base/Array";
import Nat "mo:base/Nat";
import Nat64 "mo:base/Nat64";
import Text "mo:base/Text";
import Iter "mo:base/Iter";
import Option "mo:base/Option";
import ExperimentalCycles "mo:base/ExperimentalCycles";
import Debug "mo:base/Debug";

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
        voters: [(Principal, VoteChoice)]; // Tracks who has voted and their choice.
        is_tallied: Bool;
    };

    // --- Actor Interfaces for Inter-Canister Calls ---
    public type UserProfile = {
        created_at: Time.Time;
        last_seen_timestamp: Time.Time;
    };

    type UserCanisterActor = actor {
        get_profile_by_principal: (Principal) -> async ?UserProfile;
    };

    type GlobalFeedActor = actor {
        set_sector_vetted_status: (Principal, Bool) -> async Result.Result<(), Text>;
    };

    // --- Stable State ---
    stable var votes: [Vote] = [];
    stable var next_vote_id: Nat64 = 0;
    stable var owner: ?Principal = null;

    // --- Canister Dependencies ---
    stable var user_canister_id: ?Principal = null;
    stable var global_feed_canister_id: ?Principal = null;

    // --- Governance Parameters ---
    stable var VOTE_DURATION_NS: Int = 3 * 24 * 3_600 * 1_000_000_000; // 72 hours
    stable var INITIATION_FEE_CYCLES: Nat = 100_000_000_000; // 100B cycles (0.1T)
    stable var MIN_ACCOUNT_TENURE_NS: Int = 10 * 24 * 3_600 * 1_000_000_000; // 10 days
    stable var MAX_ACCOUNT_INACTIVITY_NS: Int = 30 * 24 * 3_600 * 1_000_000_000; // 30 days
    stable var QUORUM_PERCENTAGE: Nat = 5; // Minimum 5% of active users must vote.
    stable var MAJORITY_THRESHOLD_PERCENTAGE: Nat = 66; // 2/3 majority needed


    // ==================================================================================================
    // === Initialization & Setup (Owner Only) ===
    // ==================================================================================================

    public func init(initial_owner: Principal, user_canister: Principal, global_feed_canister: Principal) {
        owner := ?initial_owner;
        user_canister_id := ?user_canister;
        global_feed_canister_id := ?global_feed_canister;
    };


    // ==================================================================================================
    // === Public Query Calls ===
    // ==================================================================================================

    public query func get_vote(vote_id: Nat64): async ?Vote {
      return Array.find<Vote>(votes, func(v: Vote) { v.id == vote_id });
    };

    public query func get_active_votes(): async [Vote] {
        var active_votes: [Vote] = [];
        let now = Time.now();
        for (vote in votes.vals()) {
            if (not vote.is_tallied and now <= vote.end_timestamp) {
                active_votes := Array.append(active_votes, [vote]);
            };
        };
        return active_votes;
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
            return #err("Insufficient cycle fee. Required: " # Nat.toText(INITIATION_FEE_CYCLES));
        };

        // Eligibility Check: The initiator must also be an eligible voter.
        switch (await check_voter_eligibility(msg.caller)) {
            case (#err(e)) { return #err("Initiator does not meet voting eligibility requirements: " # e); };
            case (#ok()) {};
        };
        
        let now = Time.now();
        let id = next_vote_id;
        next_vote_id += 1;

        let new_vote: Vote = {
            id;
            target_sector;
            initiator = msg.caller;
            start_timestamp = now;
            end_timestamp = now + VOTE_DURATION_NS;
            votes_for = 0;
            votes_against = 0;
            voters = [];
            is_tallied = false;
        };

        votes := Array.append(votes, [new_vote]);
        return #ok(id);
    };

    /**
    * Casts a vote in an active censorship proposal.
    * @param vote_id The ID of the vote to participate in.
    * @param choice The voter's choice (#For or #Against de-listing).
    * TODO: Fix
    */
    public shared(msg) func cast_vote(vote_id: Nat64, choice: VoteChoice): async Result.Result<(), Text> {
        let caller = msg.caller;

        // Find the vote and its index.
        /**
        let find_result = Array.find(votes, func(v) { v.id == vote_id });
        let (index, vote) = switch (find_result) {
            case (null) { return #err("Vote not found."); };
            case (?(i, v)) { (i, v) };
        };
        
        // Pre-condition checks on the vote itself.
        if (vote.is_tallied) { return #err("Vote has already been tallied."); };
        if (Time.now() > vote.end_timestamp) { return #err("Voting period has ended."); };

        // Check if already voted
        if (Option.isSome(Array.find(vote.voters, func((p, _)) { p == caller }))) {
             return #err("You have already voted.");
        };

        // Eligibility Check: Verify the voter has sufficient tenure and activity.
        switch (await check_voter_eligibility(caller)) {
            case (#err(e)) { return #err(e); };
            case (#ok()) {};
        };
        
        // Record the vote by creating an updated record.
        let new_voters = Array.append(vote.voters, [(caller, choice)]);

        votes := Array.tabulate(votes.size(), func(i) {
            if (i == index) updated_vote else votes[i]
        });
        */
        
        return #ok(());
        
    };
    
    /**
    * Tallies a completed vote, checks quorum and majority, and executes the result.
    * Can be called by anyone after the voting period has ended.
    * TODO: Fix
    */
    public shared(msg) func tally_vote(vote_id: Nat64): async Result.Result<Text, Text> {
        // Find the vote and its index.
        /**
        let indexOpt = Array.indexOf(
            vote_id,
            votes,
            func(id:, v) { id == v.id }
        );

        let (index, vote) = switch (indexOpt) {
            case null { return #err("Vote not found."); };
            case (?i) { (i, votes[i]) };
        };

        
        if (vote.is_tallied) { return #err("Vote has already been tallied."); };
        if (Time.now() <= vote.end_timestamp) { return #err("Voting period has not yet ended."); };

        let total_votes = vote.votes_for + vote.votes_against;

        // Placeholder for a dynamic calculation.
        let QUORUM_MIN_VOTES: Nat = 10;
        let updated_vote : Vote = {
            id = vote.id;
            target_sector = vote.target_sector;
            initiator = vote.initiator;
            start_timestamp = vote.start_timestamp;
            end_timestamp = vote.end_timestamp;
            votes_for = vote.votes_for;
            votes_against = vote.votes_against;
            voters = vote.voters;
            is_tallied = true;
        };


        if (total_votes < QUORUM_MIN_VOTES) {
            votes := Array.tabulate(votes.size(), func(i) {
                if (i == index) { updated_vote } else { votes[i] }
            });
            return #ok("Vote failed to meet quorum.");
        };

        // Majority check
        if (total_votes > 0 and (vote.votes_for * 100 / total_votes) >= MAJORITY_THRESHOLD_PERCENTAGE) {
            // Censor vote PASSED. Execute the outcome.
            let global_feed_actor = actor(global_feed_canister_id) : GlobalFeedActor;
            let result = await global_feed_actor.set_sector_vetted_status(vote.target_sector, false);
            
            votes := Array.tabulate(votes.size(), func(i) {
                if (i == index) { updated_vote } else { votes[i] }
            });
            
            switch (result) {
                case (#ok(_)) { return #ok("Vote passed. Sector has been de-vetted."); };
                case (#err(err)) { return #err("Vote passed, but failed to execute: " # err); };
            };
        } else {
            // Censor vote FAILED.
            votes := Array.tabulate(votes.size(), func(i) {
                if (i == index) { updated_vote } else { votes[i] }
            });
            return #ok("Vote failed to pass majority threshold.");
        }
        */
        return #ok("Need to implement.");
    };


    // ==================================================================================================
    // === Private Helper Functions ===
    // ==================================================================================================

    /**
    * Checks if a user is eligible to vote based on account tenure and recent activity.
    */
    private func check_voter_eligibility(voter: Principal) : async Result.Result<(), Text> {
        let user_canister_actor : UserCanisterActor = switch  user_canister_id {
            case (?pid) actor (Principal.toText(pid)) : UserCanisterActor;
            case null Debug.trap("user_canister_id is not set");
          };
        let profile_opt = await user_canister_actor.get_profile_by_principal(voter);

        let profile = switch(profile_opt) {
            case (null) { return #err("Voter does not have a profile."); };
            case (?p) { p };
        };

        let now = Time.now();

        // Account Tenure
        let account_age = now - profile.created_at;
        if (account_age < MIN_ACCOUNT_TENURE_NS) {
            return #err("Account tenure is too new to vote.");
        };

        // Account Activity
        let inactivity_duration = now - profile.last_seen_timestamp;
        if (inactivity_duration > MAX_ACCOUNT_INACTIVITY_NS) {
            return #err("Account has been inactive for too long to vote.");
        };

        return #ok(());
    }

}