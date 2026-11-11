import { useEffect, useState } from 'react';
import FixtureCard from '../components/FixtureCard.jsx';
import ProtectedRoute from '../components/ProtectedRoute.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { confirmScore, disputeScore, fetchMyFixtures } from '../lib/leagueApi.js';
import { clubAssignmentTopic } from '../lib/clubAssignments.js';
import { supabase } from '../lib/supabase.js';

function FixturesContent() {
  const { user, profile } = useAuth();
  const [fixtures, setFixtures] = useState([]);
  const [message, setMessage] = useState('');

  async function load() {
    if (!user) return;
    setFixtures(await fetchMyFixtures(user.id));
  }

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`fixtures-${user?.id || 'all'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fixtures' }, load)
      .subscribe();
    const assignmentChannel = profile?.league_name && profile?.division
      ? supabase
        .channel(clubAssignmentTopic(profile.league_name, profile.division), { config: { private: true } })
        .on('broadcast', { event: 'club_assignments_changed' }, () => {
          load().catch(error => setMessage(error.message || 'Could not refresh fixtures after a club assignment change.'));
        })
        .subscribe()
      : null;
    return () => {
      supabase.removeChannel(channel);
      if (assignmentChannel) supabase.removeChannel(assignmentChannel);
    };
  }, [user?.id, profile?.league_name, profile?.division]);

  async function run(action, success) {
    try {
      await action();
      setMessage(success);
      await load();
    } catch (error) {
      setMessage(error.message);
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-slate-900 dark:text-white">My Fixtures</h1>
        <p className="mt-1 text-sm font-semibold text-slate-600 dark:text-slate-400">
          {profile?.team_name ? `All fixtures for ${profile.team_name}` : 'Admin submits all scores. Evidence stays external.'}
        </p>
      </div>
      {message && <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-sm font-semibold text-slate-800 dark:text-slate-300 shadow-lg dark:shadow-xl">{message}</div>}
      <div className="grid gap-4 lg:grid-cols-2">
        {fixtures.map((fixture) => (
          <FixtureCard
            key={fixture.id}
            fixture={fixture}
            userId={user.id}
            onConfirmScore={(id) => run(() => confirmScore(id), 'Score confirmed.')}
            onDisputeScore={(id, reason) => run(() => disputeScore(id, reason), 'Dispute sent to admin.')}
          />
        ))}
      </div>
      {fixtures.length === 0 && <div className="rounded-xl bg-white dark:bg-slate-900 p-8 text-center text-slate-500 dark:text-slate-400 shadow-lg dark:shadow-xl border border-slate-200 dark:border-slate-700">
        {profile?.team_name ? `No fixtures assigned to ${profile.team_name} yet.` : 'No fixtures assigned yet.'}
      </div>}
    </section>
  );
}

export default function FixturesPage() {
  return <ProtectedRoute><FixturesContent /></ProtectedRoute>;
}
