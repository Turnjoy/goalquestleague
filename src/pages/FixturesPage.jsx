import { useEffect, useState } from 'react';
import FixtureCard from '../components/FixtureCard.jsx';
import ProtectedRoute from '../components/ProtectedRoute.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { confirmScore, disputeScore, fetchMyFixtures, submitScore } from '../lib/leagueApi.js';
import { supabase } from '../lib/supabase.js';

function FixturesContent() {
  const { user } = useAuth();
  const [fixtures, setFixtures] = useState([]);
  const [message, setMessage] = useState('');

  async function load() {
    setFixtures(await fetchMyFixtures(user.id));
  }

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`fixtures-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fixtures' }, load)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [user.id]);

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
        <h1 className="text-3xl font-black text-slate-900 dark:text-white">Fixtures</h1>
        <p className="mt-1 text-sm font-semibold text-slate-600 dark:text-slate-400">Host submits. Away confirms or disputes. Evidence stays external.</p>
      </div>
      {message && <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-sm font-semibold text-slate-800 dark:text-slate-300 shadow-lg dark:shadow-xl">{message}</div>}
      <div className="grid gap-4 lg:grid-cols-2">
        {fixtures.map((fixture) => (
          <FixtureCard
            key={fixture.id}
            fixture={fixture}
            userId={user.id}
            onSubmitScore={(item, home, away) => run(() => submitScore(item, home, away), 'Score submitted.')}
            onConfirmScore={(id) => run(() => confirmScore(id), 'Score confirmed.')}
            onDisputeScore={(id, reason) => run(() => disputeScore(id, reason), 'Dispute sent to admin.')}
          />
        ))}
      </div>
      {fixtures.length === 0 && <div className="rounded-xl bg-white dark:bg-slate-900 p-8 text-center text-slate-500 dark:text-slate-400 shadow-lg dark:shadow-xl border border-slate-200 dark:border-slate-700">No fixtures assigned yet.</div>}
    </section>
  );
}

export default function FixturesPage() {
  return <ProtectedRoute><FixturesContent /></ProtectedRoute>;
}
