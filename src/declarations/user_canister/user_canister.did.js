export const idlFactory = ({ IDL }) => {
  const Error = IDL.Variant({
    'InvalidInput' : IDL.Text,
    'NotFound' : IDL.Null,
    'Unauthorized' : IDL.Null,
    'AlreadyExists' : IDL.Text,
  });
  const Result = IDL.Variant({ 'Ok' : IDL.Null, 'Err' : Error });
  const UserTag = IDL.Variant({
    'GlobalPoster' : IDL.Null,
    'User' : IDL.Null,
    'Admin' : IDL.Null,
  });
  const Profile = IDL.Record({
    'joined_sectors' : IDL.Vec(IDL.Principal),
    'username' : IDL.Text,
    'public_key' : IDL.Vec(IDL.Nat8),
    'owner' : IDL.Principal,
    'tags' : IDL.Vec(UserTag),
    'created_at' : IDL.Nat64,
    'last_seen_timestamp' : IDL.Nat64,
  });
  return IDL.Service({
    'add_admin' : IDL.Func([IDL.Principal], [Result], []),
    'add_joined_sector' : IDL.Func([IDL.Principal], [Result], []),
    'create_profile' : IDL.Func([IDL.Text, IDL.Vec(IDL.Nat8)], [Result], []),
    'get_admins' : IDL.Func([], [IDL.Vec(IDL.Principal)], ['query']),
    'get_profile_by_principal' : IDL.Func(
        [IDL.Principal],
        [IDL.Opt(Profile)],
        ['query'],
      ),
    'get_profile_by_username' : IDL.Func(
        [IDL.Text],
        [IDL.Opt(Profile)],
        ['query'],
      ),
    'profile_exists' : IDL.Func([IDL.Principal], [IDL.Bool], ['query']),
    'remove_joined_sector' : IDL.Func([IDL.Principal], [Result], []),
    'set_user_tag' : IDL.Func([IDL.Principal, UserTag], [Result], []),
    'update_activity' : IDL.Func([], [Result], []),
  });
};
export const init = ({ IDL }) => { return [IDL.Principal]; };
