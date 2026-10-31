create or replace function public.update_my_profile_contact(
  full_name_input text,
  whatsapp_number_input text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_phone text := regexp_replace(coalesce(whatsapp_number_input, ''), '[^0-9]', '', 'g');
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to update profile details';
  end if;

  if nullif(btrim(full_name_input), '') is null then
    raise exception 'Full legal name is required';
  end if;

  if normalized_phone !~ '^[1-9][0-9]{7,14}$' then
    raise exception 'Enter a valid international WhatsApp number with its country code';
  end if;

  update public.profiles
  set full_name = btrim(full_name_input),
      whatsapp_number = normalized_phone
  where id = auth.uid();

  if not found then
    raise exception 'Profile not found';
  end if;
end;
$$;

revoke all on function public.update_my_profile_contact(text, text) from public, anon;
grant execute on function public.update_my_profile_contact(text, text) to authenticated;

create or replace function public.sync_profile_email_from_auth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set email = new.email
  where id = new.id
    and email is distinct from new.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.sync_profile_email_from_auth();

notify pgrst, 'reload schema';
