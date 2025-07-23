import Principal "mo:base/Principal";
import Result "mo:base/Result";
import Time "mo:base/Time";
import HM "mo:base/HashMap";
import Hash "mo:base/Hash";
import Nat "mo:base/Nat";
import Nat64 "mo:base/Nat64";
import Text "mo:base/Text";
import Iter "mo:base/Iter";
import Option "mo:base/Option";
import Array "mo:base/Array";
import Order "mo:base/Order";

/**
* The Global Feed Canister is the single source of truth for all public content on SectorNet.
* It aggregates posts from vetted Sector Canisters and from privileged users (Admins, Global Posters).
* Access to submit content is strictly controlled to maintain a high-quality public feed.
*/
actor GlobalFeedCanister {

    // === Types & State ===

    public type UserTag = { #Admin; #GlobalPoster; #User; };
    public type SectorRole = { #Moderator; #Poster; #Member; };

    public type GlobalPost = {
        id: Nat64;
        author_principal: Principal;
        author_username: Text;
        author_user_tag: ?UserTag;
        author_sector_role: ?SectorRole;
        content_markdown: Text;
        timestamp: Time.Time;
        origin_sector_id: ?Principal;
    };

    public type DirectPostSubmission = {
      content_markdown: Text;
    };

    public type SectorPostSubmission = {
      author_principal: Principal;
      author_username: Text;
      content_markdown: Text;
      origin_sector_id: Principal;
    };

    // --- Stable State ---
    stable var posts_entries : [(Nat64, GlobalPost)] = [];
    stable var next_post_id: Nat64 = 0;
    stable var vetted_sectors_entries : [(Principal, ())] = [];
    stable var global_posters_entries : [(Principal, ())] = [];
    stable var admins_entries : [(Principal, ())] = [];
    stable var owner: Principal = Principal.fromText("2vxsx-fae");
    stable var governance_canister_id: ?Principal = null;

    // --- In-memory State ---
    var posts = HM.HashMap<Nat64, GlobalPost>(16, Nat64.equal, func (n : Nat64) : Hash.Hash = Hash.hash(Nat64.toNat(n)));
    var vetted_sectors = HM.HashMap<Principal, ()>(16, Principal.equal, Principal.hash);
    var global_posters = HM.HashMap<Principal, ()>(16, Principal.equal, Principal.hash);
    var admins = HM.HashMap<Principal, ()>(16, Principal.equal, Principal.hash);

    // === Upgrade Hooks ===
    system func preupgrade() {
        posts_entries := Iter.toArray(posts.entries());
        vetted_sectors_entries := Iter.toArray(vetted_sectors.entries());
        global_posters_entries := Iter.toArray(global_posters.entries());
        admins_entries := Iter.toArray(admins.entries());
    };

    system func postupgrade() {
        posts := HM.HashMap<Nat64, GlobalPost>(16, Nat64.equal, func (n : Nat64) : Hash.Hash = Hash.hash(Nat64.toNat(n))
);
        for ((k, v) in posts_entries.vals()) { posts.put(k, v); };
        vetted_sectors := HM.HashMap<Principal, ()>(16, Principal.equal, Principal.hash);
        for ((k, v) in vetted_sectors_entries.vals()) { vetted_sectors.put(k, v); };
        global_posters := HM.HashMap<Principal, ()>(16, Principal.equal, Principal.hash);
        for ((k, v) in global_posters_entries.vals()) { global_posters.put(k, v); };
        admins := HM.HashMap<Principal, ()>(16, Principal.equal, Principal.hash);
        for ((k, v) in admins_entries.vals()) { admins.put(k, v); };
    };

    // === Initialization & Setup (Owner Only) ===

    public func init(initial_owner: Principal) {
        owner := initial_owner;
        admins.put(owner, ());
    };

    // Helper to check if a principal is an admin.
    private query func is_admin(p: Principal): async Bool {
        return admins.get(p) != null;
    };

    // Set the governance canister (owner only).
    public shared(msg) func set_governance_canister(id: Principal): async Result.Result<(), Text> {
        if (msg.caller != owner) {
            return #err("Unauthorized: Only owner can set governance ID.");
        };
        governance_canister_id := ?id;
        return #ok(());
    };

    // === Public Update Calls (Content Submission) ===

    /**
    * Submits a post from a Sector Canister.
    * Auth: The calling canister's Principal MUST be in the `vetted_sectors` list.
    */
    public shared(msg) func submit_post_from_sector(post_data: SectorPostSubmission): async Result.Result<Nat64, Text> {
        if (vetted_sectors.get(msg.caller) == null) {
            return #err("Unauthorized: Calling canister is not a vetted sector.");
        };

        let id = next_post_id;
        next_post_id += 1;

        let new_post: GlobalPost = {
            id;
            author_principal = post_data.author_principal;
            author_username = post_data.author_username;
            author_user_tag = null;
            author_sector_role = null;
            content_markdown = post_data.content_markdown;
            timestamp = Time.now();
            origin_sector_id = ?post_data.origin_sector_id;
        };

        posts.put(id, new_post);
        return #ok(id);
    };

    /**
    * Submits a post directly from a privileged user.
    * Auth: The calling user's Principal MUST be in the `admins` or `global_posters` list.
    */
    public shared(msg) func submit_direct_post(post_data: DirectPostSubmission, author_username: Text, author_tag: UserTag): async Result.Result<Nat64, Text> {
        let caller = msg.caller;

        if (admins.get(caller) == null and global_posters.get(caller) == null) {
            return #err("Unauthorized: Caller is not an admin or global poster.");
        };

        let id = next_post_id;
        next_post_id += 1;

        let new_post: GlobalPost = {
            id;
            author_principal = caller;
            author_username = author_username;
            author_user_tag = ?author_tag;
            author_sector_role = null;
            content_markdown = post_data.content_markdown;
            timestamp = Time.now();
            origin_sector_id = null;
        };

        posts.put(id, new_post);
        return #ok(id);
    };

    // === Public Update Calls (ACL Management) ===

    /**
    * Sets the vetted status for a sector.
    * Auth: Must be called by the Governance Canister or the Owner.
    */
    public shared(msg) func set_sector_vetted_status(sector_id: Principal, new_status: Bool): async Result.Result<(), Text> {
        let governance_id = Option.get(governance_canister_id, Principal.fromText("2vxsx-fae"));
        if (msg.caller != owner and msg.caller != governance_id) {
            return #err("Unauthorized: Caller is not the owner or governance canister.");
        };

        if (new_status) {
            vetted_sectors.put(sector_id, ());
        } else {
            vetted_sectors.delete(sector_id);
        };
        return #ok(());
    };

    /**
    * Adds a user to the global poster list.
    * Auth: Admin only.
    */
    public shared(msg) func add_global_poster(user: Principal): async Result.Result<(), Text> {
        if (not (await is_admin(msg.caller))) {
            return #err("Unauthorized");
        };
        global_posters.put(user, ());
        return #ok(());
    };

    /**
    * Removes a user from the global poster list.
    * Auth: Admin only.
    */
    public shared(msg) func remove_global_poster(user: Principal): async Result.Result<(), Text> {
        if (not (await is_admin(msg.caller))) { return #err("Unauthorized"); };
        global_posters.delete(user);
        return #ok(());
    };

    // === Public Query Calls ===
    /**
    * Fetches the most recent posts from the global feed.
    * Posts are returned in reverse chronological order (newest first).
    */
    public query func get_global_feed(page: Nat, size: Nat): async [GlobalPost] {
        let arr = Iter.toArray(posts.entries());

        // Sort by post ID, newest first (descending)
        let sortedArr = Array.sort<(Nat64, GlobalPost)>(
            arr,
            func(a, b) : Order.Order {
                return Nat64.compare(b.0, a.0);
            }
        );

        // Calculate the start index for the desired page.
        let start_index = page * size;

        // Check if the start_index is out of bounds to return an empty array early.
        if (start_index >= sortedArr.size()) {
            return [];
        };

        // Calculate the end index.
        let end_index = Nat.min(start_index + size, sortedArr.size());

        // Get the page slice as an array
        let page_of_tuples = Iter.toArray(Array.slice(sortedArr, start_index, end_index));

        // Map to just the GlobalPost values
        return Array.map<(Nat64, GlobalPost), GlobalPost>(
            page_of_tuples,
            func((_, post)) : GlobalPost {
                return post;
            }
        );
    };



    /**
    * Gets the list of all vetted sector principals.
    */
    public query func get_vetted_sectors(): async [Principal] {
        return Iter.toArray(vetted_sectors.keys());
    };
}