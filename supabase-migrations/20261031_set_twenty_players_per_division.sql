do $$
begin
  if exists (
    select 1
    from public.profiles
    where division in ('Advanced', 'Intermediate', 'Foundation', 'Development', 'Rookie')
  ) then
    raise exception 'Cannot remove divisions: profiles are still assigned to Advanced, Intermediate, Foundation, Development, or Rookie';
  end if;
end;
$$;

delete from public.division_catalog
where name in ('Advanced', 'Intermediate', 'Foundation', 'Development', 'Rookie');

update public.division_catalog
set slot_limit = 20
where name in ('Elite', 'Premier', 'Championship', 'Challenger', 'Contender');

update public.division_catalog
set sort_order = 6, slot_limit = null, is_open = true
where name = 'Trial';

notify pgrst, 'reload schema';
