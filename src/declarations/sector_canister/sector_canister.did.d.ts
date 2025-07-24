import type { Principal } from '@dfinity/principal';
import type { ActorMethod } from '@dfinity/agent';
import type { IDL } from '@dfinity/candid';

export type ChatSecurityModel = { 'HighSecurityE2EE' : null } |
  { 'StandardAccessControl' : null };
export interface CryptoState {
  'current_key_epoch' : number,
  'rekey_required' : boolean,
}
export type Error = { 'CallFailed' : string } |
  { 'NotFound' : string } |
  { 'ValidationError' : string } |
  { 'Unauthorized' : string } |
  { 'AlreadyExists' : string } |
  { 'ConfigError' : string } |
  { 'InvalidState' : string };
export interface Message {
  'id' : string,
  'encrypted_content_markdown' : Uint8Array | number[],
  'author_principal' : Principal,
  'timestamp' : bigint,
  'key_epoch_id' : number,
}
export interface Post {
  'id' : string,
  'status' : PostStatus,
  'encrypted_content_markdown' : Uint8Array | number[],
  'author_principal' : Principal,
  'timestamp' : bigint,
  'global_post_id' : [] | [bigint],
}
export type PostStatus = { 'Private' : null } |
  { 'ApprovedGlobal' : null } |
  { 'PendingGlobal' : null };
export type Result = { 'Ok' : null } |
  { 'Err' : Error };
export type Result_1 = { 'Ok' : string } |
  { 'Err' : Error };
export type Result_2 = { 'Ok' : Array<Principal> } |
  { 'Err' : Error };
export type Result_3 = { 'Ok' : Array<Message> } |
  { 'Err' : Error };
export type Result_4 = { 'Ok' : SectorDetails } |
  { 'Err' : Error };
export interface SectorConfig {
  'security_model' : ChatSecurityModel,
  'owner' : Principal,
  'name' : string,
  'description' : string,
  'is_private' : boolean,
  'abbreviation' : string,
}
export interface SectorDetails {
  'current_key_epoch' : number,
  'my_role' : SectorRole,
  'name' : string,
  'description' : string,
  'is_private' : boolean,
  'rekey_required' : boolean,
  'channels' : Array<string>,
  'abbreviation' : string,
}
export type SectorRole = { 'Poster' : null } |
  { 'Member' : null } |
  { 'Moderator' : null };
export interface _SERVICE {
  'approve_global_post' : ActorMethod<[string, string], Result>,
  'create_channel' : ActorMethod<[string], Result>,
  'create_invite_code' : ActorMethod<[], Result_1>,
  'create_post' : ActorMethod<[Uint8Array | number[], boolean], Result_1>,
  'get_crypto_state' : ActorMethod<[], CryptoState>,
  'get_members' : ActorMethod<[], Result_2>,
  'get_messages' : ActorMethod<[string, bigint, [] | [string]], Result_3>,
  'get_my_details' : ActorMethod<[], Result_4>,
  'get_sector_feed' : ActorMethod<[bigint, bigint], Array<Post>>,
  'join' : ActorMethod<[], Result>,
  'leave' : ActorMethod<[], Result>,
  'rotate_sector_key' : ActorMethod<
    [Array<[Principal, Uint8Array | number[]]>],
    Result
  >,
  'send_message' : ActorMethod<
    [string, Uint8Array | number[], number],
    Result_1
  >,
  'set_sector_role' : ActorMethod<[Principal, SectorRole], Result>,
}
export declare const idlFactory: IDL.InterfaceFactory;
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];
