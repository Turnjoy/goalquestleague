-- Admin-only correction path for league results.
create or replace function public.admin_reset_fixture_result(fixture_id_input uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  update public.fixtures
  set home_score = null,
      away_score = null,
      status = 'scheduled',
      dispute_reason = null,
      played_at = null,
      submitted_at = null
  where id = fixture_id_input;

  if not found then raise exception 'Fixture not found'; end if;
end;
$$;

revoke all on function public.admin_reset_fixture_result(uuid) from public, anon;
grant execute on function public.admin_reset_fixture_result(uuid) to authenticated;
