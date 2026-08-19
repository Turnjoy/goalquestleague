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
    <section className="space-y-4">
      <div>
        <h1 className="text-3xl font-black">Fixtures</h1>
        <p className="mt-1 text-sm font-semibold text-slate-600">Host submits. Away confirms or disputes. Evidence stays external.</p>
      </div>
      {message && <div className="rounded border border-slate-200 bg-white px-3 py-2 text-sm font-semibold shadow-sm">{message}</div>}
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
      {fixtures.length === 0 && <div className="rounded-md bg-white p-8 text-center text-slate-500 shadow-panel">No fixtures assigned yet.</div>}
    </section>
  );
}

export default function FixturesPage() {
  return <ProtectedRoute><FixturesContent /></ProtectedRoute>;
}
