import { Ban, Calendar, Check, Clock, RotateCcw, Search, ShieldAlert, Trophy, UserX, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import Badge from '../components/Badge.jsx';
import ProtectedRoute from '../components/ProtectedRoute.jsx';
import {
  deductPlayerPoints,
  fetchDisputedFixtures,
  fetchPlayers,
  reassignPlayer,
  resolveDispute,
  updatePlayerApproval,
  updatePlayerStatus,
  generateFixtures,
  rescheduleFixture,
  permanentBanPlayer,
  liftBan,
  fetchBannedUsers,
  fetchAllFixtures,
} from '../lib/leagueApi.js';
import { DIVISION_NAMES } from '../lib/divisions.js';
import { supabase } from '../lib/supabase.js';

function AdminContent() {
  const [disputes, setDisputes] = useState([]);
  const [players, setPlayers] = useState([]);
  const [bannedUsers, setBannedUsers] = useState([]);
  const [allFixtures, setAllFixtures] = useState([]);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [edits, setEdits] = useState({});
  const [selectedDivision, setSelectedDivision] = useState('Elite');
  const [rescheduleModal, setRescheduleModal] = useState({ open: false, fixtureId: null, newDate: '' });
  const [banModal, setBanModal] = useState({ open: false, playerId: null, reason: '', notes: '' });
  const [reinstateModal, setReinstateModal] = useState({ open: false, playerId: null, newDivision: 'Trial' });

  async function loadDisputes() {
    setDisputes(await fetchDisputedFixtures());
  }

  async function loadPlayers(term = search) {
    setPlayers(await fetchPlayers(term));
  }

  async function loadBannedUsers() {
    setBannedUsers(await fetchBannedUsers());
  }

  async function loadAllFixtures() {
    setAllFixtures(await fetchAllFixtures());
  }

  useEffect(() => {
    loadDisputes();
    loadPlayers('');
    loadBannedUsers();
    loadAllFixtures();
    const channel = supabase
      .channel('admin-desk')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fixtures' }, () => {
        loadDisputes();
        loadAllFixtures();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => loadPlayers())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'banned_users' }, loadBannedUsers)
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
      await Promise.all([loadDisputes(), loadPlayers(), loadBannedUsers(), loadAllFixtures()]);
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function handleGenerateFixtures() {
    try {
      const result = await generateFixtures(null, selectedDivision);
      setMessage(`Generated ${result.fixtures_generated} fixtures for ${result.division} division with ${result.players} players.`);
      await loadAllFixtures();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function handleRescheduleFixture() {
    try {
      await rescheduleFixture(rescheduleModal.fixtureId, new Date(rescheduleModal.newDate).toISOString());
      setMessage('Fixture rescheduled successfully.');
      setRescheduleModal({ open: false, fixtureId: null, newDate: '' });
      await loadAllFixtures();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function handlePermanentBan() {
    try {
      await permanentBanPlayer(banModal.playerId, banModal.reason, banModal.notes);
      setMessage('Player permanently banned and all related records cleaned up.');
      setBanModal({ open: false, playerId: null, reason: '', notes: '' });
      await Promise.all([loadPlayers(), loadBannedUsers(), loadAllFixtures()]);
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function handleLiftBan() {
    try {
      await liftBan(reinstateModal.playerId, reinstateModal.newDivision);
      setMessage('Player ban lifted and reinstated to division.');
      setReinstateModal({ open: false, playerId: null, newDivision: 'Trial' });
      await Promise.all([loadPlayers(), loadBannedUsers()]);
    } catch (error) {
      setMessage(error.message);
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-black">Admin panel</h1>
        <p className="mt-1 text-sm font-semibold text-slate-600">Disputes, approvals, penalties, fixture management, and account controls.</p>
      </div>
      {message && <div className="rounded border border-slate-200 bg-white px-3 py-2 text-sm font-semibold shadow-sm">{message}</div>}

      {/* Auto-Fixture Generator */}
      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-panel">
        <div className="mb-4 flex items-center gap-2">
          <Zap className="h-5 w-5 text-amber-600" />
          <h2 className="text-xl font-black">Auto-Fixture Generator</h2>
        </div>
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-bold text-slate-700">Division:</label>
            <select
              value={selectedDivision}
              onChange={(e) => setSelectedDivision(e.target.value)}
              className="rounded border border-slate-300 px-3 py-2 text-sm font-bold"
            >
              {DIVISION_NAMES.map((division) => (
                <option key={division} value={division}>{division}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={handleGenerateFixtures}
            className="inline-flex items-center gap-2 rounded bg-pitch px-4 py-2 text-sm font-bold text-white hover:bg-navy"
          >
            <Trophy className="h-4 w-4" />
            Generate Round-Robin Fixtures
          </button>
        </div>
      </section>

      {/* Dispute Resolution Desk */}
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

      {/* Fixture Management with Rescheduling */}
      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-panel">
        <div className="mb-4 flex items-center gap-2">
          <Calendar className="h-5 w-5 text-blue-600" />
          <h2 className="text-xl font-black">Fixture Management & Rescheduling</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-100">
              <tr>
                {['Matchweek', 'Division', 'Home vs Away', 'Date/Time', 'Status', 'Actions'].map((head) => (
                  <th key={head} className="px-3 py-3 text-left font-black">{head}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {allFixtures.slice(0, 20).map((fixture) => (
                <tr key={fixture.id}>
                  <td className="px-3 py-3 font-black">{fixture.matchweek}</td>
                  <td className="px-3 py-3">{fixture.division}</td>
                  <td className="px-3 py-3">
                    <p className="font-black">{fixture.home_team} vs {fixture.away_team}</p>
                  </td>
                  <td className="px-3 py-3">
                    {fixture.fixture_date ? new Date(fixture.fixture_date).toLocaleString() : 'Not scheduled'}
                  </td>
                  <td className="px-3 py-3"><Badge tone={fixture.status}>{fixture.status}</Badge></td>
                  <td className="px-3 py-3">
                    {fixture.status === 'scheduled' && (
                      <button
                        type="button"
                        onClick={() => setRescheduleModal({ open: true, fixtureId: fixture.id, newDate: fixture.fixture_date ? new Date(fixture.fixture_date).toISOString().slice(0, 16) : '' })}
                        className="inline-flex items-center gap-1 rounded bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Reschedule
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {allFixtures.length === 0 && <p className="py-6 text-center text-slate-500">No fixtures found.</p>}
      </section>

      {/* Player Management Desk */}
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
                  <td className="px-3 py-3">
                    <select
                      value={player.division}
                      onChange={(event) => run(() => reassignPlayer(player.id, event.target.value), `Player moved to ${event.target.value}.`)}
                      className="rounded border border-slate-300 px-2 py-2 text-xs font-bold"
                    >
                      {DIVISION_NAMES.map((division) => <option key={division} value={division}>{division}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-3">{player.is_approved ? 'Yes' : 'No'}</td>
                  <td className="px-3 py-3"><Badge tone={player.status}>{player.status}</Badge></td>
                  <td className="px-3 py-3">
                    <div className="flex min-w-[640px] flex-wrap gap-2">
                      <button type="button" onClick={() => run(() => updatePlayerApproval(player.id, true), 'Player approved.')} className="rounded bg-pitch px-3 py-2 text-xs font-bold text-white">Approve</button>
                      <button type="button" onClick={() => run(() => updatePlayerApproval(player.id, false), 'Player rejected.')} className="rounded bg-slate-700 px-3 py-2 text-xs font-bold text-white">Reject</button>
                      <input type="number" min="1" placeholder="Pts" onChange={(e) => setEdit(player.id, 'penalty', e.target.value)} className="w-20 rounded border border-slate-300 px-2 py-2 text-xs" />
                      <button type="button" onClick={() => run(() => deductPlayerPoints(player.id, player.division, new Date().getFullYear(), edits[player.id]?.penalty || 1), 'Penalty points applied.')} className="rounded bg-amber-600 px-3 py-2 text-xs font-bold text-white">Deduct Points</button>
                      <button type="button" onClick={() => run(() => updatePlayerStatus(player.id, 'suspended'), 'Player suspended.')} className="rounded bg-orange-700 px-3 py-2 text-xs font-bold text-white">Suspend</button>
                      <button type="button" onClick={() => setBanModal({ open: true, playerId: player.id, reason: '', notes: '' })} className="inline-flex items-center gap-1 rounded bg-rose-700 px-3 py-2 text-xs font-bold text-white hover:bg-rose-800"><UserX className="h-3 w-3" /> Perma-Ban</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Banned Players Management Desk */}
      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-panel">
        <div className="mb-4 flex items-center gap-2">
          <Ban className="h-5 w-5 text-rose-700" />
          <h2 className="text-xl font-black">Banned Players Management Desk</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-100">
              <tr>
                {['Player', 'Email', 'Original Division', 'Ban Reason', 'Banned Date', 'Actions'].map((head) => (
                  <th key={head} className="px-3 py-3 text-left font-black">{head}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {bannedUsers.map((banned) => (
                <tr key={banned.id}>
                  <td className="px-3 py-3 font-black">{banned.player_name}</td>
                  <td className="px-3 py-3 text-xs text-slate-500">{banned.player_email}</td>
                  <td className="px-3 py-3">{banned.original_division}</td>
                  <td className="px-3 py-3 text-xs text-rose-700">{banned.ban_reason || 'Not specified'}</td>
                  <td className="px-3 py-3 text-xs">{new Date(banned.banned_at).toLocaleDateString()}</td>
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      onClick={() => setReinstateModal({ open: true, playerId: banned.player_id, newDivision: banned.original_division })}
                      className="inline-flex items-center gap-1 rounded bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700"
                    >
                      <Check className="h-3 w-3" />
                      Lift Ban / Reinstate
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {bannedUsers.length === 0 && <p className="py-6 text-center text-slate-500">No banned players.</p>}
      </section>

      {/* Reschedule Modal */}
      {rescheduleModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-md bg-white p-6 shadow-panel">
            <h3 className="text-xl font-black">Reschedule Fixture</h3>
            <p className="mt-2 text-sm text-slate-600">Select a new date and time for this fixture.</p>
            <div className="mt-4">
              <label className="block text-sm font-bold text-slate-700">New Date & Time</label>
              <input
                type="datetime-local"
                value={rescheduleModal.newDate}
                onChange={(e) => setRescheduleModal({ ...rescheduleModal, newDate: e.target.value })}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              />
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setRescheduleModal({ open: false, fixtureId: null, newDate: '' })}
                className="rounded border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRescheduleFixture}
                className="rounded bg-pitch px-4 py-2 text-sm font-bold text-white hover:bg-navy"
              >
                Confirm Reschedule
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ban Modal */}
      {banModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-md bg-white p-6 shadow-panel">
            <h3 className="text-xl font-black text-rose-700">Permanent Ban Player</h3>
            <p className="mt-2 text-sm text-slate-600">This will permanently ban the player and remove all their participation data.</p>
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700">Ban Reason</label>
                <input
                  type="text"
                  value={banModal.reason}
                  onChange={(e) => setBanModal({ ...banModal, reason: e.target.value })}
                  placeholder="Reason for ban"
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700">Additional Notes</label>
                <textarea
                  value={banModal.notes}
                  onChange={(e) => setBanModal({ ...banModal, notes: e.target.value })}
                  placeholder="Additional context or evidence"
                  rows="3"
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setBanModal({ open: false, playerId: null, reason: '', notes: '' })}
                className="rounded border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePermanentBan}
                className="rounded bg-rose-700 px-4 py-2 text-sm font-bold text-white hover:bg-rose-800"
              >
                Confirm Permanent Ban
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reinstate Modal */}
      {reinstateModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-md bg-white p-6 shadow-panel">
            <h3 className="text-xl font-black text-emerald-700">Lift Ban & Reinstate Player</h3>
            <p className="mt-2 text-sm text-slate-600">This will remove the player from the banned list and reinstate them to a division.</p>
            <div className="mt-4">
              <label className="block text-sm font-bold text-slate-700">Assign to Division</label>
              <select
                value={reinstateModal.newDivision}
                onChange={(e) => setReinstateModal({ ...reinstateModal, newDivision: e.target.value })}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm font-bold"
              >
                {DIVISION_NAMES.map((division) => (
                  <option key={division} value={division}>{division}</option>
                ))}
              </select>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setReinstateModal({ open: false, playerId: null, newDivision: 'Trial' })}
                className="rounded border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleLiftBan}
                className="rounded bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700"
              >
                Confirm Reinstatement
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default function AdminPage() {
  return <ProtectedRoute adminOnly><AdminContent /></ProtectedRoute>;
}
