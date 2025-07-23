import Principal "mo:base/Principal";
import Result "mo:base/Result";
import Time "mo:base/Time";
import BTree "mo:stableheapbtreemap/BTree";
import Nat "mo:base/Nat";
import Blob "mo:base/Blob";
import ExperimentalCycles "mo:base/ExperimentalCycles";
import IC "mo:base/ExperimentalInternetComputer";
import Error "mo:base/Error";
/**
* The Sector Factory Canister is the sole authority for creating new Sector Canisters.
* This centralized factory model is a key security feature. It allows the platform
* to enforce rules like rate-limiting and ensures that all deployed Sector Canisters
* use the official, vetted Wasm module.
*/
actor SectorFactoryCanister {

    // ==================================================================================================
    // === Types & State ===
    // ==================================================================================================

    // --- Imported Types (from other canisters) ---
    // These types define the data structures this factory needs to creae and register new sectors.

    // From the future SectorCanister
    public type ChatSecurityModel = {
        #HighSecurityE2EE;
        #StandardAccessControl;
    };

    public type SectorConfig = {
        name: Text;
        abbreviation: Text;
        description: Text;
        is_private: Bool;
        security_model: ChatSecurityModel;
        owner: Principal; // The creator of the sector
    };

    // From the future SectorRegistryCanister
    public type SectorInfo = {
        id: Principal;
        name: Text;
        abbreviation: Text;
        description: Text;
        member_count: Nat64;
        is_vetted: Bool;
    };

    // --- Stable State ---
    stable var owner: ?Principal = null;
    stable var rate_limit_map: BTree.BTree<Principal, Time.Time> = BTree.init(10);
    stable var sector_wasm: ?Blob = null;
    stable var registry_canister_id: ?Principal = null;
    stable var invite_canister_id: ?Principal = null;

    // --- Constants ---
    let RATE_LIMIT_DURATION: Nat = 6 * 3_600 * 1_000_000_000; // 6 hours in nanoseconds
    let INITIAL_SECTOR_CYCLES: Nat = 1_000_000_000_000; // 1T cycles, for example

    // ==================================================================================================
    // === Initialization & Setup (Owner Only) ===
    // ==================================================================================================

    // Initialize the canister with its owner.
    public init(initial_owner: Principal) {
        owner = initial_owner;
    };

    private func is_owner(caller: Principal): Bool {
        return caller == owner;
    };

    /**
    * Uploads the Wasm module for the Sector Canister. This is required before any sectors can be created.
    * @param wasm_module The compiled Wasm code of the sector_canister.
    */
    public shared(msg) func set_sector_wasm(wasm_module: Blob): async Result.Result<(), Text> {
        if (!is_owner(msg.caller)) { return #err("Unauthorized: Only the owner can set the Wasm."); };
        sector_wasm := ?wasm_module;
        return #ok(());
    };

    /**
    * Sets the Principal of the Sector Registry Canister.
    */
    public shared(msg) func set_registry_canister(id: Principal): async Result.Result<(), Text> {
        if (!is_owner(msg.caller)) { return #err("Unauthorized"); };
        registry_canister_id := id;
        return #ok(());
    };

    /**
    * Sets the Principal of the Invite Canister.
    */
    public shared(msg) func set_invite_canister(id: Principal): async Result.Result<(), Text> {
        if (!is_owner(msg.caller)) { return #err("Unauthorized"); };
        invite_canister_id := id;
        return #ok(());
    };


    // ==================================================================================================
    // === Core Public Functio ===
    // ==================================================================================================

    /**
    * The sole method for creating a new Sector. It performs all necessary checks and orchestrations.
    * Checks for authorization and rate limits.
    * Then Deploys a new canister instance.
    * Installs the official Sector Canister code onto the new instance.
    * Registers the new sector with the appropriate directory (Public Registry or Private Invite).
    * Updates the rate limit tracker for the user.
    * @param config The configuration for the new sector.
    * @returns The Principal of the newly created Sector Canister on success.
    */
    public shared(msg) func create_new_sector(config: SectorConfig): async Result.Result<Principal, Text> {
        let caller = msg.caller;
        let now = Time.now();

        // Authorization & Pre-condition Checks
        if (Principal.isAnonymous(caller)) {
            return #err("Anonymous principal cannot create a sector.");
        };

        switch (sector_wasm) {
            case (null) { return #err("Factory is not configured with a Wasm module yet."); };
            case (_) {};
        };

        // Enforce Rate Limiting
        switch (rate_limit_map.get(caller)) {
            case (?last_creation) {
                if (Nat.fromInt(now - last_creation) < RATE_LIMIT_DURATION) {
                    return #err("Rate limit exceeded. Please wait before creating another sector.");
                };
            };
            case (null) {}; // No previous creation, proceed.
        };

        // Create a new canister instance with cycles
        let new_canister_result = await create_canister(INITIAL_SECTOR_CYCLES);
        let new_canister_principal: Principal;
        switch (new_canister_result) {
            case (#err(err)) { return #err("Failed to create new canister: " # err); };
            case (#ok(p)) { new_canister_principal := p; };
        };

        // Install the SectorCanister code on the new instance
        switch (sector_wasm) {
            case (null) { return #err("Internal error: Wasm module disappeared."); }; // Should be unreachable
            case (?wasm) {
                // The initial SectorConfig is passed as an encoded argument to the new canister's `init` function.
                let install_arg = to_candid(config);
                let install_result = await install_code(new_canister_principal, wasm, install_arg);

                if (Result.isErr(install_result)) {
                    // This is a critical failure. We have an empty canister that we can't use.
                    // In a more advanced version, we might try to delete it.
                    return #err("Failed to install code on the new canister.");
                };
            };
        };

        // Register the new sector with the appropriate directory service
        if (config.is_private) {
            // Private Sector: Register with the Invite Canister
            if (invite_canister_id == Principal.anonymous()) {
                // Not a fatal error, but the sector won't be joinable. Log it.
                // In a real app, you'd have more robust error logging/handling.
            } else {
                // This is a trusted, inter-canister call.
                let invite_actor = actor (invite_canister_id) : shared { register_new_private_sector : (Principal) -> async () };
                await invite_actor.register_new_private_sector(new_canister_principal);
            };
        } else {
            // Public Sector: Register with the Sector Registry
            if (registry_canister_id == Principal.anonymous()) {
                // Not a fatal error, but the sector won't be discoverable.
            } else {
                let sector_info: SectorInfo = {
                    id = new_canister_principal;
                    name = config.name;
                    abbreviation = config.abbreviation;
                    description = config.description;
                    member_count = 1; // Starts with the creator
                    is_vetted = false;
                };
                let registry_actor = actor (registry_canister_id) : shared { register_sector : (SectorInfo) -> async Result.Result<(), Text> };
                ignore await registry_actor.register_sector(sector_info);
            };
        };

        // On success, update the rate-limit map for the caller
        rate_limit_map.put(caller, now);

        // Return the ID of the new Sector Canister
        return #ok(new_canister_principal);
    };


    // ==================================================================================================
    // === Private Helper Functions ===
    // ==================================================================================================
    // Creates a new canister with the specified amunt of cycles.
    private func create_canister(cycles_to_send: Nat): async Result.Result<Principal, Text> {
        if (ExperimentalCycles.available() < cycles_to_send) {
            return #err("Factory does not have enough cycles to create a new sector.");
        };
        ExperimentalCycles.add(cycles_to_send);
        let settings = null;
        try {
            let result = await IC.create_canister({ settings });
            #ok(result.canister_id)
        } catch (e) {
            #err("Failed to create canister: " # Error.message(e))
        }
    }


    // Installs code on the specified canister.
    private func install_code(canister_id: Principal, wasm_module: Blob, arg: Blob): async Result.Result<(), Text> {
        let ic = actor ("aaaaa-aa") : actor {
            install_code: shared {
                arg: Blob;
                wasm_module: Blob;
                mode: { #install; #reinstall; #upgrade };
                canister_id: Principal;
            } -> async ();
        };
        try {
            await ic.install_code({
                arg = arg;
                wasm_module = wasm_module;
                mode = #install;
                canister_id = canister_id;
            });
            #ok(())
        } catch (e) {
            #err("Failed to install code: " # Error.message(e))
        }
    }

}