import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { clubAssignmentTopic } from '../lib/clubAssignments.js';
import {
  CLUB_LEAGUE_DIVISIONS,
  CLUB_LEAGUE_NAMES,
  getClubDivisionDisplayName,
  getClubDivisionStorageNames,
} from '../lib/divisions.js';

function playerLabel(player) {
  return player.manager_handle || player.gamertag || player.full_name || player.email || player.id;
}

async function fetchAssignmentData(league, division, seasonYear) {
  const clubResult = await supabase
    .from('league_clubs')
    .select('id, club_number, club_name, division')
    .eq('league_name', league)
    .in('division', getClubDivisionStorageNames(league, division))
    .order('club_number');
  if (clubResult.error) throw clubResult.error;

  const clubIds = (clubResult.data || []).map(club => club.id);
  let assignmentRows = [];
  if (clubIds.length > 0) {
    const assignmentResult = await supabase
      .from('season_club_assignments')
      .select('club_id, player_id')
      .eq('season_year', seasonYear)
      .in('club_id', clubIds);
    if (assignmentResult.error) throw assignmentResult.error;
    assignmentRows = assignmentResult.data || [];
  }

  const playersResult = await supabase
    .from('profiles')
    .select('id, manager_handle, gamertag, full_name, email, league_name, division')
    .eq('is_approved', true)
    .eq('status', 'active')
    .eq('is_admin', false)
    .order('league_name, division, manager_handle');
  if (playersResult.error) throw playersResult.error;

  const destinationsResult = await supabase
    .from('league_clubs')
    .select('id, league_name, division, club_number, club_name')
    .order('league_name, division, club_number');
  if (destinationsResult.error) throw destinationsResult.error;

  const moveHistoryResult = await supabase
    .from('club_league_move_audit')
    .select('id, club_id, move_type, reason, reason_details, previous_league, previous_division, new_league, new_division, admin_id, created_at, league_clubs(club_name)')
    .order('created_at', { ascending: false })
    .limit(50);
  if (moveHistoryResult.error) throw moveHistoryResult.error;

  return {
    clubs: clubResult.data || [],
    storedDivision: clubResult.data?.[0]?.division || division,
    destinations: destinationsResult.data || [],
    moveHistory: moveHistoryResult.data || [],
    assignments: Object.fromEntries(assignmentRows.map(row => [row.club_id, row.player_id])),
    players: playersResult.data || [],
  };
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
  const [storedDivision, setStoredDivision] = useState(division);
  const [players, setPlayers] = useState([]);
  const [assignments, setAssignments] = useState({});
  const [savedAssignments, setSavedAssignments] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [moveModal, setMoveModal] = useState(null);
  const [moveTarget, setMoveTarget] = useState('');
  const [moveReason, setMoveReason] = useState('manager_availability');
  const [moveDetails, setMoveDetails] = useState('');
  const [counterpartClubId, setCounterpartClubId] = useState('');
  const [moving, setMoving] = useState(false);
  const [completingSeason, setCompletingSeason] = useState(false);
  const [lowerScope, setLowerScope] = useState('');
  const [upperScope, setUpperScope] = useState('');
  const [destinations, setDestinations] = useState([]);
  const [moveHistory, setMoveHistory] = useState([]);
  const parsedSeasonYear = Number(seasonYear);
  const validSeasonYear = Number.isInteger(parsedSeasonYear) && parsedSeasonYear >= 2000 && parsedSeasonYear <= 2200;
  const availableDivisions = CLUB_LEAGUE_DIVISIONS[league] || [];
  const movementScopes = [...new Map(destinations.map(club => [
    `${club.league_name}::${club.division}`,
    { league_name: club.league_name, division: club.division },
  ])).values()];

  useEffect(() => {
    if (!lowerScope && movementScopes[0]) setLowerScope(`${movementScopes[0].league_name}::${movementScopes[0].division}`);
    if (!upperScope && movementScopes[1]) setUpperScope(`${movementScopes[1].league_name}::${movementScopes[1].division}`);
  }, [destinations, lowerScope, upperScope]);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setErrorMessage('');
      if (!validSeasonYear) {
        setClubs([]);
        setAssignments({});
        setSavedAssignments({});
        setErrorMessage('Enter a season year from 2000 to 2200.');
        setLoading(false);
        return;
      }
      try {
        const data = await fetchAssignmentData(league, division, parsedSeasonYear);
        if (!active) return;
        setClubs(data.clubs);
        setStoredDivision(data.storedDivision);
        setDestinations(data.destinations);
        setMoveHistory(data.moveHistory);
        setAssignments(data.assignments);
        setSavedAssignments(data.assignments);
        setPlayers(data.players);
      } catch (error) {
        if (active) setErrorMessage(error instanceof Error ? error.message : 'Could not load club assignments.');
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    const channel = supabase
      .channel(clubAssignmentTopic(league, division), { config: { private: true } })
      .on('broadcast', { event: 'club_assignments_changed' }, load)
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
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
        p_division: storedDivision,
        p_season_year: parsedSeasonYear,
        p_assignments: clubs.map(club => ({
          club_id: club.id,
          player_id: assignments[club.id] || null,
        })),
      });
      if (error) throw error;

      setSavedAssignments({ ...assignments });
      try {
        const data = await fetchAssignmentData(league, division, parsedSeasonYear);
        setClubs(data.clubs);
        setStoredDivision(data.storedDivision);
        setDestinations(data.destinations);
        setMoveHistory(data.moveHistory);
        setAssignments(data.assignments);
        setSavedAssignments(data.assignments);
        setPlayers(data.players);
        setMessage('Season managers saved. Club standings, fixtures, and completed results remain with each club.');
      } catch (refreshError) {
        setMessage('Season assignments were saved.');
        setErrorMessage(`Saved, but could not reload the latest assignment data: ${refreshError.message}`);
      }
    } catch (error) {
      setErrorMessage(error?.message || 'Could not save season assignments.');
    } finally {
      setSaving(false);
    }
  }

  function openMove(club, moveType) {
    const grouped = new Map();
    for (const option of destinations) {
      const key = `${option.league_name}::${option.division}`;
      if (option.league_name === league && option.division === storedDivision) continue;
      const current = grouped.get(key) || { league_name: option.league_name, division: option.division, clubCount: 0 };
      current.clubCount += 1;
      grouped.set(key, current);
    }
    const options = [...grouped.values()];
    setMoveModal({ club, moveType, options });
    setMoveTarget(options[0] ? `${options[0].league_name}::${options[0].division}` : '');
    setMoveReason('manager_availability');
    setMoveDetails('');
    setCounterpartClubId('');
    setErrorMessage('');
  }

  async function confirmMove() {
    if (!moveModal || !moveTarget) return;
    const [targetLeague, targetDivision] = moveTarget.split('::');
    setMoving(true);
    setErrorMessage('');
    setMessage('');
    try {
      const { error } = await supabase.rpc('admin_move_club_league', {
        p_club_id: moveModal.club.id,
        p_new_league: targetLeague,
        p_new_division: targetDivision,
        p_move_type: moveModal.moveType,
        p_reason: moveReason,
        p_reason_details: moveDetails.trim() || null,
        p_counterpart_club_id: counterpartClubId || null,
      });
      if (error) throw error;
      setMessage(`${moveModal.club.club_name} moved to ${targetLeague} · ${targetDivision}. Its manager assignment and historical results remain with the club.`);
      setMoveModal(null);
      const data = await fetchAssignmentData(league, division, parsedSeasonYear);
      setClubs(data.clubs);
      setDestinations(data.destinations);
      setMoveHistory(data.moveHistory);
      setAssignments(data.assignments);
      setSavedAssignments(data.assignments);
      setPlayers(data.players);
    } catch (error) {
      setErrorMessage(error?.message || 'Could not move this club.');
    } finally {
      setMoving(false);
    }
  }

  async function completeSeasonMovements() {
    const [lowerLeague, lowerDivision] = lowerScope.split('::');
    const [upperLeague, upperDivision] = upperScope.split('::');
    if (!lowerLeague || !upperLeague || lowerScope === upperScope) return;
    const approved = window.confirm(
      `Complete the ${seasonYear} season movement? The 3 highest ranked clubs in ${lowerLeague} · ${lowerDivision} will be promoted, and the 3 lowest ranked clubs in ${upperLeague} · ${upperDivision} will be relegated. Both stop dates must have passed and all fixtures must be completed or cancelled.`,
    );
    if (!approved) return;
    setCompletingSeason(true);
    setErrorMessage('');
    setMessage('');
    try {
      const { data, error } = await supabase.rpc('admin_complete_club_season', {
        p_season_year: parsedSeasonYear,
        p_lower_league: lowerLeague,
        p_lower_division: lowerDivision,
        p_upper_league: upperLeague,
        p_upper_division: upperDivision,
      });
      if (error) throw error;
      const movedClubIds = [...(data?.promoted_club_ids || []), ...(data?.relegated_club_ids || [])];
      setMessage(`Season ${seasonYear} completed: ${data?.promoted ?? 3} clubs promoted and ${data?.relegated ?? 3} relegated. ${movedClubIds.length} permanent club records moved.`);
      const refreshed = await fetchAssignmentData(league, division, parsedSeasonYear);
      setClubs(refreshed.clubs);
      setDestinations(refreshed.destinations);
      setMoveHistory(refreshed.moveHistory);
      setAssignments(refreshed.assignments);
      setSavedAssignments(refreshed.assignments);
      setPlayers(refreshed.players);
    } catch (error) {
      setErrorMessage(error?.message || 'Could not complete season movement.');
    } finally {
      setCompletingSeason(false);
    }
  }

  const assignedCount = Object.keys(assignments).length;
  const hasUnsavedChanges = clubs.some(club => (assignments[club.id] || '') !== (savedAssignments[club.id] || ''));

  return (
    <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-lg dark:border-slate-700 dark:bg-slate-900">
      <header>
        <h2 className="text-xl font-black text-slate-900 dark:text-white">Season Club Assignments</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Clubs and their records are permanent. Assign or replace a manager separately from league placement; manager changes never move a club. At season completion the system promotes the 3 highest ranked clubs in the selected lower division and relegates the 3 lowest ranked clubs in the selected upper division. Manual moves remain available during an incomplete season.
        </p>
      </header>

      <section className="grid gap-4 rounded-xl border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-500/30 dark:bg-indigo-500/10 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
        <label className="text-sm font-bold text-slate-700 dark:text-slate-200">Lower division
          <select value={lowerScope} onChange={event => {
            const nextScope = event.target.value;
            setLowerScope(nextScope);
            if (nextScope === upperScope) {
              const replacement = movementScopes.find(scope => `${scope.league_name}::${scope.division}` !== nextScope);
              setUpperScope(replacement ? `${replacement.league_name}::${replacement.division}` : '');
            }
          }} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950">
            {movementScopes.map(scope => <option key={`${scope.league_name}::${scope.division}`} value={`${scope.league_name}::${scope.division}`}>{scope.league_name} · {getClubDivisionDisplayName(scope.league_name, scope.division)}</option>)}
          </select>
        </label>
        <label className="text-sm font-bold text-slate-700 dark:text-slate-200">Upper division
          <select value={upperScope} onChange={event => setUpperScope(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950">
            {movementScopes.filter(scope => `${scope.league_name}::${scope.division}` !== lowerScope).map(scope => <option key={`${scope.league_name}::${scope.division}`} value={`${scope.league_name}::${scope.division}`}>{scope.league_name} · {getClubDivisionDisplayName(scope.league_name, scope.division)}</option>)}
          </select>
        </label>
        <p className="text-xs leading-5 text-slate-600 dark:text-slate-300">Uses the existing standings order: points, goal difference, goals scored, then matches played. The server requires both stop dates to pass, terminal fixtures, 20 clubs, and standings for all 20 clubs.</p>
        <button type="button" onClick={completeSeasonMovements} disabled={completingSeason || !validSeasonYear || !lowerScope || !upperScope || lowerScope === upperScope} className="rounded-xl bg-indigo-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{completingSeason ? 'Completing season…' : 'Complete season · 3 up / 3 down'}</button>
      </section>

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

      <p className="text-xs text-slate-500 dark:text-slate-400">
        Club names come from the selected league and division above. Player dropdowns show all approved, active players in the app — assign anyone, even unassigned players.
      </p>

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
            <table className="min-w-[780px] w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
              <thead className="bg-slate-50 text-left dark:bg-slate-800">
                <tr>
                  <th className="px-3 py-3 font-bold text-slate-700 dark:text-slate-200">#</th>
                  <th className="px-3 py-3 font-bold text-slate-700 dark:text-slate-200">Permanent club</th>
                  <th className="px-3 py-3 font-bold text-slate-700 dark:text-slate-200">Manager for {seasonYear}</th>
                  <th className="px-3 py-3 font-bold text-slate-700 dark:text-slate-200">Manual league move</th>
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
                        disabled={!validSeasonYear || saving || loading}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                      >
                        <option value="">Unassigned</option>
                        {players.map(player => (
                          <option key={player.id} value={player.id}>
                            {playerLabel(player)}{player.league_name && player.division ? ` · ${player.league_name} · ${player.division}` : ''}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => openMove(club, 'promote')} disabled={saving || moving || hasUnsavedChanges} className="rounded-lg border border-emerald-300 px-2.5 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-500/10">Promote</button>
                        <button type="button" onClick={() => openMove(club, 'relegate')} disabled={saving || moving || hasUnsavedChanges} className="rounded-lg border border-amber-300 px-2.5 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-50 disabled:opacity-50 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-500/10">Relegate</button>
                      </div>
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
              No approved, active players in the app.
            </p>
          )}
        </>
      )}

      {moveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="club-move-title" className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
            <div>
              <h3 id="club-move-title" className="text-xl font-black text-slate-900 dark:text-white">{moveModal.moveType === 'promote' ? 'Promote' : 'Relegate'} {moveModal.club.club_name}</h3>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Current: {league} · {division}. This manual admin move is available during an incomplete season. The manager, fixtures, and results will stay with the club.</p>
            </div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">Destination league and division
              <select value={moveTarget} onChange={event => { setMoveTarget(event.target.value); setCounterpartClubId(''); }} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950">
                {moveModal.options.map(option => <option key={`${option.league_name}::${option.division}`} value={`${option.league_name}::${option.division}`}>{option.league_name} · {getClubDivisionDisplayName(option.league_name, option.division)} ({option.clubCount}/20 clubs)</option>)}
              </select>
            </label>
            {moveModal.options.find(option => `${option.league_name}::${option.division}` === moveTarget)?.clubCount >= 20 && <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">Club moving in the opposite direction
              <select value={counterpartClubId} onChange={event => setCounterpartClubId(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950">
                <option value="">Choose a club</option>
                {destinations.filter(option => option.league_name === moveTarget.split('::')[0] && option.division === moveTarget.split('::')[1]).map(option => <option key={option.id} value={option.id}>{option.club_name}</option>)}
              </select>
            </label>}
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">Reason
              <select value={moveReason} onChange={event => setMoveReason(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950">
                <option value="manager_availability">Manager availability</option>
                <option value="punishment">Punishment</option>
                <option value="other">Other</option>
              </select>
            </label>
            {moveReason === 'other' && <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">Reason details
              <textarea value={moveDetails} onChange={event => setMoveDetails(event.target.value)} rows={3} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950" />
            </label>}
            {moveModal.options.length === 0 && <p role="alert" className="text-sm font-semibold text-rose-700">No other configured league divisions are available.</p>}
            <p className="text-xs text-slate-500">For a full division, select a counterpart so both clubs exchange placement atomically. Club records, manager assignments, fixtures, and results remain attached to their original club IDs.</p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setMoveModal(null)} disabled={moving} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold dark:border-slate-700">Cancel</button>
              <button type="button" onClick={confirmMove} disabled={moving || !moveTarget || (moveReason === 'other' && !moveDetails.trim()) || (moveModal.options.find(option => `${option.league_name}::${option.division}` === moveTarget)?.clubCount >= 20 && !counterpartClubId)} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{moving ? 'Saving move…' : `Confirm ${moveModal.moveType}`}</button>
            </div>
          </section>
        </div>
      )}
      <section className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
        <div>
          <h3 className="font-black text-slate-900 dark:text-white">Recent league move audit</h3>
          <p className="text-xs text-slate-500">Latest 50 manual moves, including the acting admin and recorded reason.</p>
        </div>
        {moveHistory.length === 0 ? (
          <p className="text-sm text-slate-500">No manual league moves have been recorded.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[720px] w-full text-left text-xs">
              <thead><tr className="text-slate-500"><th className="p-2">Club</th><th className="p-2">Action</th><th className="p-2">Previous placement</th><th className="p-2">New placement</th><th className="p-2">Reason</th><th className="p-2">Admin · time</th></tr></thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {moveHistory.map(move => <tr key={move.id}>
                  <td className="p-2 font-bold">{move.league_clubs?.club_name || move.club_id}</td>
                  <td className="p-2 capitalize">{move.move_type}</td>
                  <td className="p-2">{move.previous_league} · {move.previous_division}</td>
                  <td className="p-2">{move.new_league} · {move.new_division}</td>
                  <td className="p-2">{move.reason.replaceAll('_', ' ')}{move.reason_details ? `: ${move.reason_details}` : ''}</td>
                  <td className="p-2">{move.admin_id}<br />{new Date(move.created_at).toLocaleString()}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
