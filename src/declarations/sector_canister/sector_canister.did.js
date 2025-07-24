export const idlFactory = ({ IDL }) => {
  const ChatSecurityModel = IDL.Variant({
    'HighSecurityE2EE' : IDL.Null,
    'StandardAccessControl' : IDL.Null,
  });
  const SectorConfig = IDL.Record({
    'security_model' : ChatSecurityModel,
    'owner' : IDL.Principal,
    'name' : IDL.Text,
    'description' : IDL.Text,
    'is_private' : IDL.Bool,
    'abbreviation' : IDL.Text,
  });
  const Error = IDL.Variant({
    'CallFailed' : IDL.Text,
    'NotFound' : IDL.Text,
    'ValidationError' : IDL.Text,
    'Unauthorized' : IDL.Text,
    'AlreadyExists' : IDL.Text,
    'ConfigError' : IDL.Text,
    'InvalidState' : IDL.Text,
  });
  const Result = IDL.Variant({ 'Ok' : IDL.Null, 'Err' : Error });
  const Result_1 = IDL.Variant({ 'Ok' : IDL.Text, 'Err' : Error });
  const CryptoState = IDL.Record({
    'current_key_epoch' : IDL.Nat32,
    'rekey_required' : IDL.Bool,
  });
  const Result_2 = IDL.Variant({
    'Ok' : IDL.Vec(IDL.Principal),
    'Err' : Error,
  });
  const Message = IDL.Record({
    'id' : IDL.Text,
    'encrypted_content_markdown' : IDL.Vec(IDL.Nat8),
    'author_principal' : IDL.Principal,
    'timestamp' : IDL.Nat64,
    'key_epoch_id' : IDL.Nat32,
  });
  const Result_3 = IDL.Variant({ 'Ok' : IDL.Vec(Message), 'Err' : Error });
  const SectorRole = IDL.Variant({
    'Poster' : IDL.Null,
    'Member' : IDL.Null,
    'Moderator' : IDL.Null,
  });
  const SectorDetails = IDL.Record({
    'current_key_epoch' : IDL.Nat32,
    'my_role' : SectorRole,
    'name' : IDL.Text,
    'description' : IDL.Text,
    'is_private' : IDL.Bool,
    'rekey_required' : IDL.Bool,
    'channels' : IDL.Vec(IDL.Text),
    'abbreviation' : IDL.Text,
  });
  const Result_4 = IDL.Variant({ 'Ok' : SectorDetails, 'Err' : Error });
  const PostStatus = IDL.Variant({
    'Private' : IDL.Null,
    'ApprovedGlobal' : IDL.Null,
    'PendingGlobal' : IDL.Null,
  });
  const Post = IDL.Record({
    'id' : IDL.Text,
    'status' : PostStatus,
    'encrypted_content_markdown' : IDL.Vec(IDL.Nat8),
    'author_principal' : IDL.Principal,
    'timestamp' : IDL.Nat64,
    'global_post_id' : IDL.Opt(IDL.Nat64),
  });
  return IDL.Service({
    'approve_global_post' : IDL.Func([IDL.Text, IDL.Text], [Result], []),
    'create_channel' : IDL.Func([IDL.Text], [Result], []),
    'create_invite_code' : IDL.Func([], [Result_1], []),
    'create_post' : IDL.Func([IDL.Vec(IDL.Nat8), IDL.Bool], [Result_1], []),
    'get_crypto_state' : IDL.Func([], [CryptoState], ['query']),
    'get_members' : IDL.Func([], [Result_2], ['query']),
    'get_messages' : IDL.Func(
        [IDL.Text, IDL.Nat64, IDL.Opt(IDL.Text)],
        [Result_3],
        ['query'],
      ),
    'get_my_details' : IDL.Func([], [Result_4], ['query']),
    'get_sector_feed' : IDL.Func(
        [IDL.Nat64, IDL.Nat64],
        [IDL.Vec(Post)],
        ['query'],
      ),
    'join' : IDL.Func([], [Result], []),
    'leave' : IDL.Func([], [Result], []),
    'rotate_sector_key' : IDL.Func(
        [IDL.Vec(IDL.Tuple(IDL.Principal, IDL.Vec(IDL.Nat8)))],
        [Result],
        [],
      ),
    'send_message' : IDL.Func(
        [IDL.Text, IDL.Vec(IDL.Nat8), IDL.Nat32],
        [Result_1],
        [],
      ),
    'set_sector_role' : IDL.Func([IDL.Principal, SectorRole], [Result], []),
  });
};
export const init = ({ IDL }) => {
  const ChatSecurityModel = IDL.Variant({
    'HighSecurityE2EE' : IDL.Null,
    'StandardAccessControl' : IDL.Null,
  });
  const SectorConfig = IDL.Record({
    'security_model' : ChatSecurityModel,
    'owner' : IDL.Principal,
    'name' : IDL.Text,
    'description' : IDL.Text,
    'is_private' : IDL.Bool,
    'abbreviation' : IDL.Text,
  });
  return [SectorConfig, IDL.Principal, IDL.Principal, IDL.Principal];
};
