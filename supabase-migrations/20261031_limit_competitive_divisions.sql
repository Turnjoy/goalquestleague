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

notify pgrst, 'reload schema';
