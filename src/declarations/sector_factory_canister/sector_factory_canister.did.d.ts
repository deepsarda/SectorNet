import type { Principal } from '@dfinity/principal';
import type { ActorMethod } from '@dfinity/agent';
import type { IDL } from '@dfinity/candid';

export type ChatSecurityModel = { 'HighSecurityE2EE' : null } |
  { 'StandardAccessControl' : null };
export type Error = { 'CallFailed' : string } |
  { 'CreationFailed' : string } |
  { 'Unauthorized' : null } |
  { 'RateLimitExceeded' : null } |
  { 'ConfigError' : string } |
  { 'InstallFailed' : string };
export type Result = { 'Ok' : Principal } |
  { 'Err' : Error };
export type Result_1 = { 'Ok' : null } |
  { 'Err' : Error };
export interface SectorConfig {
  'security_model' : ChatSecurityModel,
  'owner' : Principal,
  'name' : string,
  'description' : string,
  'is_private' : boolean,
  'abbreviation' : string,
}
export interface _SERVICE {
  'create_new_sector' : ActorMethod<[SectorConfig], Result>,
  'set_invite_canister' : ActorMethod<[Principal], Result_1>,
  'set_registry_canister' : ActorMethod<[Principal], Result_1>,
  'set_sector_wasm' : ActorMethod<[Uint8Array | number[]], Result_1>,
}
export declare const idlFactory: IDL.InterfaceFactory;
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];
