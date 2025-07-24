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
    'CreationFailed' : IDL.Text,
    'Unauthorized' : IDL.Null,
    'RateLimitExceeded' : IDL.Null,
    'ConfigError' : IDL.Text,
    'InstallFailed' : IDL.Text,
  });
  const Result = IDL.Variant({ 'Ok' : IDL.Principal, 'Err' : Error });
  const Result_1 = IDL.Variant({ 'Ok' : IDL.Null, 'Err' : Error });
  return IDL.Service({
    'create_new_sector' : IDL.Func([SectorConfig], [Result], []),
    'set_invite_canister' : IDL.Func([IDL.Principal], [Result_1], []),
    'set_registry_canister' : IDL.Func([IDL.Principal], [Result_1], []),
    'set_sector_wasm' : IDL.Func([IDL.Vec(IDL.Nat8)], [Result_1], []),
  });
};
export const init = ({ IDL }) => { return [IDL.Principal]; };
