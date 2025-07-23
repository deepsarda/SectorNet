import Principal "mo:base/Principal";
import Result "mo:base/Result";
import Time "mo:base/Time";
import BTree "mo:stableheapbtreemap/BTree";
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
    
    // The data structure returned to a client asking for sector details.
    public type SectorDetails = {
        name: Text;
        description: Text;
        abbreviation: Text;
        is_private: Bool;
        my_role: SectorRole;
        channels: [Text];
        rekey_required: Bool;
        current_key_epoch: Nat32; 
    };

    public type CryptoState = {
        rekey_required: Bool;
        current_key_epoch: Nat32;
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
    type InviteCanisterActor = actor {
        register_code: (Text) -> async Result.Result<(), Text>;
    };
    type GlobalFeedActor = actor {
        submit_post_from_sector: (record {
            author_principal: Principal;
            author_username: Text;
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
    stable var rekey_required: Bool = false;
    stable var invite_canister_id: Principal;
    stable var global_feed_canister_id: Principal;
    stable var user_canister_id: Principal;
    stable var current_key_epoch: Nat32 = 1;

    let HIGH_SECURITY_MEMBER_LIMIT: Nat = 50;


    // ==================================================================================================
    // === Initialization ===
    // ==================================================================================================

    public init(initial_config: SectorConfig, invite_id: Principal, global_feed_id: Principal, user_id: Principal) {
        config := initial_config;
        current_key_epoch := 1;
        invite_canister_id := invite_id;
        global_feed_canister_id := global_feed_id;
        user_canister_id := user_id;
        members.put(config.owner, #Moderator);
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
    // === Public Query Calls ===
    // ==================================================================================================
    
    // Returns details about the sector, but ONLY to a member.
    public query ({ caller }) func get_my_details(): async ?SectorDetails {
        
        let role = switch (get_role(caller)) {
            case (null) { return null; }; // Not a member, return nothing.
            case (?r) { r };
        };

        let channel_names = Iter.toArray(channels.keys());
        
        let details : SectorDetails = {
            name = config.name;
            description = config.description;
            abbreviation = config.abbreviation;
            is_private = config.is_private;
            my_role = role;
            channels = channel_names;
            rekey_required = rekey_required;
            current_key_epoch = current_key_epoch; 
        };

        return ?details;
    };

    public query func get_crypto_state(): async CryptoState {
        return { rekey_required = rekey_required; current_key_epoch = current_key_epoch; };
    };
    


    // ==================================================================================================
    // === Membership & Roles ===
    // ==================================================================================================

    public shared(msg) func join(): async Result.Result<(), Text> {
        if (config.is_private) { return Result.Err("This is a private sector. Use an invite code to join."); };
        
        let caller = msg.caller;
        if (is_member(caller)) { return Result.Err("Already a member."); };

        if (config.security_model == #HighSecurityE2EE) {
            if (members.size() >= HIGH_SECURITY_MEMBER_LIMIT) {
                return Result.Err("Sector is at its maximum capacity for high-security mode.");
            }
        };

        members.put(caller, #Member);
        return Result.Ok(());
    };

    public shared(msg) func join_with_invite(): async Result.Result<(), Text> {
        if (not config.is_private) { return Result.Err("This is a public sector."); };

        let caller = msg.caller;
        if (is_member(caller)) { return Result.Err("Already a member."); };

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
        if (not is_member(caller)) { return Result.Err("Not a member of this sector."); };

        members.delete(caller);

        if (config.security_model == #HighSecurityE2EE) {
            rekey_required := true;
        };

        return Result.Ok(());
    };

    public shared(msg) func set_sector_role(target_user: Principal, new_role: SectorRole): async Result.Result<(), Text> {
        if (not is_moderator(msg.caller)) { return Result.Err("Unauthorized: Only moderators can set roles."); };
        if (target_user == config.owner) { return Result.Err("The sector owner's role cannot be changed."); };
        if (target_user == msg.caller) { return Result.Err("Moderators cannot change their own role."); };
        if (not is_member(target_user)) { return Result.Err("Target user is not a member of this sector."); };
        members.put(target_user, new_role);
        return Result.Ok(());
    };

    public shared(msg) func create_invite_code(): async Result.Result<Text, Text> {
        if (not is_moderator(msg.caller)) { return Result.Err("Unauthorized: Only moderators can create invites."); };
        if (not config.is_private) { return Result.Err("Cannot create invites for a public sector."); };

        let random_bytes = await Random.blob();
        let code = Text.toText(Blob.encodeHex(random_bytes.slice(0, 4)));

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
        if (not is_poster(msg.caller)) { return Result.Err("Unauthorized: You do not have permission to post."); };

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
        if (not is_moderator(msg.caller)) { return Result.Err("Unauthorized: Only moderators can approve global posts."); };
        if (config.is_private) { return Result.Err("Cannot approve posts to global feed from a private sector."); };

        let post = switch(posts.get(post_id)) {
            case (null) { return Result.Err("Post not found."); };
            case (?p) { p };
        };

        if (post.status != #PendingGlobal) { return Result.Err("Post is not pending global approval."); };
        
        let user_actor = actor (user_canister_id) : UserCanisterActor;
        let author_username = switch (await user_actor.get_profile_by_principal(post.author_principal)) {
            case (null) { "anonymous" };
            case (?profile) { profile.username };
        };

        let global_feed_actor = actor (global_feed_canister_id) : GlobalFeedActor;
        let submission_result = await global_feed_actor.submit_post_from_sector({
            author_principal = post.author_principal;
            author_username = author_username;
            content_markdown = decrypted_content_markdown;
            origin_sector_id = Principal.fromActor(this);
        });

        switch(submission_result) {
            case (Result.Err(err)) { return Result.Err("Failed to submit to global feed: " # err); };
            case (Result.Ok(global_id)) {
                let updated_post = { ...post, status = #ApprovedGlobal, global_post_id = ?global_id };
                posts.put(post_id, updated_post);
                return Result.Ok(());
            };
        };
    };

    public query func get_sector_feed(page: Nat64, size: Nat64): async [Post] {
        let results: [var Post] = [];
        let startIndex = page * size;
        let endIndex = startIndex + size;

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
        if (not is_member(msg.caller)) { return Result.Err("Unauthorized: Not a member of this sector."); };

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
        
        let iter = switch(before_id) {
            case (null) { channel.valsRev() };
            case (?id) { channel.valsRev(Iter.lt(id)) };
        };

        return Iter.toArray(Iter.limit(iter, limit));
    };

    public query func get_new_messages(channel_name: Text, after_id: Nat64): async [Message] {
        let channel = switch(channels.get(channel_name)) {
            case (null) { return []; };
            case (?c) { c };
        };
        
        let iter = channel.vals(Iter.gt(after_id));
        return Iter.toArray(iter);
    };


    // ==================================================================================================
    // === Sector Management (Moderator Only) ===
    // ==================================================================================================
    // function to get member list for re-keying
    public query({ caller }) func get_members(): async ?[Principal] {
        if (!is_moderator(caller)) { return null; };
        return ?Iter.toArray(members.keys());
    };

    public shared(msg) func create_channel(channel_name: Text): async Result.Result<(), Text> {
        if(not is_moderator(msg.caller)) { return Result.Err("Unauthorized"); };
        if(channels.get(channel_name) != null) { return Result.Err("Channel already exists."); };
        channels.put(channel_name, BTree.new(10));
        return Result.Ok(());
    };
    
    public shared(msg) func rotate_sector_key(key_batch: [(Principal, Blob)]): async Result.Result<(), Text> {
        if (not is_moderator(msg.caller)) { return Result.Err("Unauthorized: Only moderators can rotate keys."); };
        if (config.security_model != #HighSecurityE2EE) { return Result.Err("Key rotation is not applicable for standard security mode sectors."); };

        if (key_batch.size() != members.size()) {
            return Result.Err("Key batch size does not match the current number of sector members.");
        };

        let key_map: BTree.BTree<Principal, ()> = BTree.new(10);
        for ((p, _) in key_batch) {
            key_map.put(p, ());
        };

        if (key_map.size() != members.size()) {
            return Result.Err("Duplicate principals found in key batch.");
        };

        for ((member_principal, _) in members.entries()) {
            if (key_map.get(member_principal) == null) {
                return Result.Err("Integrity check failed: Key batch does not contain a key for every member. Principal " # Principal.toText(member_principal) # " is missing.");
            };
        };

        // --- SUCCESS ---
        rekey_required := false;
        current_key_epoch += 1; 
        
        return Result.Ok(());
    };
}
