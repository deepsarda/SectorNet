export const idlFactory = ({ IDL }) => {
  const SectorInfo = IDL.Record({
    'id' : IDL.Principal,
    'is_vetted' : IDL.Bool,
    'name' : IDL.Text,
    'description' : IDL.Text,
    'abbreviation' : IDL.Text,
    'member_count' : IDL.Nat64,
  });
  const Error = IDL.Variant({
    'AlreadyRegistered' : IDL.Null,
    'NotFound' : IDL.Null,
    'Unauthorized' : IDL.Null,
  });
  const Result = IDL.Variant({ 'Ok' : IDL.Null, 'Err' : Error });
  return IDL.Service({
    'get_vetted_sectors' : IDL.Func([], [IDL.Vec(SectorInfo)], ['query']),
    'register_sector' : IDL.Func([SectorInfo], [Result], []),
    'search_sectors' : IDL.Func([IDL.Text], [IDL.Vec(SectorInfo)], ['query']),
    'set_factory_canister' : IDL.Func([IDL.Principal], [Result], []),
    'set_sector_vetted_status' : IDL.Func(
        [IDL.Principal, IDL.Bool],
        [Result],
        [],
      ),
    'update_sector_listing' : IDL.Func([SectorInfo], [Result], []),
  });
};
export const init = ({ IDL }) => { return [IDL.Principal, IDL.Principal]; };
