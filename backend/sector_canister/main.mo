import Principal "mo:base/Principal";
import Result "mo:base/Result";
import Time "mo:base/Time";
import Nat "mo:base/Nat";
import Nat32 "mo:base/Nat32";
import Nat64 "mo:base/Nat64";
import Text "mo:base/Text";
import Blob "mo:base/Blob";
import Iter "mo:base/Iter";
import Random "mo:base/Random";
import Array "mo:base/Array";
import Buffer "mo:base/Buffer";

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

    // --- Custom Types for Array-based State ---
    private type Member = {
        principal: Principal;
        role: SectorRole;
    };

    private type Channel = {
        name: Text;
        messages: [var Message];
    };

    // --- Actor Interfaces for Inter-Canister Calls ---
    type InviteCanisterActor = actor {
        register_code: (Text) -> async Result.Result<(), Text>;
    };
    type GlobalFeedActor = actor {
        submit_post_from_sector: ( {
            author_principal: Principal;
            author_username: Text;
            content_markdown: Text;
            origin_sector_id: Principal;
        }) -> async Result.Result<Nat64, Text>;
    };
    type UserCanisterActor = actor {
        get_profile_by_principal: (Principal) -> async ?{ username: Text; };
    };

    // --- Stable State ---
    stable var config: ?SectorConfig = null;
    stable var members: [var Member] = [var];
    stable var posts: [var Post] = [var];
    stable var channels: [var Channel] = [var];
    stable var next_post_id: Nat64 = 0;
    stable var next_message_id: Nat64 = 0;
    stable var rekey_required: Bool = false;
    stable var invite_canister_id: ?Principal = null;
    stable var global_feed_canister_id: ?Principal = null;
    stable var user_canister_id: ?Principal = null;
    stable var current_key_epoch: Nat32 = 1;

    let HIGH_SECURITY_MEMBER_LIMIT: Nat = 50;


    // ==================================================================================================
    // === Initialization ===
    // ==================================================================================================

    public func init(initial_config: SectorConfig, invite_id: Principal, global_feed_id: Principal, user_id: Principal) {
        config := ?initial_config;
        current_key_epoch := 1;
        invite_canister_id := ?invite_id;
        global_feed_canister_id := ?global_feed_id;
        user_canister_id := ?user_id;
        members.add({ principal = initial_config.owner; role = #Moderator });
        channels.add({ name = "general"; messages = [var] });
    };

    // ==================================================================================================
    // === Authorization Helper Queries ===
    // ==================================================================================================

    private query func is_member(p: Principal): async Bool {
        for (member in members.vals()) {
            if (member.principal == p) {
                return true;
            };
        };
        return false;
    };

    private query func get_role(p: Principal): async ?SectorRole {
        for (member in members.vals()) {
            if (member.principal == p) {
                return ?member.role;
            };
        };
        return null;
    };

    private query func is_moderator(p: Principal): async Bool {
        switch (await get_role(p)) {
            case (?#Moderator) { true };
            case _ { false };
        }
    };

    private query func is_poster(p: Principal): async Bool {
        switch (await get_role(p)) {
            case (?#Moderator) { true };
            case (?#Poster) { true };
            case _ { false };
        }
    };

    
    // ==================================================================================================
    // === Public Query Calls ===
    // ==================================================================================================
    
    public query ({ caller }) func get_my_details(): async ?SectorDetails {
        let current_config = switch(config) {
            case (?c) { c }
            case (null) { return null; }
        };

        var foundRole : ?SectorRole = null;
        label search for (member in members.vals()) {
            if (member.principal == caller) {
                foundRole := ?member.role;
                break search;
            };
        };
        let role = switch (foundRole) {
            case (null) { return null; };
            case (?r) { r };
        };

        let channel_names = Array.map<Channel, Text>(Array.freeze(channels), func(channel) { channel.name });
        
        let details : SectorDetails = {
            name = current_config.name;
            description = current_config.description;
            abbreviation = current_config.abbreviation;
            is_private = current_config.is_private;
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
        let current_config = switch(config) {
            case (?c) { c }
            case (null) { return #err("Sector not initialized."); }
        };
        if (current_config.is_private) { return #err("This is a private sector. Use an invite code to join."); };
        
        let caller = msg.caller;
        if (await is_member(caller)) { return #err("Already a member."); };

        if (current_config.security_model == #HighSecurityE2EE) {
            if (members.size() >= HIGH_SECURITY_MEMBER_LIMIT) {
                return #err("Sector is at its maximum capacity for high-security mode.");
            }
        };

        members.add({ principal = caller; role = #Member });
        return #ok(());
    };

    public shared(msg) func join_with_invite(): async Result.Result<(), Text> {
        let current_config = switch(config) {
            case (?c) { c }
            case (null) { return #err("Sector not initialized."); }
        };
        if (not current_config.is_private) { return #err("This is a public sector."); };

        let caller = msg.caller;
        if (await is_member(caller)) { return #err("Already a member."); };

        if (current_config.security_model == #HighSecurityE2EE) {
            if (members.size() >= HIGH_SECURITY_MEMBER_LIMIT) {
                return #err("Sector is at its maximum capacity for high-security mode.");
            }
        };

        members.add({ principal = caller; role = #Member });
        return #ok(());
    };

    public shared(msg) func leave() : async Result.Result<(), Text> {
        let current_config = switch(config) {
            case (?c) { c }
            case (null) { return #err("Sector not initialized."); }
        };
        let caller = msg.caller;
        if (not (await is_member(caller))) {
            return #err("Not a member of this sector.");
        };
        
        var index_to_remove : ?Nat = null;
        label search for (i in members.keys()) {
            if (members.get(i)!.principal == caller) {
                index_to_remove := ?i;
                break search;
            };
        };

        switch (index_to_remove) {
            case (?i) {
                ignore members.remove(i);
                if (current_config.security_model == #HighSecurityE2EE) {
                    rekey_required := true;
                };
                return #ok(());
            }
            case null {
                return #err("Failed to find member to remove."); // Should be unreachable
            };
        };
    };

    public shared(msg) func set_sector_role(target_user: Principal, new_role: SectorRole) : async Result.Result<(), Text> {
        let current_config = switch(config) {
            case (?c) { c }
            case (null) { return #err("Sector not initialized."); }
        };
        if (not (await is_moderator(msg.caller))) {
            return #err("Unauthorized: Only moderators can set roles.");
        };
        if (target_user == current_config.owner) {
            return #err("The sector owner's role cannot be changed.");
        };
        if (target_user == msg.caller) {
            return #err("Moderators cannot change their own role.");
        };
        if (not (await is_member(target_user))) {
            return #err("Target user is not a member of this sector.");
        };

        label update for (i in members.keys()) {
            if (members.get(i)!.principal == target_user) {
                members.put(i, { principal = target_user; role = new_role });
                break update;
            };
        };

        return #ok(());
    };

    public shared(msg) func create_invite_code() : async Result.Result<Text, Text> {
        let current_config = switch(config) {
            case (?c) { c }
            case (null) { return #err("Sector not initialized."); }
        };
        let inv_can_id = switch(invite_canister_id) {
            case (?id) { id }
            case (null) { return #err("Invite canister not configured."); }
        };

        if (not (await is_moderator(msg.caller))) {
            return #err("Unauthorized: Only moderators can create invites.");
        };
        if (not current_config.is_private) {
            return #err("Cannot create invites for a public sector.");
        };

        let random_bytes = await Random.blob();
        let code = Text.encodeUtf8(Blob.toHex(random_bytes.slice(0, 4)));

        let invite_actor = actor(inv_can_id) : InviteCanisterActor;
        await invite_actor.register_code(code);
    };

    // ==================================================================================================
    // === Sector Feed ===
    // ==================================================================================================

    public shared(msg) func create_post(encrypted_content_markdown: Blob, for_global_feed: Bool) : async Result.Result<Nat64, Text> {
        if (not (await is_poster(msg.caller))) {
            return #err("Unauthorized: You do not have permission to post.");
        };

        let id = next_post_id;
        next_post_id += 1;

        let post: Post = {
            id = id;
            author_principal = msg.caller;
            encrypted_content_markdown = encrypted_content_markdown;
            timestamp = Time.now();
            status = if (for_global_feed) #PendingGlobal else #Private;
            global_post_id = null;
        };
        
        posts.add(post);
        return #ok(id);
    };

    public shared(msg) func approve_global_post(post_id: Nat64, decrypted_content_markdown: Text) : async Result.Result<(), Text> {
        let current_config = switch(config) {
            case (?c) { c }
            case (null) { return #err("Sector not initialized."); }
        };
        let usr_can_id = switch(user_canister_id) {
            case (?id) { id }
            case (null) { return #err("User canister not configured."); }
        };
        let feed_can_id = switch(global_feed_canister_id) {
            case (?id) { id }
            case (null) { return #err("Global feed canister not configured."); }
        };

        if (not (await is_moderator(msg.caller))) {
            return #err("Unauthorized: Only moderators can approve global posts.");
        };
        if (current_config.is_private) {
            return #err("Cannot approve posts to global feed from a private sector.");
        };

        var post_index : ?Nat = null;
        label search for (i in posts.keys()) {
            if (posts.get(i)!.id == post_id) {
                post_index := ?i;
                break search;
            };
        };

        let index = switch(post_index) {
            case (null) { return #err("Post not found."); };
            case (?i) { i; };
        };
        
        let post = switch (posts.get(index)) {
            case (null) { return #err("Post not found."); }; // Should be unreachable
            case (?p) { p; };
        };

        if (post.status != #PendingGlobal) {
            return #err("Post is not pending global approval.");
        };

        let user_actor = actor(usr_can_id) : UserCanisterActor;
        let author_username = switch (await user_actor.get_profile_by_principal(post.author_principal)) {
            case (null) { "anonymous" };
            case (?profile) { profile.username };
        };

        let global_feed_actor = actor(feed_can_id) : GlobalFeedActor;
        let submission_result = await global_feed_actor.submit_post_from_sector({
            author_principal = post.author_principal;
            author_username = author_username;
            content_markdown = decrypted_content_markdown;
            origin_sector_id = Principal.fromActor(this);
        });

        switch(submission_result) {
            case (#err(err)) {
                return #err("Failed to submit to global feed: " # err);
            };
            case (#ok(global_id)) {
                let updated_post = {
                  post with
                    status = #ApprovedGlobal;
                    global_post_id = ?global_id;
                };
                posts.put(index, updated_post);
                return #ok(());
            };
        };
    };

    public query func get_sector_feed(page: Nat64, size: Nat64): async [Post] {
        let results = Buffer.Buffer<Post>(Nat.fromNat64(size));
        let startIndex = page * size;
        let endIndex = startIndex + size;
        let post_count = Nat.fromNat64(posts.size());

        if (startIndex >= Nat.fromNat64(post_count)) {
            return [];
        };

        var i: Nat64 = 0;
        for (post in posts.vals()) {
            if (i >= startIndex and i < endIndex) {
                results.add(post);
            };
            i += 1;
            if (i >= endIndex) { 
                break; 
            };
        };

      return Array.freeze(results);
    };

    // ==================================================================================================
    // === Chat ===
    // ==================================================================================================

    public shared(msg) func send_message(channel_name: Text, encrypted_content: Blob, key_epoch: Nat32): async Result.Result<(), Text> {
        if (not (await is_member(msg.caller))) { 
          return #err("Unauthorized: Not a member of this sector."); 
        };

        var channel_opt : ?Channel = null;
        for(c in channels.vals()) {
            if (c.name == channel_name) {
                channel_opt := ?c;
                break;
            }
        };
        
        let channel = switch(channel_opt) {
            case(null) { return #err("Channel not found."); };
            case(?c) { c };
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

        channel.messages.add(message);
        return #ok(());
    };

    private query func find_channel(channel_name: Text): ?Channel {
        for (channel in channels.vals()) {
            if (channel.name == channel_name) {
                return ?channel;
            }
        }
        return null;
    }

    public query func get_messages(channel_name: Text, limit: Nat, before_id: ?Nat64): async [Message] {
        let channel = switch(find_channel(channel_name)) {
            case(null) { return []; };
            case(?c) { c };
        };
        
        var results = Buffer.Buffer<Message>(limit);
        let iter = Iter.rev(channel.messages.vals());

        for (message in iter) {
            if (results.size() >= limit) { break; };

            switch (before_id) {
                case (null) { results.add(message); };
                case (?id) {
                    if (message.id < id) {
                        results.add(message);
                    };
                };
            };
        };

        return Array.freeze(results);
    };

    public query func get_new_messages(channel_name: Text, after_id: Nat64): async [Message] {
        let channel = switch(find_channel(channel_name)) {
            case(null) { return []; };
            case(?c) { c };
        };
        
        var results = Buffer.Buffer<Message>(0);
        for(message in channel.messages.vals()) {
            if(message.id > after_id) {
                results.add(message);
            };
        };
        
        return Array.freeze(results);
    };


    // ==================================================================================================
    // === Sector Management (Moderator Only) ===
    // ==================================================================================================
    
    public query({ caller }) func get_members(): async ?[Principal] {
        if (not (await is_moderator(caller))) { 
          return null; 
        };
        return ?Array.map<Member, Principal>(Array.freeze(members), func(member) { member.principal });
    };

    public shared(msg) func create_channel(channel_name: Text): async Result.Result<(), Text> {
        if(not (await is_moderator(msg.caller))) { 
          return #err("Unauthorized"); 
        };
        
        for(channel in channels.vals()) {
            if(channel.name == channel_name) {
                return #err("Channel already exists.");
            };
        };

        channels.add({ name = channel_name; messages = [var] });
        return #ok(());
    };
    
    public shared(msg) func rotate_sector_key(key_batch: [(Principal, Blob)]): async Result.Result<(), Text> {
        let current_config = switch(config) {
            case (?c) { c }
            case (null) { return #err("Sector not initialized."); }
        };

        if (not (await is_moderator(msg.caller))) { 
          return #err("Unauthorized: Only moderators can rotate keys."); 
        };
        if (current_config.security_model != #HighSecurityE2EE) { return #err("Key rotation is not applicable for standard security mode sectors."); };

        if (key_batch.size() != members.size()) {
            return #err("Key batch size does not match the current number of sector members.");
        };

        var key_map = Buffer.Buffer<Principal>(key_batch.size());
        for ((p, _) in key_batch) {
            for(existing_p in key_map.vals()) {
                if(existing_p == p) {
                     return #err("Duplicate principals found in key batch.");
                }
            }
            key_map.add(p);
        };
        
        for (member in members.vals()) {
            var found = false;
            for(p in key_map.vals()) {
                if (member.principal == p) {
                    found := true;
                    break;
                }
            }
            if(not found) {
                return #err("A key for an existing member is missing from the batch.");
            }
        }

        rekey_required := false;
        current_key_epoch += 1; 

        return #ok(());
    };
}