export const idlFactory = ({ IDL }) => {
  const Result = IDL.Variant({ 'Ok' : IDL.Null, 'Err' : IDL.Text });
  const SectorRole = IDL.Variant({
    'Poster' : IDL.Null,
    'Member' : IDL.Null,
    'Official' : IDL.Null,
    'Moderator' : IDL.Null,
  });
  const UserTag = IDL.Variant({
    'GlobalPoster' : IDL.Null,
    'User' : IDL.Null,
    'Admin' : IDL.Null,
  });
  const GlobalPost = IDL.Record({
    'id' : IDL.Nat64,
    'content_markdown' : IDL.Text,
    'origin_sector_id' : IDL.Opt(IDL.Principal),
    'author_sector_role' : IDL.Opt(SectorRole),
    'author_principal' : IDL.Principal,
    'author_user_tag' : IDL.Opt(UserTag),
    'timestamp' : IDL.Nat64,
    'author_username' : IDL.Text,
  });
  const DirectPostSubmission = IDL.Record({ 'content_markdown' : IDL.Text });
  const Result_1 = IDL.Variant({ 'Ok' : IDL.Nat64, 'Err' : IDL.Text });
  const SectorPostSubmission = IDL.Record({
    'content_markdown' : IDL.Text,
    'origin_sector_id' : IDL.Principal,
    'author_principal' : IDL.Principal,
    'author_username' : IDL.Text,
  });
  return IDL.Service({
    'add_global_poster' : IDL.Func([IDL.Principal], [Result], []),
    'get_global_feed' : IDL.Func(
        [IDL.Nat64, IDL.Nat64],
        [IDL.Vec(GlobalPost)],
        ['query'],
      ),
    'get_vetted_sectors' : IDL.Func([], [IDL.Vec(IDL.Principal)], ['query']),
    'remove_global_poster' : IDL.Func([IDL.Principal], [Result], []),
    'set_governance_canister' : IDL.Func([IDL.Principal], [Result], []),
    'set_sector_vetted_status' : IDL.Func(
        [IDL.Principal, IDL.Bool],
        [Result],
        [],
      ),
    'submit_direct_post' : IDL.Func(
        [DirectPostSubmission, IDL.Text, UserTag],
        [Result_1],
        [],
      ),
    'submit_post_from_sector' : IDL.Func(
        [SectorPostSubmission],
        [Result_1],
        [],
      ),
  });
};
export const init = ({ IDL }) => { return [IDL.Principal]; };
