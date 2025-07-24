import type { Principal } from '@dfinity/principal';
import type { ActorMethod } from '@dfinity/agent';
import type { IDL } from '@dfinity/candid';

export type Error = { 'InvalidInput' : string } |
  { 'NotFound' : null } |
  { 'Unauthorized' : null } |
  { 'AlreadyExists' : string };
export interface Profile {
  'joined_sectors' : Array<Principal>,
  'username' : string,
  'public_key' : Uint8Array | number[],
  'owner' : Principal,
  'tags' : Array<UserTag>,
  'created_at' : bigint,
  'last_seen_timestamp' : bigint,
}
export type Result = { 'Ok' : null } |
  { 'Err' : Error };
export type UserTag = { 'GlobalPoster' : null } |
  { 'User' : null } |
  { 'Admin' : null };
export interface _SERVICE {
  'add_admin' : ActorMethod<[Principal], Result>,
  'add_joined_sector' : ActorMethod<[Principal], Result>,
  'create_profile' : ActorMethod<[string, Uint8Array | number[]], Result>,
  'get_admins' : ActorMethod<[], Array<Principal>>,
  'get_profile_by_principal' : ActorMethod<[Principal], [] | [Profile]>,
  'get_profile_by_username' : ActorMethod<[string], [] | [Profile]>,
  'profile_exists' : ActorMethod<[Principal], boolean>,
  'remove_joined_sector' : ActorMethod<[Principal], Result>,
  'set_user_tag' : ActorMethod<[Principal, UserTag], Result>,
  'update_activity' : ActorMethod<[], Result>,
}
export declare const idlFactory: IDL.InterfaceFactory;
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];
