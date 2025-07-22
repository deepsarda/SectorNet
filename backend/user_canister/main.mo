import Principal "mo:base/Principal";
import Result "mo:base/Result";
import Time "mo:base/Time";
import BTree "mo:stable-btreemap/BTree";
import Nat "mo:base/Nat";
import Array "mo:base/Array";

actor UserCanister {

    // ==================================================================================================
    // === Types & State ===
    // ==================================================================================================

    public type UserTag = {
        #Admin;
        #GlobalPoster;
        #User;
    };

    public type Profile = {
        owner: Principal;
        username: Text;
        public_key: Blob; // Public key for chat E2EE key distribution
        created_at: Time.Time;
        last_seen_timestamp: Time.Time; // Updated on activity, used for governance quorum
        tags: [UserTag];
    };

    // --- Stable State ---
    // Using Principal as the key for the man profile store.
    stable var profiles: BTree.BTree<Principal, Profile> = BTree.new(10);
    // A secondary map to enforce unique usernames and allow lookup by username.
    stable var usernames: BTree.BTree<Text, Principal> = BTree.new(10);
    // A list of admins, controlled by the canister owner or a future DAO.
    stable var admins: [Principal] = [];
    // The canister owner, set on initialization, has ultimate authority.
    stable var owner: Principal;


    // ==================================================================================================
    // === Initialization ===
    // ==================================================================================================

    public init(initial_owner: Principal) {
        owner := initial_owner;
        // The owner is the first admin.
        admins := [initial_owner];
    };


    // ==================================================================================================
    // === Public Update Calls ===
    // ==================================================================================================

    /**
    * Creates a profile for the calling Principal. This is the final step of the registration process.
    * It critically ensures that the chosen username is unique across the platform.
    * @param username The desired unique username.
    * @param public_key The user's client-generated public key for E2EE.
    * @returns An empty Ok result on success, or an Err with a reason for failure.
    */
    public shared(msg) func create_profile(username: Text, public_key: Blob): async Result.Result<(), Text> {
        let caller = msg.caller;
        let now = Time.now();

        // Authorization: Ensure the caller is not an anonymous identity.
        if (Principal.isAnonymous(caller)) {
            return Result.Err("Anonymous principal not allowed.");
        };

        // Pre-condition: Check if a profile alreay exists for this Principal.
        if (profiles.get(caller) != null) {
            return Result.Err("Profile already exists for this principal.");
        };

        // Pre-condition: Check if the username is already taken.
        if (usernames.get(username) != null) {
            return Result.Err("Username is already taken.");
        };

        // Create the new profile object.
        let new_profile: Profile = {
            owner = caller;
            username = username;
            public_key = public_key;
            created_at = now;
            last_seen_timestamp = now;
            tags = [#User];
        };

        // Persist the new profile and username mapping.
        profiles.put(caller, new_profile);
        usernames.put(username, caller);

        return Result.Ok(());
    };

    /**
    * Updates the last_seen_timestamp for the calling user.
    * This is intended to be called periodically by the frontend to maintain a user's "active" status for governance.
    */
    public shared(msg) func update_activity(): async Result.Result<(), Text> {
        let caller = msg.caller;
        switch (profiles.get(caller)) {
            case (null) { return Result.Err("Profile not found."); };
            case (?profile) {
                let updated_profile: Profile = { ...profile, last_seen_timestamp = Time.now() };
                profiles.put(caller, updated_profile);
                return Result.Ok(());
            };
        };
    };


    // ==================================================================================================
    // === Public Query Calls ===
    // ==================================================================================================

    /**
    * A quick check to see if a Principal has an existing profile. Used during the onboarding flow.
    * @param id The Principal to check.
    * @returns `true` if a profile exists, `false` otherwise.
    */
    public query func profile_exists(id: Principal): async Bool {
        return profiles.get(id) != null;
    };

    /**
    * Fetches a user's public profile by their Principal.
    * @param id The Principal of the user.
    * @returns The user's Profile if found, otherwise null.
    */
    public query func get_profile_by_principal(id: Principal): async ?Profile {
        return profiles.get(id);
    };

    /**
    * Fetches a user's public profile by their username.
    * @param username The username to look up.
    * @returns The user's Profile if found, otherwise null.
    */
    public query func get_profile_by_username(username: Text): async ?Profile {
        let principal_opt = usernames.get(username);
        switch (principal_opt) {
            case (null) { return null; };
            case (?p) { return profiles.get(p); };
        }
    };

    /**
    * Returns the list of current administrators.
    */
    public query func get_admins(): async [Principal] {
        return admins;
    };


    // ==================================================================================================
    // === Admin Functions (Implemented) ===
    // ==================================================================================================

    /**
    * Checks if a given principal is an administrator.
    * An admin is either the canister owner or a principal in the `admins` list.
    */
    private query func is_admin(caller: Principal): Bool {
        if (caller == owner) { return true; };
        for (admin in admins.vals()) {
            if (admin == caller) { return true; };
        };
        return false;
    };

    /**
    * Adds a new administrator to the platform.
    * Also updates the target user's profile tag to #Admin.
    * @param principal The Principal of the user to promote to Admin.
    */
    public shared(msg) func add_admin(principal: Principal) : async Result.Result<(), Text> {
        // Auth: Only an existing admin can call this function.
        if (!is_admin(msg.caller)) { return Result.Err("Unauthorized: Caller is not an admin."); };

        // Pre-condition: Ensure the target user has a profile.
        switch (profiles.get(principal)) {
            case (null) { return Result.Err("Target user does not have a profile."); };
            case (?profile) {
                // Add to the admin list if not already present.
                if (Array.find<Principal>(admins, func(p) { p == principal }) != null) {
                    // Already an admin
                } else {
                    admins := Array.append(admins, [principal]);
                };

                // Update the user's tag to #Admin.
                let updated_profile: Profile = { ...profile, tags = [#Admin] };
                profiles.put(principal, updated_profile);

                return Result.Ok(());
            };
        };
    };

    /**
    * Sets the global user tag for a target user.
    * This is an administrative action to grant roles like #GlobalPoster.
    * @param target_user The Principal of the user to modify.
    * @param new_tag The new global tag to assign.
    */
    public shared(msg) func set_user_tag(target_user: Principal, new_tag: UserTag) : async Result.Result<(), Text> {
        // Auth: Only an admin can set user tags.
        if (!is_admin(msg.caller)) { return Result.Err("Unauthorized: Caller is not an admin."); };

        // Fetch the profile to update.
        switch (profiles.get(target_user)) {
            case (null) { return Result.Err("User profile not found."); };
            case (?profile) {
                // Create a copy of the profile with the new tag and save it.
                // This replaces any existing tags.
                let updated_profile: Profile = { ...profile, tags = [new_tag] };
                profiles.put(target_user, updated_profile);
                return Result.Ok(());
            };
        };
    };
}