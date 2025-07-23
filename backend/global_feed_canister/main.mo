import Principal "mo:base/Principal";
import Result "mo:base/Result";
import Time "mo:base/Time";
import BTree "mo:stableheapbtreemap/BTree";
import Nat "mo:base/Nat";
import Nat64 "mo:base/Nat64";
import Text "mo:base/Text";
import Iter "mo:base/Iter";
import Option "mo:base/Option";

/**
* The Global Feed Canister is the single source of truth for all public content on SectorNet.
* It aggregates posts from vetted Sector Canisters and from privileged users (Admins, Global Posters).
* Access to submit content is strictly controlled to maintain a high-quality public feed.
*/
actor GlobalFeedCanister {

    // ==================================================================================================
    // === Types & State ===
    // ==================================================================================================
    
    // These types are simplified for the Global Feed's context.
    public type UserTag = { #Admin; #GlobalPoster; #User; };
    public type SectorRole = { #Moderator; #Poster; #Member; };

    // The full structure for a post that is stored and served by this canister.
    public type GlobalPost = {
        id: Nat64;
        author_principal: Principal;
        author_username: Text;
        // In a direct post, these tags are fetched from the User Canister.
        // In a sector post, they are provided by the Sector Canister.
        author_user_tag: ?UserTag;
        author_sector_role: ?SectorRole;
        content_markdown: Text; // Content is always plaintext for the global feed.
        timestamp: Time.Time;
        origin_sector_id: ?Principal; // Null if it's a direct post from an Admin/GlobalPoster.
    };
    
    // Simplified structure for direct post submission.
    public type DirectPostSubmission = {
      content_markdown: Text;
    };
    
    // Simplified structure for sector post submission.
    public type SectorPostSubmission = {
      author_principal: Principal;
      author_username: Text;
      content_markdown: Text;
      origin_sector_id: Principal;
    };


    // --- Stable State ---
    stable var posts: BTree.BTree<Nat64, GlobalPost> = BTree.new(10);
    stable var next_post_id: Nat64 = 0;

    // --- Access Control Lists (ACLs) ---
    stable var vetted_sectors: BTree.BTree<Principal, ()> = BTree.new(10);
    stable var global_posters: BTree.BTree<Principal, ()> = BTree.new(10);
    stable var admins: BTree.BTree<Principal, ()> = BTree.new(10);
    
    // --- Canister Dependencies & Owner ---
    stable var owner: Principal = Principal.anonymous();
    // The governance canister will have the authority to change ACLs.
    stable var governance_canister_id: ?Principal = null;
    
    
    // ==================================================================================================
    // === Initialization & Setup (Owner Only) ===
    // ==================================================================================================

    public init(initial_owner: Principal) {
        owner := initial_owner;
        // The owner is the first admin.
        admins.put(owner, ());
    };

    private query func is_admin(p: Principal): Bool {
        return admins.get(p) != null;
    };
    
    public shared(msg) func set_governance_canister(id: Principal): async Result.Result<(), Text> {
        if (msg.caller != owner) { 
            return Result.Err("Unauthorized: Only owner can set governance ID."); 
        };
        governance_canister_id := ?id;
        return Result.Ok(());
    };
    
    // ==================================================================================================
    // === Public Update Calls (Content Submission) ===
    // ==================================================================================================

    /**
    * Submits a post from a Sector Canister.
    * Auth: The calling canister's Principal MUST be in the `vetted_sectors` list.
    * @param post_data The content of the post.
    * @returns The ID of the new global post.
    */
    public shared(msg) func submit_post_from_sector(post_data: SectorPostSubmission): async Result.Result<Nat64, Text> {
        // Auth Check: Is the caller a vetted Sector Canister?
        if (vetted_sectors.get(msg.caller) == null) {
            return Result.Err("Unauthorized: Calling canister is not a vetted sector.");
        };

        let id = next_post_id;
        next_post_id += 1;

        let new_post: GlobalPost = {
            id;
            author_principal = post_data.author_principal;
            author_username = post_data.author_username;
            author_user_tag = null; // Tag is less relevant when coming from a sector.
            author_sector_role = null; // Can be enhanced later to include the role.
            content_markdown = post_data.content_markdown;
            timestamp = Time.now();
            origin_sector_id = ?post_data.origin_sector_id;
        };

        posts.put(id, new_post);
        return Result.Ok(id);
    };
    
    /**
    * Submits a post directly from a privileged user.
    * Auth: The calling user's Principal MUST be in the `admins` or `global_posters` list.
    * @param post_data The content of the post.
    * @returns The ID of the new global post.
    */
    public shared(msg) func submit_direct_post(post_data: DirectPostSubmission, author_username: Text, author_tag: UserTag): async Result.Result<Nat64, Text> {
        let caller = msg.caller;
        
        // Auth Check: Is the caller an Admin or Global Poster?
        if (admins.get(caller) == null and global_posters.get(caller) == null) {
            return Result.Err("Unauthorized: Caller is not an admin or global poster.");
        };

        let id = next_post_id;
        next_post_id += 1;

        let new_post: GlobalPost = {
            id;
            author_principal = caller;
            author_username = author_username;
            author_user_tag = ?author_tag;
            author_sector_role = null; // No sector role for direct posts.
            content_markdown = post_data.content_markdown;
            timestamp = Time.now();
            origin_sector_id = null;
        };

        posts.put(id, new_post);
        return Result.Ok(id);
    };
    
    
    // ==================================================================================================
    // === Public Update Calls (ACL Management) ===
    // ==================================================================================================

    /**
    * Sets the vetted status for a sector.
    * Auth: Must be called by the Governance Canister or the Owner.
    */
    public shared(msg) func set_sector_vetted_status(sector_id: Principal, new_status: Bool): async Result.Result<(), Text> {
        // Auth check
        if (msg.caller != owner and Some.get(governance_canister_id, Principal.anonymous()) != msg.caller) {
            return Result.Err("Unauthorized: Caller is not the owner or governance canister.");
        };
        
        if (new_status) {
            vetted_sectors.put(sector_id, ());
        } else {
            vetted_sectors.delete(sector_id);
        };
        return Result.Ok(());
    };
    
    /**
    * Adds a user to the global poster list.
    * Auth: Admin only.
    */
    public shared(msg) func add_global_poster(user: Principal): async Result.Result<(), Text> {
        if(not is_admin(msg.caller)) {  
            return Result.Err("Unauthorized"); 
        };
        global_posters.put(user, ());
        return Result.Ok(());
    };
    
    /**
    * Removes a user from the global poster list.
    * Auth: Admin only.
    */
    public shared(msg) func remove_global_poster(user: Principal): async Result.Result<(), Text> {
        if(not is_admin(msg.caller)) { return Result.Err("Unauthorized"); };
        global_posters.delete(user);
        return Result.Ok(());
    };


    // ==================================================================================================
    // === Public Query Calls ===
    // ==================================================================================================

    /**
    * Fetches the most recent posts from the global feed.
    * Posts are returned in reverse chronological order ( aka newest first).
    * @param page The page number for pagination.
    * @param size The number of posts per page.
    * @returns An array of GlobalPost objects.
    */
    public query func get_global_feed(page: Nat, size: Nat): async [GlobalPost] {
        // This implements keyset pagination by using the reverse iterator.
        // For a true paginated experience, you'd skip `page * size` elements.
        let iter = posts.valsRev();
        let skipped_iter = Iter.skip(iter, page * size);
        let limited_iter = Iter.limit(skipped_iter, size);
        return Iter.toArray(limited_iter);
    };

    /**
    * Gets the list of all vetted sector principals.
    */
    public query func get_vetted_sectors(): async [Principal] {
      let result: [var Principal] = [];
      for ((p, _) in vetted_sectors.entries()) {
        result.push(p);
      };
      return result;
    };
}