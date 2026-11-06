-- Validate custom team names against the real-world club blacklist.
-- Unchanged legacy names are not revalidated during unrelated profile updates.
CREATE OR REPLACE FUNCTION public.validate_team_name()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.custom_team_name IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.custom_team_name IS DISTINCT FROM OLD.custom_team_name)
     AND EXISTS (
       SELECT 1
       FROM public.club_name_blacklist b
       WHERE NULLIF(BTRIM(b.club_name), '') IS NOT NULL
         AND POSITION(LOWER(BTRIM(b.club_name)) IN LOWER(BTRIM(NEW.custom_team_name))) > 0
     ) THEN
    RAISE EXCEPTION 'Custom team name cannot contain a real-world club name: %', NEW.custom_team_name;
  END IF;

  IF NEW.squad_name IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.squad_name IS DISTINCT FROM OLD.squad_name)
     AND EXISTS (
       SELECT 1
       FROM public.club_name_blacklist b
       WHERE NULLIF(BTRIM(b.club_name), '') IS NOT NULL
         AND POSITION(LOWER(BTRIM(b.club_name)) IN LOWER(BTRIM(NEW.squad_name))) > 0
     ) THEN
    RAISE EXCEPTION 'Squad name cannot contain a real-world club name: %', NEW.squad_name;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_team_name_trigger ON public.profiles;
CREATE TRIGGER validate_team_name_trigger
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_team_name();
