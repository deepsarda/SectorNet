import type { Principal } from '@dfinity/principal';
import type { ActorMethod } from '@dfinity/agent';
import type { IDL } from '@dfinity/candid';

export type Error = { 'AlreadyRegistered' : null } |
  { 'NotFound' : null } |
  { 'Unauthorized' : null };
export type Result = { 'Ok' : null } |
  { 'Err' : Error };
export interface SectorInfo {
  'id' : Principal,
  'is_vetted' : boolean,
  'name' : string,
  'description' : string,
  'abbreviation' : string,
  'member_count' : bigint,
}
export interface _SERVICE {
  'get_vetted_sectors' : ActorMethod<[], Array<SectorInfo>>,
  'register_sector' : ActorMethod<[SectorInfo], Result>,
  'search_sectors' : ActorMethod<[string], Array<SectorInfo>>,
  'set_factory_canister' : ActorMethod<[Principal], Result>,
  'set_sector_vetted_status' : ActorMethod<[Principal, boolean], Result>,
  'update_sector_listing' : ActorMethod<[SectorInfo], Result>,
}
export declare const idlFactory: IDL.InterfaceFactory;
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];
