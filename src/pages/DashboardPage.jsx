import { Bell, AlertTriangle, Check, Pencil, Trophy, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Badge from '../components/Badge.jsx';
import FixtureCard from '../components/FixtureCard.jsx';
import ProtectedRoute from '../components/ProtectedRoute.jsx';
import StandingsTable from '../components/StandingsTable.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { confirmScore, disputeScore, fetchMyFixtures, fetchStandings, submitScore, fetchUserSquad } from '../lib/leagueApi.js';
import { supabase } from '../lib/supabase.js';
import { normalizeWhatsAppNumber } from '../lib/whatsappPhone.js';

function DashboardContent() {
  const { user, profile, loadProfile } = useAuth();
  const [fixtures, setFixtures] = useState([]);
  const [standing, setStanding] = useState(null);
  const [notice, setNotice] = useState('');
  const [userSquad, setUserSquad] = useState(null);
  const [loadingSquad, setLoadingSquad] = useState(true);
  const [editingProfile, setEditingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileNotice, setProfileNotice] = useState('');
  const [profileForm, setProfileForm] = useState({ fullName: '', whatsappNumber: '', email: '' });

  useEffect(() => {
    setProfileForm({
      fullName: profile?.full_name || '',
      whatsappNumber: profile?.whatsapp_number || '',
      email: user?.email || profile?.email || '',
    });
  }, [profile?.id, user?.id]);

  const pendingForMe = useMemo(
    () => fixtures.filter((fixture) => fixture.away_player_id === user.id && fixture.status === 'pending_confirmation'),
    [fixtures, user.id],
  );

  async function load() {
    const [fixtureRows, standingsRows, squadData] = await Promise.all([
      fetchMyFixtures(user.id),
      fetchStandings(profile.division),
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

  async function saveProfile(event) {
    event.preventDefault();
    const fullName = profileForm.fullName.trim();
    const whatsappNumber = normalizeWhatsAppNumber(profileForm.whatsappNumber);
    const email = profileForm.email.trim();

    if (!fullName) {
      setProfileNotice('Enter your full legal name.');
      return;
    }
    if (!whatsappNumber) {
      setProfileNotice('Enter a valid international WhatsApp number with its country code.');
      return;
    }
    if (!email) {
      setProfileNotice('Enter your email address.');
      return;
    }

    setSavingProfile(true);
    setProfileNotice('');
    try {
      const { error: profileError } = await supabase.rpc('update_my_profile_contact', {
        full_name_input: fullName,
        whatsapp_number_input: whatsappNumber,
      });
      if (profileError) throw profileError;

      const emailChanged = email.toLowerCase() !== (user.email || '').toLowerCase();
      if (emailChanged) {
        const { error: emailError } = await supabase.auth.updateUser({ email });
        if (emailError) {
          await loadProfile(user.id);
          setEditingProfile(false);
          setProfileNotice(`Name and WhatsApp were saved, but the email could not be updated: ${emailError.message}`);
          return;
        }
      }

      await loadProfile(user.id);
      setEditingProfile(false);
      setProfileNotice(emailChanged
        ? `Name and WhatsApp saved. Complete any email confirmation sent to ${email}.`
        : 'Profile updated.');
    } catch (error) {
      setProfileNotice(`Could not update your profile: ${error.message}`);
    } finally {
      setSavingProfile(false);
    }
  }

  function cancelProfileEdit() {
    setProfileForm({
      fullName: profile?.full_name || '',
      whatsappNumber: profile?.whatsapp_number || '',
      email: user?.email || profile?.email || '',
    });
    setProfileNotice('');
    setEditingProfile(false);
  }

  return (
    <div className="space-y-6">
      {/* Squad Registration Notice */}
      {!profile?.squad_locked && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-5 shadow-lg dark:shadow-xl">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-amber-500 dark:bg-amber-500/20 rounded-xl">
              <AlertTriangle className="h-5 w-5 text-white dark:text-amber-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-black text-amber-900 dark:text-amber-400">Register Your Squad</h3>
              <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
                You need to register your squad (22-25 players) before you can participate in league matches.
              </p>
              <Link
                to="/squad-registration"
                className="mt-3 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 px-4 py-2 text-sm font-black text-white hover:from-amber-500 hover:to-orange-500 shadow-lg shadow-amber-500/25"
              >
                <Trophy className="h-4 w-4" />
                Register Squad Now
              </Link>
            </div>
          </div>
        </div>
      )}

      <section className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-lg dark:shadow-xl">
          <img src="/goalquest-logo.webp" alt="GoalQuest League logo" className="mb-4 h-28 w-full rounded-xl object-cover" />
          <p className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400">Player profile</p>
          <h1 className="mt-1 text-2xl font-black text-slate-900 dark:text-white">{profile.manager_handle || profile.gamertag || profile.full_name}</h1>
          <p className="mt-1 text-sm font-semibold text-slate-600 dark:text-slate-400">{profile.custom_team_name || profile.squad_name || 'Independent player'}</p>
          <span className="mt-2 inline-flex rounded-full bg-emerald-100 dark:bg-emerald-500/10 px-2 py-1 text-xs font-black text-emerald-800 dark:text-emerald-400">Verified league profile</span>
          <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-700">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-black text-slate-900 dark:text-white">Contact details</h2>
              {!editingProfile && (
                <button
                  type="button"
                  onClick={() => { setProfileNotice(''); setEditingProfile(true); }}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Update profile
                </button>
              )}
            </div>
            {editingProfile ? (
              <form className="mt-3 space-y-3" onSubmit={saveProfile}>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300">
                  Full legal name
                  <input
                    type="text"
                    autoComplete="name"
                    required
                    value={profileForm.fullName}
                    onChange={(event) => setProfileForm((current) => ({ ...current, fullName: event.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                  />
                </label>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300">
                  WhatsApp number
                  <input
                    type="tel"
                    autoComplete="tel"
                    required
                    value={profileForm.whatsappNumber}
                    onChange={(event) => setProfileForm((current) => ({ ...current, whatsappNumber: event.target.value }))}
                    placeholder="+234 801 234 5678"
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                  />
                </label>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300">
                  Login email
                  <input
                    type="email"
                    autoComplete="email"
                    required
                    value={profileForm.email}
                    onChange={(event) => setProfileForm((current) => ({ ...current, email: event.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                  />
                </label>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={savingProfile}
                    className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-xs font-black text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Check className="h-3.5 w-3.5" />
                    {savingProfile ? 'Saving...' : 'Save profile'}
                  </button>
                  <button
                    type="button"
                    disabled={savingProfile}
                    onClick={cancelProfileEdit}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 dark:border-slate-600 dark:text-slate-200"
                  >
                    <X className="h-3.5 w-3.5" />
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <dl className="mt-3 space-y-2 text-sm">
                <div>
                  <dt className="text-xs font-bold text-slate-500 dark:text-slate-400">Full legal name</dt>
                  <dd className="font-semibold text-slate-900 dark:text-white">{profile.full_name || 'Not provided'}</dd>
                </div>
                <div>
                  <dt className="text-xs font-bold text-slate-500 dark:text-slate-400">WhatsApp</dt>
                  <dd className="font-semibold text-slate-900 dark:text-white">{profile.whatsapp_number || 'Not provided'}</dd>
                </div>
                <div>
                  <dt className="text-xs font-bold text-slate-500 dark:text-slate-400">Login email</dt>
                  <dd className="break-all font-semibold text-slate-900 dark:text-white">{user.email || 'Not provided'}</dd>
                </div>
              </dl>
            )}
            {profileNotice && (
              <p role="status" className="mt-3 text-xs font-semibold text-slate-700 dark:text-slate-300">{profileNotice}</p>
            )}
          </div>
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
                onSubmitScore={(item, home, away) => withNotice(() => submitScore(item, home, away), 'Score submitted for away confirmation.')}
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
