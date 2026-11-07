import { Bell } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import Badge from '../components/Badge.jsx';
import FixtureCard from '../components/FixtureCard.jsx';
import ProtectedRoute from '../components/ProtectedRoute.jsx';
import StandingsTable from '../components/StandingsTable.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { confirmScore, disputeScore, fetchMyFixtures, fetchStandings, fetchUserSquad } from '../lib/leagueApi.js';
import { supabase } from '../lib/supabase.js';

function DashboardContent() {
  const { user, profile } = useAuth();
  const [fixtures, setFixtures] = useState([]);
  const [standing, setStanding] = useState(null);
  const [notice, setNotice] = useState('');
  const [userSquad, setUserSquad] = useState(null);
  const [loadingSquad, setLoadingSquad] = useState(true);
  const pendingForMe = useMemo(
    () => fixtures.filter((fixture) =>
      fixture.status === 'pending_confirmation'
      && (fixture.away_club_id && fixture.assignedClubId
        ? fixture.away_club_id === fixture.assignedClubId
        : fixture.away_player_id === user.id)),
    [fixtures, user.id],
  );

  async function load() {
    const [fixtureRows, standingsRows, squadData] = await Promise.all([
      fetchMyFixtures(user.id),
      fetchStandings(profile.division, profile.league_name),
      fetchUserSquad(user.id)
    ]);
    setFixtures(fixtureRows);
    const myIndex = standingsRows.findIndex((row) => row.player_id === user.id);
    const row = standingsRows[myIndex] ?? null;
    setStanding(row ? { ...row, rank: myIndex + 1 } : null);
    setUserSquad(squadData);
    setLoadingSquad(false);
  }

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`dashboard-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fixtures' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'standings' }, load)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [user.id, profile.division]);

  async function withNotice(action, success) {
    try {
      await action();
      setNotice(success);
      await load();
    } catch (error) {
      setNotice(error.message);
    }
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-lg dark:shadow-xl">
          <img src="/goalquest-logo.webp" alt="GoalQuest League logo" className="mb-4 h-28 w-full rounded-xl object-cover" />
          <p className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400">Player profile</p>
          <h1 className="mt-1 text-2xl font-black text-slate-900 dark:text-white">{profile.manager_handle || profile.gamertag || profile.full_name}</h1>
          <p className="mt-1 text-sm font-semibold text-slate-600 dark:text-slate-400">{profile.team_name || profile.custom_team_name || profile.squad_name || 'Unassigned'}</p>
          <span className="mt-2 inline-flex rounded-full bg-emerald-100 dark:bg-emerald-500/10 px-2 py-1 text-xs font-black text-emerald-800 dark:text-emerald-400">Verified league profile</span>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div><span className="font-bold text-slate-500 dark:text-slate-400">Division</span><div className="mt-1"><Badge tone={profile.division}>{profile.division}</Badge></div></div>
            <div><span className="font-bold text-slate-500 dark:text-slate-400">Rank</span><p className="mt-1 font-black text-slate-900 dark:text-white">#{standing ? standing.rank ?? '-' : '-'}</p></div>
            <div><span className="font-bold text-slate-500 dark:text-slate-400">Penalty Points</span><p className="mt-1 font-black text-slate-900 dark:text-white">{standing?.penalty_points ?? 0}</p></div>
            <div><span className="font-bold text-slate-500 dark:text-slate-400">Form</span><p className="mt-1 font-black text-slate-900 dark:text-white">{standing?.form || '-'}</p></div>
            <div><span className="font-bold text-slate-500 dark:text-slate-400">Record</span><p className="mt-1 font-black text-slate-900 dark:text-white">{standing ? `${standing.won}W · ${standing.draw}D · ${standing.lost}L` : '-'}</p></div>
            <div><span className="font-bold text-slate-500 dark:text-slate-400">Squad Size</span><p className="mt-1 font-black text-slate-900 dark:text-white">{userSquad ? userSquad.length : 'Not registered'}</p></div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-lg dark:shadow-xl">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-black text-slate-900 dark:text-white">Active fixtures</h2>
            {pendingForMe.length > 0 && <span className="inline-flex items-center gap-2 rounded bg-blue-100 dark:bg-blue-500/10 px-3 py-1 text-sm font-bold text-blue-800 dark:text-blue-400"><Bell className="h-4 w-4" /> Score awaiting you</span>}
          </div>
          {notice && <div className="mt-4 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3 py-2 text-sm font-semibold text-slate-800 dark:text-slate-300">{notice}</div>}
          <div className="mt-4 grid gap-4">
            {fixtures.slice(0, 4).map((fixture) => (
              <FixtureCard
                key={fixture.id}
                fixture={fixture}
                userId={user.id}
                onConfirmScore={(id) => withNotice(() => confirmScore(id), 'Score confirmed and standings recalculated.')}
                onDisputeScore={(id, reason) => withNotice(() => disputeScore(id, reason), 'Match disputed. Admin has been alerted in the dispute desk.')}
              />
            ))}
            {fixtures.length === 0 && <p className="py-8 text-center text-slate-500 dark:text-slate-400">No active fixtures yet.</p>}
          </div>
        </div>
      </section>
      <section>
        <h2 className="mb-3 text-xl font-black text-slate-900 dark:text-white">Live standings</h2>
        <div className="overflow-x-auto w-full">
          <StandingsTable division={profile.division} />
        </div>
      </section>
    </div>
  );
}

export default function DashboardPage() {
  return <ProtectedRoute><DashboardContent /></ProtectedRoute>;
}
