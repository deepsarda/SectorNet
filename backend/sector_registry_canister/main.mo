import Principal "mo:base/Principal";
import Result "mo:base/Result";
import BTree "mo:stableheapbtreemap/BTree";
import Nat "mo:base/Nat";
import Text "mo:base/Text";
import Iter "mo:base/Iter";

/**
* The Sector Registry Canister is the discoverabillity engine for all PUBLIC sectors.
* It maintains a list of public communities and allows users to search for them.
* For security, only the trusted SectorFactoryCanister can add new sectors to this registry.
*/
actor SectorRegistryCanister {

    // ==================================================================================================
    // === Types & State ===
    // ==================================================================================================

    public type SectorInfo = {
        id: Principal;          // The Principal of the Sector Canister
        name: Text;
        abbreviation: Text;     // 2-3 letter abbreviation
        description: Text;
        member_count: Nat64;
        is_vetted: Bool;        // Status granted by platform Admins
    };

    // --- Stable State ---
    stable var owner: Principal;
    stable var factory_canister_id: Principal;
    stable var sectors: BTree.BTree<Principal, SectorInfo> = BTree.new(10);


    // ==================================================================================================
    // === Initialization & Setup (Owner Only) ===
    // ==================================================================================================

    public init(initial_owner: Principal, initial_factory: Principal) {
        owner := initial_owner;
        factory_canister_id := initial_factory;
    };

    private func is_owner(caller: Principal): Bool {
        return caller == owner;
    };

    public shared(msg) func set_factory_canister(id: Principal): async Result.Result<(), Text> {
        if (!is_owner(msg.caller)) { return Result.Err("Unauthorized: Only owner can set factory ID."); };
        factory_canister_id := id;
        return Result.Ok(());
    };

    // ==================================================================================================
    // === Public Update Calls ===
    // ==================================================================================================

    /**
    * Adds a new Public Sector t the directory.
    * CRITICAL: This can only be called by the Sector Factory Canister to prevent spoofing.
    * @param info The public information for the new Sector.
    */
    public shared(msg) func register_sector(info: SectorInfo): async Result.Result<(), Text> {
        if (msg.caller != factory_canister_id) {
            return Result.Err("Unauthorized: Only the Sector Factory can register new sectors.");
        };
        if (sectors.get(info.id) != null) {
            return Result.Err("Sector already registered.");
        };
        sectors.put(info.id, info);
        return Result.Ok(());
    };

    /**
    * Called by a Sector Canister on behalf of its moderator to update public listing info.
    * Note: The Sector Canister is responsible for authenticating that its own caller is a moderator.
    * @param info The updated SectorInfo struct.
    */
    public shared(msg) func update_sector_listing(info: SectorInfo): async Result.Result<(), Text> {
        // The primary check: the caller must be the Sector Canister itself.
        if (msg.caller != info.id) {
            return Result.Err("Unauthorized: Caller is not the sector it's trying to update.");
        };
        switch(sectors.get(info.id)) {
            case (null) { return Result.Err("Sector not found in registry."); };
            case (?oldInfo) {
                // To prevent a sector from making itself vetted, we preserve the old `is_vetted` status.
                let updatedInfo = { ...info, is_vetted = oldInfo.is_vetted };
                sectors.put(info.id, updatedInfo);
                return Result.Ok(());
            };
        };
    };

    /**
    * Updates the vetted status of a sector. Intended to be called by the Governance canister.
    */
     public shared(msg) func set_sector_vetted_status(sector_id: Principal, new_status: Bool): async Result.Result<(), Text> {
        // In a full implementation, this would check if caller is the Governance Canister.
        // For now, we'll restrict to owner.
        if (!is_owner(msg.caller)) { return Result.Err("Unauthorized"); };

        switch(sectors.get(sector_id)) {
            case (null) { return Result.Err("Sector not found."); };
            case (?info) {
                sectors.put(sector_id, { ...info, is_vetted = new_status });
                return Result.Ok(());
            };
        };
     };


    // ==================================================================================================
    // === Public Query Calls ===
    // ==================================================================================================

    /**
    * Searches for public sectors by name or description.
    * @param query_text The text to search for.
    * @returns A vector of matching SectorInfo structs.
    */
    public query func search_sectors(query_text: Text): async [SectorInfo] {
        if (query_text == "") {
            // Return all sectors if the query is empty, perhaps with pagination in a real app.
            return Iter.toArray(sectors.vals());
        };

        let query_lower = Text.toLower(query_text);
        let results: [var SectorInfo] = [];
        for ((_, info) in sectors.entries()) {
            if (Text.toLower(info.name).contains(query_lower) or Text.toLower(info.description).contains(query_lower)) {
                results.push(info);
            };
        };
        return results;
    };

    /**
    * Retrieves a list of allsectors that have been marked as 'vetted' by the platform admins.
    * @returns A vector of vetted SectorInfo structs.
    */
    public query func get_vetted_sectors(): async [SectorInfo] {
        let results: [var SectorInfo] = [];
        for ((_, info) in sectors.entries()) {
            if (info.is_vetted) {
                results.push(info);
            };
        };
        return results;
    };
}