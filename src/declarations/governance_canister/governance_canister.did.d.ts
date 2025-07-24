import type { Principal } from '@dfinity/principal';
import type { ActorMethod } from '@dfinity/agent';
import type { IDL } from '@dfinity/candid';

export type Result = { 'Ok' : null } |
  { 'Err' : string };
export type Result_1 = { 'Ok' : bigint } |
  { 'Err' : string };
export type Result_2 = { 'Ok' : string } |
  { 'Err' : string };
export interface Vote {
  'id' : bigint,
  'end_timestamp' : bigint,
  'target_sector' : Principal,
  'initiator' : Principal,
  'start_timestamp' : bigint,
  'voters' : Array<[Principal, VoteChoice]>,
  'votes_for' : bigint,
  'is_tallied' : boolean,
  'votes_against' : bigint,
}
export type VoteChoice = { 'For' : null } |
  { 'Against' : null };
export interface _SERVICE {
  'cast_vote' : ActorMethod<[bigint, VoteChoice], Result>,
  'get_active_votes' : ActorMethod<[], Array<Vote>>,
  'get_vote' : ActorMethod<[bigint], [] | [Vote]>,
  'initiate_censor_vote' : ActorMethod<[Principal], Result_1>,
  'tally_vote' : ActorMethod<[bigint], Result_2>,
}
export declare const idlFactory: IDL.InterfaceFactory;
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];
