import { Ban, Check, Search, ShieldAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import Badge from '../components/Badge.jsx';
import ProtectedRoute from '../components/ProtectedRoute.jsx';
import {
  deductPlayerPoints,
  fetchDisputedFixtures,
  fetchPlayers,
  resolveDispute,
  updatePlayerApproval,
  updatePlayerStatus,
} from '../lib/leagueApi.js';
import { supabase } from '../lib/supabase.js';

function AdminContent() {
  const [disputes, setDisputes] = useState([]);
  const [players, setPlayers] = useState([]);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [edits, setEdits] = useState({});

  async function loadDisputes() {
    setDisputes(await fetchDisputedFixtures());
  }

  async function loadPlayers(term = search) {
    setPlayers(await fetchPlayers(term));
  }

  useEffect(() => {
    loadDisputes();
    loadPlayers('');
    const channel = supabase
      .channel('admin-desk')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fixtures' }, loadDisputes)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => loadPlayers())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  function setEdit(id, field, value) {
    setEdits((current) => ({ ...current, [id]: { ...current[id], [field]: value } }));
  }

  async function run(action, success) {
    try {
      await action();
      setMessage(success);
      await Promise.all([loadDisputes(), loadPlayers()]);
    } catch (error) {
      setMessage(error.message);
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-black">Admin panel</h1>
        <p className="mt-1 text-sm font-semibold text-slate-600">Disputes, approvals, penalties, and account controls.</p>
      </div>
      {message && <div className="rounded border border-slate-200 bg-white px-3 py-2 text-sm font-semibold shadow-sm">{message}</div>}

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-panel">
        <div className="mb-4 flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-rose-700" />
          <h2 className="text-xl font-black">Dispute Resolution Desk</h2>
        </div>
        <div className="grid gap-4">
          {disputes.map((fixture) => {
            const draft = edits[fixture.id] || {};
            return (
              <div key={fixture.id} className="rounded border border-slate-200 p-4">
                <div className="flex flex-wrap justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-slate-500">Matchweek {fixture.matchweek} · {fixture.division}</p>
                    <h3 className="text-lg font-black">{fixture.home_team} vs {fixture.away_team}</h3>
                    <p className="mt-1 text-sm text-rose-700">{fixture.dispute_reason || 'No reason provided'}</p>
                  </div>
                  <Badge tone="disputed">disputed</Badge>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_2fr_auto]">
                  <input type="number" min="0" placeholder="Home" defaultValue={fixture.home_score ?? ''} onChange={(e) => setEdit(fixture.id, 'home', e.target.value)} className="rounded border border-slate-300 px-3 py-2" />
                  <input type="number" min="0" placeholder="Away" defaultValue={fixture.away_score ?? ''} onChange={(e) => setEdit(fixture.id, 'away', e.target.value)} className="rounded border border-slate-300 px-3 py-2" />
                  <input placeholder="Resolution notes" onChange={(e) => setEdit(fixture.id, 'notes', e.target.value)} className="rounded border border-slate-300 px-3 py-2" />
                  <button
                    type="button"
                    onClick={() => run(() => resolveDispute(fixture.id, draft.home ?? fixture.home_score, draft.away ?? fixture.away_score, draft.notes), 'Dispute resolved and standings recalculated.')}
                    className="inline-flex items-center justify-center gap-2 rounded bg-pitch px-4 py-2 text-sm font-bold text-white"
                  >
                    <Check className="h-4 w-4" />
                    Resolve Dispute
                  </button>
                </div>
              </div>
            );
          })}
          {disputes.length === 0 && <p className="py-6 text-center text-slate-500">No disputed matches.</p>}
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-panel">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-black">Player Management Desk</h2>
          <label className="flex items-center gap-2 rounded border border-slate-300 px-3 py-2">
            <Search className="h-4 w-4 text-slate-500" />
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                loadPlayers(event.target.value);
              }}
              placeholder="Search players"
              className="min-w-0 outline-none"
            />
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-100">
              <tr>
                {['Player', 'Division', 'Approved', 'Status', 'Actions'].map((head) => (
                  <th key={head} className="px-3 py-3 text-left font-black">{head}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {players.map((player) => (
                <tr key={player.id}>
                  <td className="px-3 py-3">
                    <p className="font-black">{player.gamertag || player.full_name}</p>
                    <p className="text-xs text-slate-500">{player.email}</p>
                  </td>
                  <td className="px-3 py-3"><Badge tone={player.division}>{player.division}</Badge></td>
                  <td className="px-3 py-3">{player.is_approved ? 'Yes' : 'No'}</td>
                  <td className="px-3 py-3"><Badge tone={player.status}>{player.status}</Badge></td>
                  <td className="px-3 py-3">
                    <div className="flex min-w-[520px] flex-wrap gap-2">
                      <button type="button" onClick={() => run(() => updatePlayerApproval(player.id, true), 'Player approved.')} className="rounded bg-pitch px-3 py-2 text-xs font-bold text-white">Approve</button>
                      <button type="button" onClick={() => run(() => updatePlayerApproval(player.id, false), 'Player rejected.')} className="rounded bg-slate-700 px-3 py-2 text-xs font-bold text-white">Reject</button>
                      <input type="number" min="1" placeholder="Pts" onChange={(e) => setEdit(player.id, 'penalty', e.target.value)} className="w-20 rounded border border-slate-300 px-2 py-2 text-xs" />
                      <button type="button" onClick={() => run(() => deductPlayerPoints(player.id, player.division, new Date().getFullYear(), edits[player.id]?.penalty || 1), 'Penalty points applied.')} className="rounded bg-amber-600 px-3 py-2 text-xs font-bold text-white">Deduct Points</button>
                      <button type="button" onClick={() => run(() => updatePlayerStatus(player.id, 'suspended'), 'Player suspended.')} className="rounded bg-orange-700 px-3 py-2 text-xs font-bold text-white">Suspend</button>
                      <button type="button" onClick={() => run(() => updatePlayerStatus(player.id, 'banned'), 'Player banned.')} className="inline-flex items-center gap-1 rounded bg-rose-700 px-3 py-2 text-xs font-bold text-white"><Ban className="h-3 w-3" /> Ban Player</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

export default function AdminPage() {
  return <ProtectedRoute adminOnly><AdminContent /></ProtectedRoute>;
}
