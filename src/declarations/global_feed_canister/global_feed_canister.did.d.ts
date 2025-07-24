import type { Principal } from '@dfinity/principal';
import type { ActorMethod } from '@dfinity/agent';
import type { IDL } from '@dfinity/candid';

export interface DirectPostSubmission { 'content_markdown' : string }
export interface GlobalPost {
  'id' : bigint,
  'content_markdown' : string,
  'origin_sector_id' : [] | [Principal],
  'author_sector_role' : [] | [SectorRole],
  'author_principal' : Principal,
  'author_user_tag' : [] | [UserTag],
  'timestamp' : bigint,
  'author_username' : string,
}
export type Result = { 'Ok' : null } |
  { 'Err' : string };
export type Result_1 = { 'Ok' : bigint } |
  { 'Err' : string };
export interface SectorPostSubmission {
  'content_markdown' : string,
  'origin_sector_id' : Principal,
  'author_principal' : Principal,
  'author_username' : string,
}
export type SectorRole = { 'Poster' : null } |
  { 'Member' : null } |
  { 'Moderator' : null };
export type UserTag = { 'GlobalPoster' : null } |
  { 'User' : null } |
  { 'Admin' : null };
export interface _SERVICE {
  'add_global_poster' : ActorMethod<[Principal], Result>,
  'get_global_feed' : ActorMethod<[bigint, bigint], Array<GlobalPost>>,
  'get_vetted_sectors' : ActorMethod<[], Array<Principal>>,
  'remove_global_poster' : ActorMethod<[Principal], Result>,
  'set_governance_canister' : ActorMethod<[Principal], Result>,
  'set_sector_vetted_status' : ActorMethod<[Principal, boolean], Result>,
  'submit_direct_post' : ActorMethod<
    [DirectPostSubmission, string, UserTag],
    Result_1
  >,
  'submit_post_from_sector' : ActorMethod<[SectorPostSubmission], Result_1>,
}
export declare const idlFactory: IDL.InterfaceFactory;
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];
