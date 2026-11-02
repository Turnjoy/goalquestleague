alter table public.fixtures enable row level security;

drop policy if exists "fixtures_select_participant_or_admin" on public.fixtures;
create policy "fixtures_select_participant_or_admin" on public.fixtures
  for select using (
    home_player_id = auth.uid()
    or away_player_id = auth.uid()
    or public.is_admin()
  );

grant select on public.fixtures to authenticated;

notify pgrst, 'reload schema';
