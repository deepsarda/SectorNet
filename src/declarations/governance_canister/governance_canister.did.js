export const idlFactory = ({ IDL }) => {
  const VoteChoice = IDL.Variant({ 'For' : IDL.Null, 'Against' : IDL.Null });
  const Result = IDL.Variant({ 'Ok' : IDL.Null, 'Err' : IDL.Text });
  const Vote = IDL.Record({
    'id' : IDL.Nat64,
    'end_timestamp' : IDL.Nat64,
    'target_sector' : IDL.Principal,
    'initiator' : IDL.Principal,
    'start_timestamp' : IDL.Nat64,
    'voters' : IDL.Vec(IDL.Tuple(IDL.Principal, VoteChoice)),
    'votes_for' : IDL.Nat64,
    'is_tallied' : IDL.Bool,
    'votes_against' : IDL.Nat64,
  });
  const Result_1 = IDL.Variant({ 'Ok' : IDL.Nat64, 'Err' : IDL.Text });
  const Result_2 = IDL.Variant({ 'Ok' : IDL.Text, 'Err' : IDL.Text });
  return IDL.Service({
    'cast_vote' : IDL.Func([IDL.Nat64, VoteChoice], [Result], []),
    'get_active_votes' : IDL.Func([], [IDL.Vec(Vote)], ['query']),
    'get_vote' : IDL.Func([IDL.Nat64], [IDL.Opt(Vote)], ['query']),
    'initiate_censor_vote' : IDL.Func([IDL.Principal], [Result_1], []),
    'tally_vote' : IDL.Func([IDL.Nat64], [Result_2], []),
  });
};
export const init = ({ IDL }) => {
  return [IDL.Principal, IDL.Principal, IDL.Principal];
};
