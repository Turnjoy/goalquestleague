import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import Spinner from './Spinner.jsx';

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

function profileLabel(profile) {
  if (!profile) return 'Manager unavailable';
  return profile.manager_handle || profile.gamertag || profile.full_name || profile.email || 'Manager';
}

function trophyKey(trophy) {
  return JSON.stringify([trophy.club_id, trophy.trophy_name, trophy.season]);
}

async function fetchCabinetData() {
  const [clubsResult, clubTrophiesResult, managerTrophiesResult] = await Promise.all([
    supabase
      .from('league_clubs')
      .select('id, league_name, division, club_number, club_name')
      .order('league_name')
      .order('division')
      .order('club_number'),
    supabase
      .from('club_trophies')
      .select('id, club_id, trophy_name, season, created_at')
      .order('season', { ascending: false })
      .order('trophy_name'),
    supabase
      .from('manager_trophies')
      .select('id, user_id, club_id, trophy_name, season, created_at')
      .order('season', { ascending: false })
      .order('trophy_name'),
  ]);

  const firstError = clubsResult.error || clubTrophiesResult.error || managerTrophiesResult.error;
  if (firstError) throw firstError;

  const managerIds = uniqueValues((managerTrophiesResult.data ?? []).map(trophy => trophy.user_id));
  let profiles = [];
  if (managerIds.length > 0) {
    const profilesResult = await supabase
      .from('profiles')
      .select('id, manager_handle, gamertag, full_name, email')
      .in('id', managerIds);
    if (profilesResult.error) throw profilesResult.error;
    profiles = profilesResult.data ?? [];
  }

  return {
    clubs: clubsResult.data ?? [],
    clubTrophies: clubTrophiesResult.data ?? [],
    managerTrophies: managerTrophiesResult.data ?? [],
    profiles,
  };
}

export default function AdminTrophyCabinet() {
  const [clubs, setClubs] = useState([]);
  const [clubTrophies, setClubTrophies] = useState([]);
  const [managerTrophies, setManagerTrophies] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedLeague, setSelectedLeague] = useState('');
  const [selectedDivision, setSelectedDivision] = useState('');

  async function load() {
    setLoading(true);
    setLoadError('');
    try {
      const data = await fetchCabinetData();
      setClubs(data.clubs);
      setClubTrophies(data.clubTrophies);
      setManagerTrophies(data.managerTrophies);
      setProfiles(data.profiles);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load the trophy cabinet.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const channel = supabase
      .channel('admin-trophy-cabinet')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'league_clubs' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'club_trophies' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'manager_trophies' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, load)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  const leagues = useMemo(() => uniqueValues(clubs.map(club => club.league_name)).sort(), [clubs]);
  const divisions = useMemo(() => uniqueValues(
    clubs
      .filter(club => !selectedLeague || club.league_name === selectedLeague)
      .map(club => club.division),
  ).sort(), [clubs, selectedLeague]);

  const cabinets = useMemo(() => {
    const clubById = new Map(clubs.map(club => [club.id, club]));
    const profileById = new Map(profiles.map(profile => [profile.id, profile]));
    const managerIdByTrophy = new Map(managerTrophies.map(trophy => [trophyKey(trophy), trophy.user_id]));

    const trophiesByClub = new Map();
    for (const trophy of clubTrophies) {
      const club = clubById.get(trophy.club_id);
      if (!club) continue;
      if (selectedLeague && club.league_name !== selectedLeague) continue;
      if (selectedDivision && club.division !== selectedDivision) continue;

      const managerId = managerIdByTrophy.get(trophyKey(trophy));
      const enriched = {
        ...trophy,
        manager_name: profileLabel(profileById.get(managerId)),
      };
      const current = trophiesByClub.get(club.id) ?? [];
      current.push(enriched);
      trophiesByClub.set(club.id, current);
    }

    return clubs
      .filter(club => trophiesByClub.has(club.id))
      .map(club => ({
        club,
        trophies: (trophiesByClub.get(club.id) ?? []).sort((left, right) =>
          right.season - left.season || left.trophy_name.localeCompare(right.trophy_name),
        ),
      }))
      .sort((left, right) =>
        left.club.league_name.localeCompare(right.club.league_name)
        || left.club.division.localeCompare(right.club.division)
        || left.club.club_number - right.club.club_number,
      );
  }, [clubTrophies, clubs, managerTrophies, profiles, selectedDivision, selectedLeague]);

  const totalTrophies = cabinets.reduce((total, cabinet) => total + cabinet.trophies.length, 0);

  if (loading) return <Spinner label="Loading trophy cabinet" />;

  return (
    <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-lg dark:border-slate-700 dark:bg-slate-900">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white">Club Trophy Cabinet</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Permanent club trophies with the manager recorded when each trophy was awarded.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm font-bold text-slate-700 dark:text-slate-300">
            League
            <select
              value={selectedLeague}
              onChange={event => {
                setSelectedLeague(event.target.value);
                setSelectedDivision('');
              }}
              className="mt-1 block rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            >
              <option value="">All leagues</option>
              {leagues.map(league => (
                <option key={league} value={league}>{league}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-bold text-slate-700 dark:text-slate-300">
            Division / Tier
            <select
              value={selectedDivision}
              onChange={event => setSelectedDivision(event.target.value)}
              className="mt-1 block rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            >
              <option value="">All divisions</option>
              {divisions.map(division => (
                <option key={division} value={division}>{division}</option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {loadError && (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800 dark:bg-rose-500/10 dark:text-rose-300">
          {loadError}
        </p>
      )}

      {!loadError && cabinets.length === 0 && (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
          No club trophies match the selected league and division filters.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {cabinets.map(({ club, trophies }) => (
          <article
            key={club.id}
            className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white">{club.club_name}</h3>
                <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
                  {club.league_name} · {club.division} · Club #{club.club_number}
                </p>
              </div>
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                {trophies.length} trophy{trophies.length === 1 ? '' : 's'}
              </span>
            </div>
            <ul className="mt-4 space-y-2">
              {trophies.map(trophy => (
                <li
                  key={trophy.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-sm dark:bg-slate-900"
                >
                  <div>
                    <p className="font-bold text-slate-900 dark:text-white">{trophy.trophy_name}</p>
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Season {trophy.season}</p>
                  </div>
                  <p className="text-sm font-bold text-indigo-700 dark:text-indigo-300">{trophy.manager_name}</p>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>

      {cabinets.length > 0 && (
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
          Showing {totalTrophies} trophy{totalTrophies === 1 ? '' : 's'} across {cabinets.length} club{cabinets.length === 1 ? '' : 's'}.
        </p>
      )}
    </section>
  );
}
