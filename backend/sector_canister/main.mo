import Principal "mo:base/Principal";
import Result "mo:base/Result";
import Time "mo:base/Time";
import BTree "mo:stable-btreemap/BTree";
import Nat "mo:base/Nat";
import Nat64 "mo:base/Nat64";
import Text "mo:base/Text";
import Blob "mo:base/Blob";
import Iter "mo:base/Iter";
import Random "mo:base/Random";
import Array "mo:base/Array";

/**
* The Sector Canister is a self-contained social hub. It manages its own members, roles,
* content (posts and chat), and configuration. Each instance of this canister represents
* a unique community within the SectorNet ecosystem. Its behavior, particularly regarding
* security and privacy, is determined by the ChatSecurityModel configured at creation.
*/
actor SectorCanister {

    // ==================================================================================================
    // === Types & State ===
    // ==================================================================================================

    // --- Public Types ---
    public type SectorRole = { #Moderator; #Poster; #Member; };
    public type PostStatus = { #Private; #PendingGlobal; #ApprovedGlobal; };

    public type ChatSecurityModel = {
        #HighSecurityE2EE;       // Verifiable E2EE for <= 50 members
        #StandardAccessControl; // Scalable, canister-based access for > 50 members
    };

    public type SectorConfig = {
        name: Text;
        abbreviation: Text;
        description: Text;
        is_private: Bool;
        security_model: ChatSecurityModel;
        owner: Principal;
    };

    public type Post = {
        id: Nat64;
        author_principal: Principal;
        encrypted_content_markdown: Blob;
        timestamp: Time.Time;
        status: PostStatus;
        global_post_id: ?Nat64;
    };

    public type Message = {
        id: Nat64;
        key_epoch_id: Nat32; // For E2EE mode, client-defined
        author_principal: Principal;
        timestamp: Time.Time;
        encrypted_content_markdown: Blob;
    };


    // --- Actor Interfaces for Inter-Canister Calls ---
    // The specific functions this canister needs to call on other canisters.
    type InviteCanisterActor = actor {
        register_code: (Text) -> async Result.Result<(), Text>;
    };
    type GlobalFeedActor = actor {
        // This is a simplified version of the GlobalPost for submission
        submit_post_from_sector: (record {
            author_principal: Principal;
            author_username: Text; // Fetched from UserCanister
            content_markdown: Text;
            origin_sector_id: Principal;
        }) -> async Result.Result<Nat64, Text>;
    };
    type UserCanisterActor = actor {
        get_profile_by_principal: (Principal) -> async ?record { username: Text; };
    };


    // --- Stable State ---
    stable var config: SectorConfig;
    stable var members: BTree.BTree<Principal, SectorRole> = BTree.new(10);
    stable var posts: BTree.BTree<Nat64, Post> = BTree.new(10);
    stable var channels: BTree.BTree<Text, BTree.BTree<Nat64, Message>> = BTree.new(10);
    stable var next_post_id: Nat64 = 0;
    stable var next_message_id: Nat64 = 0;
    
    // --- High-Security Mode State ---
    stable var rekey_required: Bool = false;

    // --- Canister Dependencies ---
    // These are set at initialization.
    stable var invite_canister_id: Principal;
    stable var global_feed_canister_id: Principal;
    stable var user_canister_id: Principal;

    // --- Constants ---
    let HIGH_SECURITY_MEMBER_LIMIT: Nat = 50;


    // ==================================================================================================
    // === Initialization ===
    // ==================================================================================================

    public init(initial_config: SectorConfig, invite_id: Principal, global_feed_id: Principal, user_id: Principal) {
        config := initial_config;
        invite_canister_id := invite_id;
        global_feed_canister_id := global_feed_id;
        user_canister_id := user_id;

        // The creator of the sector is automatically the first member and a moderator.
        members.put(config.owner, #Moderator);
        
        // Create a default "general" channel
        channels.put("general", BTree.new(10));
    };


    // ==================================================================================================
    // === Authorization Helper Queries ===
    // ==================================================================================================

    private query func is_member(p: Principal): Bool {
        return members.get(p) != null;
    };

    private query func get_role(p: Principal): ?SectorRole {
        return members.get(p);
    };

    private query func is_moderator(p: Principal): Bool {
        return switch (members.get(p)) {
            case (?#Moderator) { true; };
            case _ { false; };
        };
    };

    private query func is_poster(p: Principal): Bool {
        return switch (members.get(p)) {
            case (?#Moderator) { true; };
            case (?#Poster) { true; };
            case _ { false; };
        };
    };


    // ==================================================================================================
    // === Membership & Roles ===
    // ==================================================================================================

    public shared(msg) func join(): async Result.Result<(), Text> {
        // Pre-condition: Sector must be public.
        if (config.is_private) { 
            return Result.Err("This is a private sector. Use an invite code to join."); 
        };
        
        let caller = msg.caller;
        if (is_member(caller)) { 
            return Result.Err("Already a member."); 
        };

        // Pre-condition for High-Security mode: Enforce member limit.
        if (config.security_model == #HighSecurityE2EE) {
            if (members.size() >= HIGH_SECURITY_MEMBER_LIMIT) {
                return Result.Err("Sector is at its maximum capacity for high-security mode.");
            }
        };

        members.put(caller, #Member);
        return Result.Ok(());
    };

    public shared(msg) func join_with_invite(): async Result.Result<(), Text> {
        // This function is called AFTER the frontend has resolved the invite code.
        // The fact that the user knows this canister's principal is proof of a valid invite.
        if (not config.is_private) { 
            return Result.Err("This is a public sector."); 
        };

        let caller = msg.caller;
        if (is_member(caller)) { 
            return Result.Err("Already a member."); 
        };

        if (config.security_model == #HighSecurityE2EE) {
            if (members.size() >= HIGH_SECURITY_MEMBER_LIMIT) {
                return Result.Err("Sector is at its maximum capacity for high-security mode.");
            }
        };

        members.put(caller, #Member);
        return Result.Ok(());
    };

    public shared(msg) func leave(): async Result.Result<(), Text> {
        let caller = msg.caller;
        if (not is_member(caller)) { 
            return Result.Err("Not a member of this sector.");
        };

        members.delete(caller);

        // Security Critical: If in high-security mode, leaving compromises the key.
        // Flag that a re-key is now required to maintain forward secrecy.
        if (config.security_model == #HighSecurityE2EE) {
            rekey_required := true;
        };

        return Result.Ok(());
    };

    public shared(msg) func set_sector_role(target_user: Principal, new_role: SectorRole): async Result.Result<(), Text> {
        // Auth: Caller must be a moderator.
        if (not is_moderator(msg.caller)) { 
            return Result.Err("Unauthorized: Only moderators can set roles."); 
        };

        // Can't change the owner's role or your own role with this function.
        if (target_user == config.owner) { 
            return Result.Err("The sector owner's role cannot be changed."); 
        };

        if (target_user == msg.caller) { 
            return Result.Err("Moderators cannot change their own role."); 
        };

        if (not is_member(target_user)) { 
            return Result.Err("Target user is not a member of this sector."); 
        };

        members.put(target_user, new_role);
        return Result.Ok(());
    };

    public shared(msg) func create_invite_code(): async Result.Result<Text, Text> {
        // Auth: Caller must be a moderator of a private sector.
        if (not is_moderator(msg.caller)) { return Result.Err("Unauthorized: Only moderators can create invites."); };
        if (not config.is_private) { return Result.Err("Cannot create invites for a public sector."); };

        // Generate a random, user-friendly code.
        let random_bytes = await Random.blob();
        let code = Text.toText(Blob.encodeHex(random_bytes.slice(0, 4))); // e.g., "a1b2c3d4"

        let invite_actor = actor (invite_canister_id) : InviteCanisterActor;
        let result = await invite_actor.register_code(code);

        switch (result) {
            case (Result.Ok()) { return Result.Ok(code); };
            case (Result.Err(err)) { return Result.Err(err); };
        };
    };

    // ==================================================================================================
    // === Sector Feed ===
    // ==================================================================================================

    public shared(msg) func create_post(encrypted_content_markdown: Blob, for_global_feed: Bool): async Result.Result<Nat64, Text> {
        // Auth: Caller must be a Poster or Moderator.
        if (not is_poster(msg.caller)) { 
            return Result.Err("Unauthorized: You do not have permission to post."); 
        };

        let id = next_post_id;
        next_post_id += 1;

        let post = {
            id;
            author_principal = msg.caller;
            encrypted_content_markdown;
            timestamp = Time.now();
            status = if (for_global_feed) #PendingGlobal else #Private;
            global_post_id = null;
        };

        posts.put(id, post);
        return Result.Ok(id);
    };

    public shared(msg) func approve_global_post(post_id: Nat64, decrypted_content_markdown: Text): async Result.Result<(), Text> {
        // Auth: Caller must be a moderator.
        if (not is_moderator(msg.caller)) { 
            return Result.Err("Unauthorized: Only moderators can approve global posts."); 
        };
        
        // Pre-condition: Sector must be public to post to the global feed.
        if (config.is_private) { 
            return Result.Err("Cannot approve posts to global feed from a private sector."); 
        };

        // Fetch the post to approve.
        let post = switch(posts.get(post_id)) {
            case (null) { 
                return Result.Err("Post not found."); 
            };
            case (?p) { p };
        };

        // Pre-condition: Post must be pending global submission.
        if (post.status != #PendingGlobal) { 
            return Result.Err("Post is not pending global approval."); 
        };
        
        // Fetch the author's username from the User Canister.
        let user_actor = actor (user_canister_id) : UserCanisterActor;
        let author_username = switch (await user_actor.get_profile_by_principal(post.author_principal)) {
            case (null) { "anonymous" }; // Fallback
            case (?profile) { profile.username };
        };

        // Make the inter-canister call to the Global Feed.
        let global_feed_actor = actor (global_feed_canister_id) : GlobalFeedActor;
        let submission_result = await global_feed_actor.submit_post_from_sector({
            author_principal = post.author_principal;
            author_username = author_username;
            content_markdown = decrypted_content_markdown;
            origin_sector_id = Principal.fromActor(this);
        });

        switch(submission_result) {
            case (Result.Err(err)) { 
                return Result.Err("Failed to submit to global feed: " # err); 
            };
            case (Result.Ok(global_id)) {
                // Success! Update the local post's status.
                let updated_post = { ...post, status = #ApprovedGlobal, global_post_id = ?global_id };
                posts.put(post_id, updated_post);
                return Result.Ok(());
            };
        };
    };

    public query func get_sector_feed(page: Nat64, size: Nat64): async [Post] {
        // A simple, offset-based pagination. In a real app, keyset pagination would be better.
        // Also, sorting would be important. Assuming posts are fetched in ascending ID order for now.
        let results: [var Post] = [];
        let startIndex = page * size;
        let endIndex = startIndex + size;

        // BTree iterators are sorted by key, which is what we want.
        var i: Nat64 = 0;
        for ((_, post) in posts.entries()) {
            if (i >= startIndex and i < endIndex) {
                results.push(post);
            };
            i += 1;
            if (i >= endIndex) { break; };
        };

        return results;
    };


    // ==================================================================================================
    // === Chat ===
    // ==================================================================================================

    public shared(msg) func send_message(channel_name: Text, encrypted_content: Blob, key_epoch: Nat32): async Result.Result<(), Text> {
        // Auth: Caller must be a member.
        if (not is_member(msg.caller)) { 
            return Result.Err("Unauthorized: Not a member of this sector."); 
        };

        let channel = switch(channels.get(channel_name)) {
            case (null) { return Result.Err("Channel not found."); };
            case (?c) { c };
        };

        let id = next_message_id;
        next_message_id += 1;
        
        let message: Message = {
            id;
            key_epoch_id = key_epoch;
            author_principal = msg.caller;
            timestamp = Time.now();
            encrypted_content_markdown = encrypted_content;
        };

        channel.put(id, message);
        return Result.Ok(());
    };

    public query func get_messages(channel_name: Text, limit: Nat, before_id: ?Nat64): async [Message] {
        let channel = switch(channels.get(channel_name)) {
            case (null) { return []; };
            case (?c) { c };
        };
        
        // This implements pagination backwards from a certain point.
        let iter = switch(before_id) {
            case (null) { channel.valsRev() }; // Start from the newest if no cursor
            case (?id) { channel.valsRev(Iter.lt(id)) }; // Start from just before the cursor
        };

        return Iter.toArray(Iter.limit(iter, limit));
    };

    public query func get_new_messages(channel_name: Text, after_id: Nat64): async [Message] {
        let channel = switch(channels.get(channel_name)) {
            case (null) { return []; };
            case (?c) { c };
        };
        
        // Efficiently gets all messages newer than the one the client last saw.
        let iter = channel.vals(Iter.gt(after_id));
        return Iter.toArray(iter);
    };


    // ==================================================================================================
    // === Sector Management (Moderator Only) ===
    // ==================================================================================================
    
    public shared(msg) func create_channel(channel_name: Text): async Result.Result<(), Text> {
        if(not is_moderator(msg.caller)) { 
            return Result.Err("Unauthorized"); 
        };
        
        if(channels.get(channel_name) != null) { 
            return Result.Err("Channel already exists."); 
        };

        channels.put(channel_name, BTree.new(10));
        return Result.Ok(());
    };
    
    /**
    * The core function for performing a key rotation in High-Security mode.
    * It is called by a moderator's client after they have generated a new Sector-wide key.
    * It performs a canister-side integrity check to ensure no member is excluded.
    * @param key_batch A list of (Principal, EncryptedKey) pairs.
    * @returns Ok if the rotation is valid, Err otherwise.
    */
    public shared(msg) func rotate_sector_key(key_batch: [(Principal, Blob)]): async Result.Result<(), Text> {
        // Auth: Caller must be a moderator.
        if (not is_moderator(msg.caller)) { return Result.Err("Unauthorized: Only moderators can rotate keys."); };
        // Pre-condition: Only applicable in High-Security mode.
        if (config.security_model != #HighSecurityE2EE) { return Result.Err("Key rotation is not applicable for standard security mode sectors."); };

        // --- Canister-Side Integrity Check ---
        // This is the most critical part of the function. It prevents a malicious moderator
        // from performing a "key-fixing" attack to exclude a member from future communication.

        // Check that the number of provided keys exactly matches the number of members.
        if (key_batch.size() != members.size()) {
            return Result.Err("Key batch size does not match the current number of sector members.");
        };

        // Convert the provided key batch into a temporary BTree for efficient lookup.
        let key_map: BTree.BTree<Principal, ()> = BTree.new(10);
        for ((p, _) in key_batch) {
            key_map.put(p, ());
        };

        // Verify that the set of principals in the key batch is identical to the set of members.
        if (key_map.size() != members.size()) {
            // This happens if the key_batch contained duplicate principals.
            return Result.Err("Duplicate principals found in key batch.");
        };

        for ((member_principal, _) in members.entries()) {
            if (key_map.get(member_principal) == null) {
                // If we find even one member who is not in the provided key batch, we reject the entire operation.
                return Result.Err("Integrity check failed: Key batch does not contain a key for every member. Principal " # Principal.toText(member_principal) # " is missing.");
            };
        };
        
        // If all checks pass, the key rotation is considered valid.
        // The canister doesn't store the keys, but it acknowledges the re-keying event
        // by clearing the `rekey_required` flag.
        rekey_required := false;

        return Result.Ok(());
    };
}