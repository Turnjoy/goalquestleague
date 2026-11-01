import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { CLUB_LEAGUE_DIVISIONS, CLUB_LEAGUE_NAMES } from '../lib/divisions.js';

function playerLabel(player) {
  return player.manager_handle || player.gamertag || player.full_name || player.email || player.id;
}

export default function SeasonClubAssignments({
  league,
  division,
  seasonYear,
  onLeagueChange,
  onDivisionChange,
  onSeasonYearChange,
}) {
  const [clubs, setClubs] = useState([]);
  const [players, setPlayers] = useState([]);
  const [assignments, setAssignments] = useState({});
  const [savedAssignments, setSavedAssignments] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const parsedSeasonYear = Number(seasonYear);
  const validSeasonYear = Number.isInteger(parsedSeasonYear) && parsedSeasonYear >= 2000 && parsedSeasonYear <= 2200;
  const availableDivisions = CLUB_LEAGUE_DIVISIONS[league] || [];

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setErrorMessage('');
      if (!validSeasonYear) {
        setClubs([]);
        setPlayers([]);
        setAssignments({});
        setErrorMessage('Enter a season year from 2000 to 2200.');
        setLoading(false);
        return;
      }
      try {
        const [clubResult, playerResult] = await Promise.all([
          supabase
            .from('league_clubs')
            .select('id, club_number, club_name')
            .eq('league_name', league)
            .eq('division', division)
            .order('club_number'),
          supabase
            .from('profiles')
            .select('id, manager_handle, gamertag, full_name, email')
            .eq('league_name', league)
            .eq('division', division)
            .eq('is_approved', true)
            .eq('status', 'active')
            .eq('is_admin', false)
            .order('manager_handle'),
        ]);
        if (clubResult.error) throw clubResult.error;
        if (playerResult.error) throw playerResult.error;

        const clubIds = (clubResult.data || []).map(club => club.id);
        let assignmentRows = [];
        if (clubIds.length > 0) {
          const assignmentResult = await supabase
            .from('season_club_assignments')
            .select('club_id, player_id')
            .eq('season_year', parsedSeasonYear)
            .in('club_id', clubIds);
          if (assignmentResult.error) throw assignmentResult.error;
          assignmentRows = assignmentResult.data || [];
        }

        if (!active) return;
        setClubs(clubResult.data || []);
        setPlayers(playerResult.data || []);
        const loadedAssignments = Object.fromEntries(assignmentRows.map(row => [row.club_id, row.player_id]));
        setAssignments(loadedAssignments);
        setSavedAssignments(loadedAssignments);
      } catch (error) {
        if (active) setErrorMessage(error instanceof Error ? error.message : 'Could not load club assignments.');
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => { active = false; };
  }, [league, division, seasonYear, validSeasonYear, parsedSeasonYear]);

  function assignPlayer(clubId, playerId) {
    if (!validSeasonYear) {
      setErrorMessage('Enter a season year from 2000 to 2200.');
      return;
    }
    setAssignments(current => {
      const next = { ...current };
      if (playerId) next[clubId] = playerId;
      else delete next[clubId];
      if (playerId) {
        for (const [otherClubId, assignedPlayerId] of Object.entries(next)) {
          if (otherClubId !== clubId && assignedPlayerId === playerId) delete next[otherClubId];
        }
      }
      return next;
    });
    setMessage('');
    setErrorMessage('');
  }

  async function saveAssignments() {
    if (!validSeasonYear) {
      setErrorMessage('Enter a season year from 2000 to 2200.');
      return;
    }

    setSaving(true);
    setMessage('');
    setErrorMessage('');
    try {
      const { error } = await supabase.rpc('admin_save_season_club_assignments', {
        p_league_name: league,
        p_division: division,
        p_season_year: parsedSeasonYear,
        p_assignments: clubs.map(club => ({
          club_id: club.id,
          player_id: assignments[club.id] || null,
        })),
      });
      if (error) throw error;

      setSavedAssignments({ ...assignments });
      setMessage('Season assignments saved. Club names are now updated in the standings.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not save season assignments.');
    } finally {
      setSaving(false);
    }
  }

  const assignedCount = Object.keys(assignments).length;
  const hasUnsavedChanges = clubs.some(club => (assignments[club.id] || '') !== (savedAssignments[club.id] || ''));

  return (
    <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-lg dark:border-slate-700 dark:bg-slate-900">
      <header>
        <h2 className="text-xl font-black text-slate-900 dark:text-white">Season Club Assignments</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Clubs stay in their league division. Assign an active player to each club for every season before generating fixtures.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="text-sm font-bold text-slate-700 dark:text-slate-300">
          League
          <select
            value={league}
            onChange={event => {
              const nextLeague = event.target.value;
              onLeagueChange(nextLeague);
              onDivisionChange(CLUB_LEAGUE_DIVISIONS[nextLeague]?.[0] || '');
            }}
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          >
            {CLUB_LEAGUE_NAMES.map(leagueName => (
              <option key={leagueName} value={leagueName}>{leagueName}</option>
            ))}
          </select>
        </label>
        <label className="text-sm font-bold text-slate-700 dark:text-slate-300">
          Division
          <select
            value={division}
            onChange={event => onDivisionChange(event.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          >
            {availableDivisions.map(divisionName => (
              <option key={divisionName} value={divisionName}>{divisionName}</option>
            ))}
          </select>
        </label>
        <label className="text-sm font-bold text-slate-700 dark:text-slate-300">
          Season year
          <input
            type="number"
            min="2000"
            max="2200"
            value={seasonYear}
            onChange={event => onSeasonYearChange(event.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          />
        </label>
      </div>

      {message && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">{message}</p>}
      {errorMessage && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800 dark:bg-rose-500/10 dark:text-rose-300">{errorMessage}</p>}

      {loading ? (
        <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">Loading clubs and eligible players...</p>
      ) : clubs.length === 0 ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
          No clubs are configured for this league and division. Apply the club seed migration in Supabase first.
        </p>
      ) : (
        <>
          <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
            {assignedCount} of {clubs.length} clubs assigned for {seasonYear}
          </p>
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="min-w-[620px] w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
              <thead className="bg-slate-50 text-left dark:bg-slate-800">
                <tr>
                  <th className="px-3 py-3 font-bold text-slate-700 dark:text-slate-200">#</th>
                  <th className="px-3 py-3 font-bold text-slate-700 dark:text-slate-200">Permanent club</th>
                  <th className="px-3 py-3 font-bold text-slate-700 dark:text-slate-200">Player for {seasonYear}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {clubs.map(club => (
                  <tr key={club.id}>
                    <td className="px-3 py-2 font-bold text-slate-700 dark:text-slate-300">{club.club_number}</td>
                    <td className="px-3 py-2 font-semibold text-slate-900 dark:text-white">{club.club_name}</td>
                    <td className="px-3 py-2">
                      <select
                        aria-label={`Player assigned to ${club.club_name} for ${seasonYear}`}
                        value={assignments[club.id] || ''}
                        onChange={event => assignPlayer(club.id, event.target.value)}
                        disabled={!validSeasonYear || saving}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                      >
                        <option value="">Unassigned</option>
                        {players.map(player => (
                          <option key={player.id} value={player.id}>
                            {playerLabel(player)}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {hasUnsavedChanges ? 'You have unsaved assignment changes.' : 'All changes are saved.'}
            </p>
            <button
              type="button"
              onClick={saveAssignments}
              disabled={!validSeasonYear || !hasUnsavedChanges || saving || loading}
              className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? 'Saving assignments...' : 'Save assignments'}
            </button>
          </div>
          {players.length === 0 && (
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              No active, approved players are currently assigned to this league division.
            </p>
          )}
        </>
      )}
    </section>
  );
}
