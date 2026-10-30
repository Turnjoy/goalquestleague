import { Ban, Calendar, Check, Clock, RotateCcw, Search, ShieldAlert, Trophy, UserX, Zap, Crown, Flame, Skull, Sparkles, CalendarDays } from 'lucide-react';
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

// Custom glowing status badge component
function GlowingBadge({ status, children }) {
  const getStatusStyles = () => {
    switch (status?.toLowerCase()) {
      case 'active':
        return 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.3)]';
      case 'suspended':
        return 'bg-amber-100 dark:bg-amber-500/10 text-amber-800 dark:text-amber-400 border-amber-200 dark:border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.3)]';
      case 'banned':
        return 'bg-rose-100 dark:bg-rose-500/10 text-rose-800 dark:text-rose-400 border-rose-200 dark:border-rose-500/30 shadow-[0_0_15px_rgba(244,63,94,0.3)]';
      case 'completed':
        return 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.3)]';
      case 'scheduled':
        return 'bg-blue-100 dark:bg-blue-500/10 text-blue-800 dark:text-blue-400 border-blue-200 dark:border-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.3)]';
      case 'pending_confirmation':
        return 'bg-amber-100 dark:bg-amber-500/10 text-amber-800 dark:text-amber-400 border-amber-200 dark:border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.3)]';
      case 'disputed':
        return 'bg-rose-100 dark:bg-rose-500/10 text-rose-800 dark:text-rose-400 border-rose-200 dark:border-rose-500/30 shadow-[0_0_15px_rgba(244,63,94,0.3)]';
      case 'cancelled':
        return 'bg-slate-100 dark:bg-slate-500/10 text-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-500/30 shadow-[0_0_15px_rgba(100,116,139,0.3)]';
      default:
        return 'bg-slate-100 dark:bg-slate-500/10 text-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-500/30';
    }
  };

  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${getStatusStyles()}`}>
      {children}
    </span>
  );
}

// Glassmorphic card container with proper theme separation
function GlassCard({ children, className = '' }) {
  return (
    <section className={`bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800 shadow-lg dark:shadow-2xl rounded-2xl p-6 ${className}`}>
      {children}
    </section>
  );
}

// Styled input component with dark mode support
function StyledInput({ type = 'text', value, onChange, placeholder, className = '', ...props }) {
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={`bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-transparent rounded-xl p-2.5 text-sm transition-all duration-200 ${className}`}
      {...props}
    />
  );
}

// Styled select component with dark mode support
function StyledSelect({ value, onChange, children, className = '', ...props }) {
  return (
    <select
      value={value}
      onChange={onChange}
      className={`bg-white dark:bg-slate-900 dark:border-slate-700 text-slate-900 dark:text-white border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-transparent rounded-xl p-2.5 text-sm font-bold transition-all duration-200 ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}

// Gradient button component
function GradientButton({ children, onClick, variant = 'primary', className = '', ...props }) {
  const getVariantStyles = () => {
    switch (variant) {
      case 'primary':
        return 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-lg shadow-indigo-500/25';
      case 'success':
        return 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-500/25';
      case 'danger':
        return 'bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white shadow-lg shadow-rose-500/25';
      case 'warning':
        return 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white shadow-lg shadow-amber-500/25';
      case 'info':
        return 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white shadow-lg shadow-blue-500/25';
      default:
        return 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-lg shadow-indigo-500/25';
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-bold rounded-xl transition-all duration-200 active:scale-95 ${getVariantStyles()} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

// Tab navigation component
function TabNav({ activeTab, setActiveTab, tabs }) {
  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => setActiveTab(tab.id)}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 ${
            activeTab === tab.id
              ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/25'
              : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
          }`}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function AdminContent() {
  const [disputes, setDisputes] = useState([]);
  const [players, setPlayers] = useState([]);
  const [bannedUsers, setBannedUsers] = useState([]);
  const [allFixtures, setAllFixtures] = useState([]);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [edits, setEdits] = useState({});
  const [divisionTargets, setDivisionTargets] = useState({});
  const [selectedDivision, setSelectedDivision] = useState('Elite');
  const [activeTab, setActiveTab] = useState('fixtures');
  const [rescheduleModal, setRescheduleModal] = useState({ open: false, fixtureId: null, newDate: '' });
  const [banModal, setBanModal] = useState({ open: false, playerId: null, reason: '', notes: '' });
  const [reinstateModal, setReinstateModal] = useState({ open: false, playerId: null, newDivision: 'Trial' });
  const [seasonStartDate, setSeasonStartDate] = useState('');
  const [calendarPreview, setCalendarPreview] = useState(null);
  const [calendarLoading, setCalendarLoading] = useState(false);

  const tabs = [
    { id: 'fixtures', label: 'Auto Fixtures', icon: <Zap className="h-4 w-4" /> },
    { id: 'fixture-management', label: 'Fixture Management', icon: <Calendar className="h-4 w-4" /> },
    { id: 'season-calendar', label: 'Season Calendar', icon: <CalendarDays className="h-4 w-4" /> },
    { id: 'players', label: 'Player Desk', icon: <Crown className="h-4 w-4" /> },
    { id: 'disputes', label: 'Disputes', icon: <ShieldAlert className="h-4 w-4" /> },
    { id: 'banned', label: 'Banned Desk', icon: <Skull className="h-4 w-4" /> },
  ];

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

  function getDivisionChangeLabel(currentDivision, targetDivision) {
    const currentRank = DIVISION_NAMES.indexOf(currentDivision);
    const targetRank = DIVISION_NAMES.indexOf(targetDivision);
    if (targetRank < currentRank) return `Promote to ${targetDivision}`;
    if (targetRank > currentRank) return `Demote to ${targetDivision}`;
    return `Reassign to ${targetDivision}`;
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
      {/* Header */}
      <div className="text-center mb-6">
        <h1 className="text-3xl md:text-4xl font-black bg-gradient-to-r from-indigo-600 via-violet-600 to-emerald-600 dark:from-indigo-400 dark:via-violet-400 dark:to-emerald-400 bg-clip-text text-transparent mb-2">
          ADMIN COMMAND CENTER
        </h1>
        <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">
          Advanced league management • Real-time controls • Automated systems
        </p>
      </div>

      {/* Success/Error Message */}
      {message && (
        <div className="bg-gradient-to-r from-indigo-50 to-violet-50 dark:from-indigo-500/10 dark:to-violet-500/10 border border-indigo-200 dark:border-indigo-500/30 rounded-xl px-4 py-3 text-sm font-semibold text-indigo-800 dark:text-indigo-300 backdrop-blur-sm">
          {message}
        </div>
      )}

      {/* Tab Navigation */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-2 shadow-lg dark:shadow-xl border border-slate-200 dark:border-slate-700">
        <TabNav activeTab={activeTab} setActiveTab={setActiveTab} tabs={tabs} />
      </div>

      {/* Tab Content */}
      {activeTab === 'fixtures' && (
        <GlassCard>
          <div className="mb-6 flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-black bg-gradient-to-r from-amber-600 to-orange-600 dark:from-amber-400 dark:to-orange-400 bg-clip-text text-transparent">
                Auto-Fixture Generator
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400">AI-powered round-robin scheduling system</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex items-center gap-3">
              <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Target Division:</label>
              <StyledSelect
                value={selectedDivision}
                onChange={(e) => setSelectedDivision(e.target.value)}
                className="min-w-[200px]"
              >
                {DIVISION_NAMES.map((division) => (
                  <option key={division} value={division}>{division}</option>
                ))}
              </StyledSelect>
            </div>
            <GradientButton variant="primary" onClick={handleGenerateFixtures}>
              <Trophy className="h-4 w-4" />
              Generate Round-Robin Fixtures
            </GradientButton>
          </div>
        </GlassCard>
      )}

      {activeTab === 'fixture-management' && (
        <GlassCard>
          <div className="mb-6 flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-xl">
              <Calendar className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-black bg-gradient-to-r from-blue-600 to-cyan-600 dark:from-blue-400 dark:to-cyan-400 bg-clip-text text-transparent">
                Fixture Management & Rescheduling
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400">Complete match schedule control system</p>
            </div>
          </div>
          <div className="overflow-x-auto w-full">
            <table className="w-full min-w-[800px]">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  {['Matchweek', 'Division', 'Matchup', 'Date/Time', 'Status', 'Actions'].map((head) => (
                    <th key={head} className="px-4 py-3 text-left text-xs font-black text-slate-700 dark:text-slate-400 uppercase tracking-wider">
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {allFixtures.slice(0, 20).map((fixture) => (
                  <tr key={fixture.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-4">
                      <span className="font-black text-slate-900 dark:text-white">{fixture.matchweek}</span>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-sm text-slate-700 dark:text-slate-300">{fixture.division}</span>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-black text-slate-900 dark:text-white">{fixture.home_team}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">vs {fixture.away_team}</p>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-sm text-slate-700 dark:text-slate-300">
                        {fixture.fixture_date ? new Date(fixture.fixture_date).toLocaleString() : 'Not scheduled'}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <GlowingBadge status={fixture.status}>{fixture.status}</GlowingBadge>
                    </td>
                    <td className="px-4 py-4">
                      {fixture.status === 'scheduled' && (
                        <GradientButton
                          variant="info"
                          onClick={() => setRescheduleModal({ open: true, fixtureId: fixture.id, newDate: fixture.fixture_date ? new Date(fixture.fixture_date).toISOString().slice(0, 16) : '' })}
                          className="text-xs"
                        >
                          <RotateCcw className="h-3 w-3" />
                          Reschedule
                        </GradientButton>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {allFixtures.length === 0 && (
            <div className="text-center py-8 text-slate-500 dark:text-slate-400">
              <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm font-semibold">No fixtures found in the system</p>
            </div>
          )}
        </GlassCard>
      )}

      {activeTab === 'season-calendar' && (
        <GlassCard>
          <div className="mb-6 flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl">
              <CalendarDays className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-black bg-gradient-to-r from-purple-600 to-pink-600 dark:from-purple-400 dark:to-pink-400 bg-clip-text text-transparent">
                Season Calendar Generator
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400">Automated season scheduling with transfer windows</p>
            </div>
          </div>

          <div className="space-y-6">
            <div className="flex flex-wrap gap-4 items-end">
              <div className="flex-1 min-w-[250px]">
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Select Division</label>
                <StyledSelect
                  value={selectedDivision}
                  onChange={(e) => setSelectedDivision(e.target.value)}
                  className="w-full"
                >
                  {DIVISION_NAMES.map((division) => (
                    <option key={division} value={division}>{division}</option>
                  ))}
                </StyledSelect>
              </div>
              <div className="flex-1 min-w-[250px]">
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Season Start Date</label>
                <StyledInput
                  type="date"
                  value={seasonStartDate}
                  onChange={(e) => setSeasonStartDate(e.target.value)}
                  className="w-full"
                />
              </div>
              <GradientButton
                variant="info"
                onClick={async () => {
                  if (!seasonStartDate) {
                    setMessage('Please select a season start date', 'error');
                    return;
                  }
                  setCalendarLoading(true);
                  try {
                    const { data, error } = await supabase.rpc('calculate_season_calendar', {
                      division_input: selectedDivision,
                      season_start_date_input: seasonStartDate
                    });
                    if (error) throw error;
                    setCalendarPreview(data);
                    setMessage('Calendar calculated successfully. Review below before finalizing.', 'success');
                  } catch (error) {
                    setMessage(error.message || 'Failed to calculate calendar', 'error');
                  } finally {
                    setCalendarLoading(false);
                  }
                }}
                disabled={calendarLoading}
              >
                {calendarLoading ? 'Calculating...' : 'Calculate Calendar'}
              </GradientButton>
            </div>

            {calendarPreview && (
              <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
                <h3 className="text-lg font-black text-slate-900 dark:text-white mb-4">Calendar Preview</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <p className="text-sm text-slate-600 dark:text-slate-400">Season Start Date</p>
                    <p className="font-bold text-slate-900 dark:text-white">{calendarPreview.season_start_date}</p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-slate-600 dark:text-slate-400">Season End Date</p>
                    <p className="font-bold text-slate-900 dark:text-white">{calendarPreview.season_end_date}</p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-slate-600 dark:text-slate-400">Pre-Season Window</p>
                    <p className="font-bold text-slate-900 dark:text-white">
                      {calendarPreview.pre_season_window_start} to {calendarPreview.pre_season_window_end}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-slate-600 dark:text-slate-400">Mid-Season Window</p>
                    <p className="font-bold text-slate-900 dark:text-white">
                      {calendarPreview.mid_season_window_start} to {calendarPreview.mid_season_window_end}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-slate-600 dark:text-slate-400">Total Fixtures</p>
                    <p className="font-bold text-slate-900 dark:text-white">{calendarPreview.total_fixtures}</p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-slate-600 dark:text-slate-400">Expected Duration</p>
                    <p className="font-bold text-slate-900 dark:text-white">{calendarPreview.expected_duration_days} days</p>
                  </div>
                </div>
                <div className="mt-6 flex gap-3">
                  <GradientButton
                    variant="success"
                    onClick={async () => {
                      try {
                        // Insert into season_calendars
                        const { error: calendarError } = await supabase
                          .from('season_calendars')
                          .insert({
                            division: selectedDivision,
                            season_year: new Date().getFullYear(),
                            season_start_date: calendarPreview.season_start_date,
                            season_end_date: calendarPreview.season_end_date,
                            pre_season_window_start: calendarPreview.pre_season_window_start,
                            pre_season_window_end: calendarPreview.pre_season_window_end,
                            mid_season_window_start: calendarPreview.mid_season_window_start,
                            mid_season_window_end: calendarPreview.mid_season_window_end,
                            total_fixtures: calendarPreview.total_fixtures,
                            expected_duration_days: calendarPreview.expected_duration_days,
                            is_finalized: true
                          });
                        if (calendarError) throw calendarError;

                        // Create transfer windows
                        const { error: windowError1 } = await supabase
                          .from('transfer_windows')
                          .insert({
                            division: selectedDivision,
                            season_year: new Date().getFullYear(),
                            window_type: 'pre_season',
                            start_date: calendarPreview.pre_season_window_start,
                            end_date: calendarPreview.pre_season_window_end,
                            is_active: new Date() >= new Date(calendarPreview.pre_season_window_start) && new Date() <= new Date(calendarPreview.pre_season_window_end)
                          });
                        if (windowError1) throw windowError1;

                        const { error: windowError2 } = await supabase
                          .from('transfer_windows')
                          .insert({
                            division: selectedDivision,
                            season_year: new Date().getFullYear(),
                            window_type: 'mid_season',
                            start_date: calendarPreview.mid_season_window_start,
                            end_date: calendarPreview.mid_season_window_end,
                            is_active: false
                          });
                        if (windowError2) throw windowError2;

                        setMessage('Season calendar finalized and transfer windows created!', 'success');
                        setCalendarPreview(null);
                        setSeasonStartDate('');
                      } catch (error) {
                        setMessage(error.message || 'Failed to finalize calendar', 'error');
                      }
                    }}
                  >
                    Finalize & Publish
                  </GradientButton>
                  <GradientButton
                    variant="warning"
                    onClick={() => {
                      setCalendarPreview(null);
                      setMessage('Calendar preview discarded', 'info');
                    }}
                  >
                    Discard
                  </GradientButton>
                </div>
              </div>
            )}
          </div>
        </GlassCard>
      )}

      {activeTab === 'players' && (
        <GlassCard>
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl">
                <Crown className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-black bg-gradient-to-r from-indigo-600 to-violet-600 dark:from-indigo-400 dark:to-violet-400 bg-clip-text text-transparent">
                  Player Management Desk
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-400">Complete player control and oversight</p>
              </div>
            </div>
            <label className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2.5">
              <Search className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              <StyledInput
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  loadPlayers(event.target.value);
                }}
                placeholder="Search players..."
                className="min-w-[200px] bg-transparent border-none focus:ring-0"
              />
            </label>
          </div>
          <div className="overflow-x-auto w-full">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  {['Player', 'Division', 'Approved', 'Status', 'Actions'].map((head) => (
                    <th key={head} className="px-4 py-3 text-left text-xs font-black text-slate-700 dark:text-slate-400 uppercase tracking-wider">
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {players.map((player) => (
                  <tr key={player.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-4">
                      <p className="font-black text-slate-900 dark:text-white">{player.gamertag || player.full_name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{player.email}</p>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-col gap-2">
                        <StyledSelect
                          value={divisionTargets[player.id] ?? player.division}
                          onChange={(event) => setDivisionTargets((current) => ({
                            ...current,
                            [player.id]: event.target.value,
                          }))}
                          className="text-xs"
                          aria-label={`Choose a division for ${player.gamertag || player.full_name}`}
                        >
                          {DIVISION_NAMES.map((division) => (
                            <option key={division} value={division}>{division}</option>
                          ))}
                        </StyledSelect>
                        <GradientButton
                          variant="info"
                          onClick={() => {
                            const targetDivision = divisionTargets[player.id] ?? player.division;
                            if (targetDivision === player.division) return;
                            const changeVerb = DIVISION_NAMES.indexOf(targetDivision) < DIVISION_NAMES.indexOf(player.division)
                              ? 'promoted'
                              : 'demoted';
                            run(
                              () => reassignPlayer(player.id, targetDivision),
                              `Player ${changeVerb} to ${targetDivision}.`,
                            );
                          }}
                          disabled={(divisionTargets[player.id] ?? player.division) === player.division}
                          className="justify-center whitespace-nowrap px-2 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {getDivisionChangeLabel(player.division, divisionTargets[player.id] ?? player.division)}
                        </GradientButton>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`text-xs font-bold ${player.is_approved ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {player.is_approved ? '✓ Approved' : '✗ Pending'}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <GlowingBadge status={player.status}>{player.status}</GlowingBadge>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex min-w-[680px] flex-wrap gap-2">
                        <GradientButton variant="success" onClick={() => run(() => updatePlayerApproval(player.id, true), 'Player approved.')} className="text-xs">
                          <Check className="h-3 w-3" />
                          Approve
                        </GradientButton>
                        <GradientButton variant="warning" onClick={() => run(() => updatePlayerApproval(player.id, false), 'Player rejected.')} className="text-xs">
                          Reject
                        </GradientButton>
                        <StyledInput
                          type="number"
                          min="1"
                          placeholder="Pts"
                          onChange={(e) => setEdit(player.id, 'penalty', e.target.value)}
                          className="w-20 text-xs"
                        />
                        <GradientButton variant="warning" onClick={() => run(() => deductPlayerPoints(player.id, player.division, new Date().getFullYear(), edits[player.id]?.penalty || 1), 'Penalty points applied.')} className="text-xs">
                          <Flame className="h-3 w-3" />
                          Deduct
                        </GradientButton>
                        <GradientButton variant="warning" onClick={() => run(() => updatePlayerStatus(player.id, 'suspended'), 'Player suspended.')} className="text-xs">
                          <Clock className="h-3 w-3" />
                          Suspend
                        </GradientButton>
                        <GradientButton variant="danger" onClick={() => setBanModal({ open: true, playerId: player.id, reason: '', notes: '' })} className="text-xs">
                          <Skull className="h-3 w-3" />
                          Perma-Ban
                        </GradientButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {activeTab === 'disputes' && (
        <GlassCard>
          <div className="mb-6 flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-rose-500 to-pink-600 rounded-xl">
              <ShieldAlert className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-black bg-gradient-to-r from-rose-600 to-pink-600 dark:from-rose-400 dark:to-pink-400 bg-clip-text text-transparent">
                Dispute Resolution Desk
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400">Real-time conflict management and resolution</p>
            </div>
          </div>
          <div className="grid gap-4">
            {disputes.map((fixture) => {
              const draft = edits[fixture.id] || {};
              return (
                <div key={fixture.id} className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-5 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors">
                  <div className="flex flex-wrap justify-between gap-3 mb-4">
                    <div>
                      <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        Matchweek {fixture.matchweek} • {fixture.division}
                      </p>
                      <h3 className="text-lg font-black text-slate-900 dark:text-white">
                        {fixture.home_team} vs {fixture.away_team}
                      </h3>
                      <p className="mt-1 text-sm text-rose-600 dark:text-rose-400">
                        {fixture.dispute_reason || 'No reason provided'}
                      </p>
                    </div>
                    <GlowingBadge status="disputed">DISPUTED</GlowingBadge>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_2fr_auto]">
                    <StyledInput
                      type="number"
                      min="0"
                      placeholder="Home Score"
                      defaultValue={fixture.home_score ?? ''}
                      onChange={(e) => setEdit(fixture.id, 'home', e.target.value)}
                    />
                    <StyledInput
                      type="number"
                      min="0"
                      placeholder="Away Score"
                      defaultValue={fixture.away_score ?? ''}
                      onChange={(e) => setEdit(fixture.id, 'away', e.target.value)}
                    />
                    <StyledInput
                      placeholder="Resolution notes"
                      onChange={(e) => setEdit(fixture.id, 'notes', e.target.value)}
                    />
                    <GradientButton
                      variant="success"
                      onClick={() => run(() => resolveDispute(fixture.id, draft.home ?? fixture.home_score, draft.away ?? fixture.away_score, draft.notes), 'Dispute resolved and standings recalculated.')}
                    >
                      <Check className="h-4 w-4" />
                      Resolve
                    </GradientButton>
                  </div>
                </div>
              );
            })}
            {disputes.length === 0 && (
              <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                <ShieldAlert className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm font-semibold">No disputed matches pending resolution</p>
              </div>
            )}
          </div>
        </GlassCard>
      )}

      {activeTab === 'banned' && (
        <GlassCard>
          <div className="mb-6 flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-rose-600 to-red-700 rounded-xl">
              <Skull className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-black bg-gradient-to-r from-rose-600 to-red-600 dark:from-rose-400 dark:to-red-400 bg-clip-text text-transparent">
                Banned Players Management Desk
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400">Permanent ban records and reinstatement controls</p>
            </div>
          </div>
          <div className="overflow-x-auto w-full">
            <table className="w-full min-w-[800px]">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  {['Player', 'Email', 'Original Division', 'Ban Reason', 'Banned Date', 'Actions'].map((head) => (
                    <th key={head} className="px-4 py-3 text-left text-xs font-black text-slate-700 dark:text-slate-400 uppercase tracking-wider">
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {bannedUsers.map((banned) => (
                  <tr key={banned.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-4">
                      <p className="font-black text-slate-900 dark:text-white">{banned.player_name}</p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-xs text-slate-500 dark:text-slate-400">{banned.player_email}</p>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-sm text-slate-700 dark:text-slate-300">{banned.original_division}</span>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-xs text-rose-600 dark:text-rose-400">{banned.ban_reason || 'Not specified'}</p>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-xs text-slate-500 dark:text-slate-400">{new Date(banned.banned_at).toLocaleDateString()}</span>
                    </td>
                    <td className="px-4 py-4">
                      <GradientButton
                        variant="success"
                        onClick={() => setReinstateModal({ open: true, playerId: banned.player_id, newDivision: banned.original_division })}
                        className="text-xs"
                      >
                        <Sparkles className="h-3 w-3" />
                        Lift Ban
                      </GradientButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {bannedUsers.length === 0 && (
            <div className="text-center py-8 text-slate-500 dark:text-slate-400">
              <Skull className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm font-semibold">No banned players in the system</p>
            </div>
          )}
        </GlassCard>
      )}

      {/* Reschedule Modal */}
      {rescheduleModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/70 backdrop-blur-sm">
          <GlassCard className="w-full max-w-md">
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-xl">
                  <Calendar className="h-5 w-5 text-white" />
                </div>
                <h3 className="text-xl font-black bg-gradient-to-r from-blue-600 to-cyan-600 dark:from-blue-400 dark:to-cyan-400 bg-clip-text text-transparent">
                  Reschedule Fixture
                </h3>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400">Select a new date and time for this fixture</p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">New Date & Time</label>
                <StyledInput
                  type="datetime-local"
                  value={rescheduleModal.newDate}
                  onChange={(e) => setRescheduleModal({ ...rescheduleModal, newDate: e.target.value })}
                  className="w-full"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setRescheduleModal({ open: false, fixtureId: null, newDate: '' })}
                className="px-4 py-2.5 text-sm font-bold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                Cancel
              </button>
              <GradientButton variant="info" onClick={handleRescheduleFixture}>
                <Check className="h-4 w-4" />
                Confirm Reschedule
              </GradientButton>
            </div>
          </GlassCard>
        </div>
      )}

      {/* Ban Modal */}
      {banModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/70 backdrop-blur-sm">
          <GlassCard className="w-full max-w-md">
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-gradient-to-br from-rose-600 to-red-700 rounded-xl">
                  <Skull className="h-5 w-5 text-white" />
                </div>
                <h3 className="text-xl font-black bg-gradient-to-r from-rose-600 to-red-600 dark:from-rose-400 dark:to-red-400 bg-clip-text text-transparent">
                  Permanent Ban Player
                </h3>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                This will permanently ban the player and remove all their participation data from the league system.
              </p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Ban Reason</label>
                <StyledInput
                  type="text"
                  value={banModal.reason}
                  onChange={(e) => setBanModal({ ...banModal, reason: e.target.value })}
                  placeholder="Reason for permanent ban"
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Additional Notes</label>
                <textarea
                  value={banModal.notes}
                  onChange={(e) => setBanModal({ ...banModal, notes: e.target.value })}
                  placeholder="Additional context, evidence, or documentation"
                  rows="3"
                  className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-transparent rounded-xl p-3 text-sm transition-all duration-200 resize-none"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setBanModal({ open: false, playerId: null, reason: '', notes: '' })}
                className="px-4 py-2.5 text-sm font-bold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                Cancel
              </button>
              <GradientButton variant="danger" onClick={handlePermanentBan}>
                <Skull className="h-4 w-4" />
                Confirm Permanent Ban
              </GradientButton>
            </div>
          </GlassCard>
        </div>
      )}

      {/* Reinstate Modal */}
      {reinstateModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/70 backdrop-blur-sm">
          <GlassCard className="w-full max-w-md">
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl">
                  <Sparkles className="h-5 w-5 text-white" />
                </div>
                <h3 className="text-xl font-black bg-gradient-to-r from-emerald-600 to-teal-600 dark:from-emerald-400 dark:to-teal-400 bg-clip-text text-transparent">
                  Lift Ban & Reinstate Player
                </h3>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                This will remove the player from the banned list and reinstate them to a division with full access restored.
              </p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Assign to Division</label>
                <StyledSelect
                  value={reinstateModal.newDivision}
                  onChange={(e) => setReinstateModal({ ...reinstateModal, newDivision: e.target.value })}
                  className="w-full"
                >
                  {DIVISION_NAMES.map((division) => (
                    <option key={division} value={division}>{division}</option>
                  ))}
                </StyledSelect>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setReinstateModal({ open: false, playerId: null, newDivision: 'Trial' })}
                className="px-4 py-2.5 text-sm font-bold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                Cancel
              </button>
              <GradientButton variant="success" onClick={handleLiftBan}>
                <Sparkles className="h-4 w-4" />
                Confirm Reinstatement
              </GradientButton>
            </div>
          </GlassCard>
        </div>
      )}
    </section>
  );
}

export default function AdminPage() {
  return <ProtectedRoute adminOnly><AdminContent /></ProtectedRoute>;
}
