-- Keep public cup pages readable without requiring callers to execute the
-- admin-check function. Admins retain access to draft setup data and writes.

grant execute on function public.is_admin() to authenticated;

grant select on public.cup_competitions,
  public.cup_configurations,
  public.cup_participants,
  public.cup_fixtures,
  public.cup_standings to anon, authenticated;

grant insert, update, delete on public.cup_competitions,
  public.cup_configurations,
  public.cup_participants,
  public.cup_fixtures,
  public.cup_standings to authenticated;

drop policy if exists competitions_admin_write on public.cup_competitions;
create policy competitions_admin_insert on public.cup_competitions
  for insert to authenticated with check (public.is_admin());
create policy competitions_admin_update on public.cup_competitions
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy competitions_admin_delete on public.cup_competitions
  for delete to authenticated using (public.is_admin());

drop policy if exists configurations_admin_write on public.cup_configurations;
create policy configurations_admin_read on public.cup_configurations
  for select to authenticated using (public.is_admin());
create policy configurations_admin_insert on public.cup_configurations
  for insert to authenticated with check (public.is_admin());
create policy configurations_admin_update on public.cup_configurations
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy configurations_admin_delete on public.cup_configurations
  for delete to authenticated using (public.is_admin());

drop policy if exists participants_admin_write on public.cup_participants;
create policy participants_admin_read on public.cup_participants
  for select to authenticated using (public.is_admin());
create policy participants_admin_insert on public.cup_participants
  for insert to authenticated with check (public.is_admin());
create policy participants_admin_update on public.cup_participants
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy participants_admin_delete on public.cup_participants
  for delete to authenticated using (public.is_admin());

drop policy if exists fixtures_admin_write on public.cup_fixtures;
create policy fixtures_admin_read on public.cup_fixtures
  for select to authenticated using (public.is_admin());
create policy fixtures_admin_insert on public.cup_fixtures
  for insert to authenticated with check (public.is_admin());
create policy fixtures_admin_update on public.cup_fixtures
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy fixtures_admin_delete on public.cup_fixtures
  for delete to authenticated using (public.is_admin());

drop policy if exists standings_admin_write on public.cup_standings;
create policy standings_admin_read on public.cup_standings
  for select to authenticated using (public.is_admin());
create policy standings_admin_insert on public.cup_standings
  for insert to authenticated with check (public.is_admin());
create policy standings_admin_update on public.cup_standings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy standings_admin_delete on public.cup_standings
  for delete to authenticated using (public.is_admin());
