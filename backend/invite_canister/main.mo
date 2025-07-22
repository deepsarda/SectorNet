import Principal "mo:base/Principal";
import Result "mo:base/Result";
import HashMap "mo:base/HashMap";
import Iter "mo:base/Iter";
import Text "mo:base/Text";

/**
* The Invite Canister is a secure resolver for private Sector invite codes.
* It maintains a mapping between a secret code and the Principal of the Sector it belongs to.
*/
actor class InviteCanister(initial_owner: Principal, initial_factory: Principal) = this {

    // ==================================================================================================
    // === Types & State ===
    // ==================================================================================================

    // Stable storage for upgrade safety
    stable var invite_codes_entries : [(Text, Principal)] = [];
    stable var authorized_sectors_entries : [(Principal, ())] = [];
    stable var owner : Principal = initial_owner;
    stable var factory_canister_id : Principal = initial_factory;

    // In-memory maps
    var invite_codes = HashMap.HashMap<Text, Principal>(10, Text.equal, Text.hash);
    var authorized_sectors = HashMap.HashMap<Principal, ()>(10, Principal.equal, Principal.hash);

    // ==================================================================================================
    // === Upgrade Hooks ===
    // ==================================================================================================

    system func preupgrade() {
        invite_codes_entries := Iter.toArray(invite_codes.entries());
        authorized_sectors_entries := Iter.toArray(authorized_sectors.entries());
    };

    system func postupgrade() {
        invite_codes := HashMap.HashMap<Text, Principal>(10, Text.equal, Text.hash);
        for ((k, v) in invite_codes_entries.vals()) {
            invite_codes.put(k, v);
        };
        invite_codes_entries := [];

        authorized_sectors := HashMap.HashMap<Principal, ()>(10, Principal.equal, Principal.hash);
        for ((k, v) in authorized_sectors_entries.vals()) {
            authorized_sectors.put(k, v);
        };
        authorized_sectors_entries := [];
    };

    // ==================================================================================================
    // === Initialization & Setup (Owner Only) ===
    // ==================================================================================================

    private func is_owner(caller: Principal): Bool {
        return caller == owner;
    };

    public shared(msg) func set_factory_canister(id: Principal): async Result.Result<(), Text> {
        if (!is_owner(msg.caller)) { return Result.Err("Unauthorized"); };
        factory_canister_id := id;
        return Result.Ok(());
    };

    // ==================================================================================================
    // === Public Update Calls ===
    // ==================================================================================================

    /**
    * Authorizes a new private sector to generate invite codes.
    * CRITICAL: This must only be called by the Sector Factory Canister.
    * @param sector_id The Principal of the newly created private Sector Canister.
    */
    public shared(msg) func register_new_private_sector(sector_id: Principal): async () {
        if (msg.caller == factory_canister_id) {
            authorized_sectors.put(sector_id, ());
        };
    };

    /**
    * Registers a new invite code on behalf of a Sector.
    * @param code The secret invite code to register.
    * @returns An empty Ok or an Err if the code is already taken.
    */
    public shared(msg) func register_code(code: Text): async Result.Result<(), Text> {
        let caller = msg.caller;

        // Authorization: Only authorized Sector Canisters can create codes.
        if (authorized_sectors.get(caller) == null) {
            return Result.Err("Unauthorized: This canister is not an authorized private sector.");
        };

        // Pre-condition: Ensure the code isn't already in use.
        if (invite_codes.get(code) != null) {
            return Result.Err("Invite code is already taken.");
        };

        // Persist the mapping from the code to the calling Sector's Principal.
        invite_codes.put(code, caller);
        return Result.Ok(());
    };

    /**
    * Deletes an invite code, making it invalid.
    * @param code The invite code to revoke.
    */
    public shared(msg) func revoke_code(code: Text): async Result.Result<(), Text> {
        let caller = msg.caller;

        switch (invite_codes.get(code)) {
            case (null) {
                // It's fine if the code doesn't exist; the end state is the same.
                return Result.Ok(());
            };
            case (?sector_principal) {
                // Authorization: Only the canister that originally created the code can revoke it.
                if (caller != sector_principal) {
                    return Result.Err("Unauthorized: You do not own this invite code.");
                };
                invite_codes.delete(code);
                return Result.Ok(());
            };
        };
    };

    // ==================================================================================================
    // === Public Query Calls ===
    // ==================================================================================================

    /**
    * Takes an invite code and returns the associated Sector Principal ID.
    * This is called by the frontend when a user attempts to join a private sector.
    * @param code The invite code to resolve.
    * @returns The Principal of the Sector, or null if the code is invalid.
    */
    public query func resolve_code(code: Text): async ?Principal {
        return invite_codes.get(code);
    };
}