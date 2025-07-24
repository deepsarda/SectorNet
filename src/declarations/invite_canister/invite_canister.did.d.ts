import type { Principal } from '@dfinity/principal';
import type { ActorMethod } from '@dfinity/agent';
import type { IDL } from '@dfinity/candid';

export type Result = { 'Ok' : null } |
  { 'Err' : string };
export interface _SERVICE {
  'register_code' : ActorMethod<[string], Result>,
  'register_new_private_sector' : ActorMethod<[Principal], undefined>,
  'resolve_code' : ActorMethod<[string], [] | [Principal]>,
  'revoke_code' : ActorMethod<[string], Result>,
  'set_factory_canister' : ActorMethod<[Principal], Result>,
}
export declare const idlFactory: IDL.InterfaceFactory;
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];
