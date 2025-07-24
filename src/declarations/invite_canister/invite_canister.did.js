export const idlFactory = ({ IDL }) => {
  const Result = IDL.Variant({ 'Ok' : IDL.Null, 'Err' : IDL.Text });
  return IDL.Service({
    'register_code' : IDL.Func([IDL.Text], [Result], []),
    'register_new_private_sector' : IDL.Func([IDL.Principal], [], []),
    'resolve_code' : IDL.Func([IDL.Text], [IDL.Opt(IDL.Principal)], ['query']),
    'revoke_code' : IDL.Func([IDL.Text], [Result], []),
    'set_factory_canister' : IDL.Func([IDL.Principal], [Result], []),
  });
};
export const init = ({ IDL }) => { return [IDL.Principal, IDL.Principal]; };
