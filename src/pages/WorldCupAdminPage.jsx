import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ProtectedRoute from '../components/ProtectedRoute.jsx';
import { 
  Trophy, 
  Users, 
  Calendar, 
  Flag, 
  Settings, 
  Plus,
  Edit,
  Check,
  X,
  Globe,
  Shield,
  Clock,
  Play,
  BarChart3
} from 'lucide-react';
import {
  initializeTournament,
  getTournament,
  getCountries,
  getGroupAssignments,
  assignCountryToGroup,
  getAvailableManagers,
  appointCountryManager,
  getCountryManager,
  getCountryManagerHistory,
  getAllManagerAppointments,
  generateGroupFixtures,
  getFixtures,
  submitFixtureResult,
  getGroupStandings,
  getAllGroupStandings,
  updateTournamentStatus,
  updateTournamentDates,
  generateKnockoutFixtures,
  generateRoundOf16,
  generateQuarterFinals,
  generateSemiFinals,
  generateFinal
} from '../lib/tournamentApi.js';

const TABS = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'groups', label: 'Group Setup', icon: Flag },
  { id: 'managers', label: 'Manager Call-ups', icon: Users },
  { id: 'fixtures', label: 'Fixtures & Results', icon: Calendar },
  { id: 'standings', label: 'Standings', icon: Trophy },
  { id: 'settings', label: 'Tournament Settings', icon: Settings }
];

const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

export default function WorldCupAdminPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');
  const [tournament, setTournament] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    loadTournament();
  }, [refreshKey]);

  async function loadTournament() {
    setLoading(true);
    setError('');
    try {
      const tournamentData = await getTournament();
      setTournament(tournamentData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleInitializeTournament() {
    try {
      await initializeTournament();
      setRefreshKey(prev => prev + 1);
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-slate-600 dark:text-slate-400">Loading tournament data...</p>
        </div>
      </div>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
        {/* Header */}
        <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center gap-3">
                <Globe className="h-8 w-8 text-indigo-600" />
                <div>
                  <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                    Elite World Cup 2031/2032
                  </h1>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Tournament Administration
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigate('/admin')}
                  className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
                >
                  Back to Admin
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Tournament Status Banner */}
        {tournament ? (
          <div className="bg-indigo-50 dark:bg-indigo-900/20 border-b border-indigo-200 dark:border-indigo-800">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                  <span className="text-sm font-medium text-indigo-900 dark:text-indigo-100">
                    Status: <span className="font-bold">{tournament.status}</span>
                  </span>
                </div>
                <div className="flex items-center gap-4 text-sm text-indigo-700 dark:text-indigo-300">
                  <span>Created: {new Date(tournament.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  <span className="text-sm font-medium text-amber-900 dark:text-amber-100">
                    Tournament not initialized
                  </span>
                </div>
                <button
                  onClick={handleInitializeTournament}
                  className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700"
                >
                  Initialize Tournament
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <nav className="flex space-x-1" aria-label="Tabs">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`${
                      activeTab === tab.id
                        ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 border-indigo-500'
                        : 'text-slate-600 dark:text-slate-400 border-transparent hover:bg-slate-50 dark:hover:bg-slate-700'
                    } flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors`}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {error && (
            <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
            </div>
          )}

          {!tournament && activeTab !== 'overview' ? (
            <div className="text-center py-12">
              <Clock className="h-16 w-16 text-slate-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">
                Tournament Not Initialized
              </h3>
              <p className="text-slate-600 dark:text-slate-400 mb-4">
                Please initialize the tournament to access these features.
              </p>
              <button
                onClick={handleInitializeTournament}
                className="px-6 py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700"
              >
                Initialize Tournament
              </button>
            </div>
          ) : (
            <>
              {activeTab === 'overview' && (
                <OverviewTab 
                  tournament={tournament} 
                  onInitialize={handleInitializeTournament}
                  onRefresh={() => setRefreshKey(prev => prev + 1)}
                />
              )}
              {activeTab === 'groups' && tournament && (
                <GroupsTab 
                  tournament={tournament} 
                  onRefresh={() => setRefreshKey(prev => prev + 1)}
                />
              )}
              {activeTab === 'managers' && tournament && (
                <ManagersTab 
                  tournament={tournament} 
                  onRefresh={() => setRefreshKey(prev => prev + 1)}
                />
              )}
              {activeTab === 'fixtures' && tournament && (
                <FixturesTab 
                  tournament={tournament} 
                  onRefresh={() => setRefreshKey(prev => prev + 1)}
                />
              )}
              {activeTab === 'standings' && tournament && (
                <StandingsTab 
                  tournament={tournament} 
                  onRefresh={() => setRefreshKey(prev => prev + 1)}
                />
              )}
              {activeTab === 'settings' && tournament && (
                <SettingsTab 
                  tournament={tournament} 
                  onRefresh={() => setRefreshKey(prev => prev + 1)}
                />
              )}
            </>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}

// Overview Tab Component
function OverviewTab({ tournament, onInitialize, onRefresh }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (tournament) {
      loadSummary();
    }
  }, [tournament]);

  async function loadSummary() {
    setLoading(true);
    try {
      const { getTournamentSummary } = await import('../lib/tournamentApi.js');
      const summaryData = await getTournamentSummary(tournament.id);
      setSummary(summaryData);
    } catch (err) {
      console.error('Failed to load summary:', err);
    } finally {
      setLoading(false);
    }
  }

  if (!tournament) {
    return (
      <div className="text-center py-12">
        <Trophy className="h-16 w-16 text-slate-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">
          Welcome to Elite World Cup Administration
        </h3>
        <p className="text-slate-600 dark:text-slate-400 mb-6 max-w-md mx-auto">
          Initialize the tournament to begin setting up groups, appointing managers, and managing fixtures.
        </p>
        <button
          onClick={onInitialize}
          className="px-6 py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700"
        >
          Initialize Tournament
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard 
          label="Countries" 
          value={summary?.countries || 0} 
          icon={Flag} 
          color="indigo"
        />
        <StatCard 
          label="Total Fixtures" 
          value={summary?.totalFixtures || 0} 
          icon={Calendar} 
          color="green"
        />
        <StatCard 
          label="Completed" 
          value={summary?.completedFixtures || 0} 
          icon={Check} 
          color="emerald"
        />
        <StatCard 
          label="Manager Appointments" 
          value={summary?.managerAppointments || 0} 
          icon={Users} 
          color="blue"
        />
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
          Tournament Details
        </h3>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <DetailItem label="Name" value={tournament.name} />
          <DetailItem label="Edition" value={tournament.edition} />
          <DetailItem label="Status" value={tournament.status} />
          <DetailItem 
            label="Current Round" 
            value={tournament.current_round || 'Not started'} 
          />
          <DetailItem 
            label="Group Stage Start" 
            value={tournament.group_stage_start_date 
              ? new Date(tournament.group_stage_start_date).toLocaleDateString() 
              : 'Not set'} 
          />
          <DetailItem 
            label="Final Date" 
            value={tournament.final_date 
              ? new Date(tournament.final_date).toLocaleDateString() 
              : 'Not set'} 
          />
        </dl>
      </div>
    </div>
  );
}

// Groups Tab Component
function GroupsTab({ tournament, onRefresh }) {
  const [countries, setCountries] = useState([]);
  const [groupAssignments, setGroupAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCountry, setSelectedCountry] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState('');

  useEffect(() => {
    loadData();
  }, [tournament]);

  async function loadData() {
    setLoading(true);
    try {
      const [countriesData, assignmentsData] = await Promise.all([
        getCountries(tournament.id),
        getGroupAssignments(tournament.id)
      ]);
      setCountries(countriesData);
      setGroupAssignments(assignmentsData);
    } catch (err) {
      console.error('Failed to load groups data:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleAssignToGroup() {
    if (!selectedCountry || !selectedGroup) return;
    
    try {
      await assignCountryToGroup(tournament.id, selectedCountry, selectedGroup);
      setSelectedCountry(null);
      setSelectedGroup('');
      await loadData();
      onRefresh();
    } catch (err) {
      alert(`Failed to assign country: ${err.message}`);
    }
  }

  const unassignedCountries = countries.filter(c => !c.group_assignment);

  return (
    <div className="space-y-6">
      {/* Assignment Form */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
          Assign Country to Group
        </h3>
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Select Country
            </label>
            <select
              value={selectedCountry || ''}
              onChange={(e) => setSelectedCountry(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white px-4 py-2"
            >
              <option value="">Choose country...</option>
              {unassignedCountries.map(country => (
                <option key={country.id} value={country.id}>
                  {country.flag_emoji} {country.country_name}
                </option>
              ))}
            </select>
          </div>
          <div className="w-32">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Group
            </label>
            <select
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white px-4 py-2"
            >
              <option value="">Select...</option>
              {GROUPS.map(group => (
                <option key={group} value={group}>Group {group}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={handleAssignToGroup}
              disabled={!selectedCountry || !selectedGroup}
              className="px-6 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Assign
            </button>
          </div>
        </div>
      </div>

      {/* Group Display */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {GROUPS.map(group => {
          const groupCountries = groupAssignments
            .filter(ga => ga.group_letter === group)
            .map(ga => ga.countries);
          
          return (
            <div key={group} className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
              <h4 className="text-lg font-bold text-slate-900 dark:text-white mb-3">
                Group {group}
              </h4>
              <div className="space-y-2">
                {groupCountries.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">No teams assigned</p>
                ) : (
                  groupCountries.map(country => (
                    <div key={country.id} className="flex items-center gap-2 text-sm">
                      <span className="text-2xl">{country.flag_emoji}</span>
                      <span className="text-slate-900 dark:text-white">{country.country_name}</span>
                    </div>
                  ))
                )}
              </div>
              <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {groupCountries.length}/5 teams
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Managers Tab Component
function ManagersTab({ tournament, onRefresh }) {
  const [managers, setManagers] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCountry, setSelectedCountry] = useState(null);
  const [selectedManager, setSelectedManager] = useState(null);
  const [countries, setCountries] = useState([]);

  useEffect(() => {
    loadData();
  }, [tournament]);

  async function loadData() {
    setLoading(true);
    try {
      const [managersData, appointmentsData, countriesData] = await Promise.all([
        getAvailableManagers(),
        getAllManagerAppointments(tournament.id),
        getCountries(tournament.id)
      ]);
      setManagers(managersData);
      setAppointments(appointmentsData);
      setCountries(countriesData);
    } catch (err) {
      console.error('Failed to load managers data:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleAppointManager() {
    if (!selectedCountry || !selectedManager) return;
    
    try {
      await appointCountryManager(tournament.id, selectedCountry, selectedManager);
      setSelectedCountry(null);
      setSelectedManager(null);
      await loadData();
      onRefresh();
    } catch (err) {
      alert(`Failed to appoint manager: ${err.message}`);
    }
  }

  const unassignedCountries = countries.filter(c => 
    !appointments.some(a => a.country_id === c.id)
  );

  return (
    <div className="space-y-6">
      {/* Appointment Form */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
          Appoint Country Manager
        </h3>
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Select Country
            </label>
            <select
              value={selectedCountry || ''}
              onChange={(e) => setSelectedCountry(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white px-4 py-2"
            >
              <option value="">Choose country...</option>
              {unassignedCountries.map(country => (
                <option key={country.id} value={country.id}>
                  {country.flag_emoji} {country.country_name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[250px]">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Select Manager
            </label>
            <select
              value={selectedManager || ''}
              onChange={(e) => setSelectedManager(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white px-4 py-2"
            >
              <option value="">Choose manager...</option>
              {managers.map(manager => {
                const currentAssignment = manager.season_club_assignments?.[0];
                return (
                  <option key={manager.id} value={manager.id}>
                    {manager.manager_handle || manager.gamertag} ({currentAssignment?.league_clubs?.club_name || 'No club'})
                  </option>
                );
              })}
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={handleAppointManager}
              disabled={!selectedCountry || !selectedManager}
              className="px-6 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Appoint
            </button>
          </div>
        </div>
      </div>

      {/* Current Appointments */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            Current Manager Appointments
          </h3>
        </div>
        <div className="divide-y divide-slate-200 dark:divide-slate-700">
          {appointments.length === 0 ? (
            <div className="p-6 text-center text-slate-500 dark:text-slate-400">
              No manager appointments yet
            </div>
          ) : (
            appointments.map(appointment => (
              <div key={appointment.id} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-2xl">{appointment.countries?.flag_emoji}</span>
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white">
                      {appointment.countries?.country_name}
                    </p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      Manager: {appointment.profiles?.manager_handle || appointment.profiles?.gamertag}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-500">
                      Club: {appointment.source_club_name}
                    </p>
                  </div>
                </div>
                <div className="text-right text-sm text-slate-500 dark:text-slate-400">
                  <p>Appointed: {new Date(appointment.appointment_date).toLocaleDateString()}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// Fixtures Tab Component
function FixturesTab({ tournament, onRefresh }) {
  const [fixtures, setFixtures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    loadFixtures();
  }, [tournament, filter]);

  async function loadFixtures() {
    setLoading(true);
    try {
      const fixturesData = await getFixtures(tournament.id, 
        filter === 'all' ? {} : { matchType: filter }
      );
      setFixtures(fixturesData);
    } catch (err) {
      console.error('Failed to load fixtures:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateFixtures() {
    try {
      const count = await generateGroupFixtures(tournament.id);
      alert(`Generated ${count} group stage fixtures`);
      await loadFixtures();
      onRefresh();
    } catch (err) {
      alert(`Failed to generate fixtures: ${err.message}`);
    }
  }

  async function handleGenerateKnockout() {
    try {
      const count = await generateKnockoutFixtures(tournament.id);
      alert(`Generated ${count} opening knockout round fixtures`);
      await loadFixtures();
      onRefresh();
    } catch (err) {
      alert(`Failed to generate knockout fixtures: ${err.message}`);
    }
  }

  async function handleGenerateRoundOf16() {
    try {
      const count = await generateRoundOf16(tournament.id);
      alert(`Generated ${count} round of 16 fixtures`);
      await loadFixtures();
      onRefresh();
    } catch (err) {
      alert(`Failed to generate round of 16: ${err.message}`);
    }
  }

  async function handleGenerateQuarterFinals() {
    try {
      const count = await generateQuarterFinals(tournament.id);
      alert(`Generated ${count} quarter-final fixtures`);
      await loadFixtures();
      onRefresh();
    } catch (err) {
      alert(`Failed to generate quarter-finals: ${err.message}`);
    }
  }

  async function handleGenerateSemiFinals() {
    try {
      const count = await generateSemiFinals(tournament.id);
      alert(`Generated ${count} semi-final fixtures`);
      await loadFixtures();
      onRefresh();
    } catch (err) {
      alert(`Failed to generate semi-finals: ${err.message}`);
    }
  }

  async function handleGenerateFinal() {
    try {
      const count = await generateFinal(tournament.id);
      alert(`Generated ${count} final fixtures`);
      await loadFixtures();
      onRefresh();
    } catch (err) {
      alert(`Failed to generate final: ${err.message}`);
    }
  }

  async function handleSubmitResult(fixtureId, homeScore, awayScore) {
    try {
      await submitFixtureResult(fixtureId, parseInt(homeScore), parseInt(awayScore));
      await loadFixtures();
      onRefresh();
    } catch (err) {
      alert(`Failed to submit result: ${err.message}`);
    }
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div className="flex gap-2">
            {['all', 'group_stage', 'knockout'].map(type => (
              <button
                key={type}
                onClick={() => setFilter(type)}
                className={`px-4 py-2 rounded-lg font-medium ${
                  filter === type
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600'
                }`}
              >
                {type.replace('_', ' ').toUpperCase()}
              </button>
            ))}
          </div>
          <button
            onClick={handleGenerateFixtures}
            className="px-4 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700"
          >
            Generate Group Fixtures
          </button>
        </div>

        {/* Knockout Stage Controls */}
        <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
          <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Knockout Stage Progression</h4>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleGenerateKnockout}
              className="px-3 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700"
            >
              Opening Round
            </button>
            <button
              onClick={handleGenerateRoundOf16}
              className="px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
            >
              Round of 16
            </button>
            <button
              onClick={handleGenerateQuarterFinals}
              className="px-3 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700"
            >
              Quarter-Finals
            </button>
            <button
              onClick={handleGenerateSemiFinals}
              className="px-3 py-2 bg-pink-600 text-white text-sm font-medium rounded-lg hover:bg-pink-700"
            >
              Semi-Finals
            </button>
            <button
              onClick={handleGenerateFinal}
              className="px-3 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700"
            >
              Final
            </button>
          </div>
        </div>
      </div>

      {/* Fixtures List */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            Fixtures ({fixtures.length})
          </h3>
        </div>
        <div className="divide-y divide-slate-200 dark:divide-slate-700">
          {fixtures.length === 0 ? (
            <div className="p-6 text-center text-slate-500 dark:text-slate-400">
              No fixtures yet. Generate group fixtures to get started.
            </div>
          ) : (
            fixtures.map(fixture => (
              <FixtureRow 
                key={fixture.id} 
                fixture={fixture} 
                onSubmitResult={handleSubmitResult}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// Standings Tab Component
function StandingsTab({ tournament, onRefresh }) {
  const [standings, setStandings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStandings();
  }, [tournament]);

  async function loadStandings() {
    setLoading(true);
    try {
      const standingsData = await getAllGroupStandings(tournament.id);
      setStandings(standingsData);
    } catch (err) {
      console.error('Failed to load standings:', err);
    } finally {
      setLoading(false);
    }
  }

  const groups = GROUPS.map(group => ({
    letter: group,
    teams: standings.filter(s => s.group_letter === group)
  })).filter(g => g.teams.length > 0);

  return (
    <div className="space-y-6">
      {groups.length === 0 ? (
        <div className="text-center py-12 text-slate-500 dark:text-slate-400">
          No standings available yet. Complete group stage matches to see standings.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {groups.map(group => (
            <GroupStandings key={group.letter} group={group} />
          ))}
        </div>
      )}
    </div>
  );
}

// Settings Tab Component
function SettingsTab({ tournament, onRefresh }) {
  const [status, setStatus] = useState(tournament.status);
  const [dates, setDates] = useState({
    group_stage_start_date: tournament.group_stage_start_date || '',
    knockout_stage_start_date: tournament.knockout_stage_start_date || '',
    final_date: tournament.final_date || ''
  });
  const [saving, setSaving] = useState(false);

  async function handleSaveSettings() {
    setSaving(true);
    try {
      await updateTournamentStatus(tournament.id, status);
      await updateTournamentDates(tournament.id, dates);
      onRefresh();
      alert('Settings updated successfully');
    } catch (err) {
      alert(`Failed to update settings: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
          Tournament Settings
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Tournament Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white px-4 py-2"
            >
              <option value="setup">Setup</option>
              <option value="group_stage">Group Stage</option>
              <option value="knockout_stage">Knockout Stage</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Group Stage Start Date
            </label>
            <input
              type="datetime-local"
              value={dates.group_stage_start_date}
              onChange={(e) => setDates({...dates, group_stage_start_date: e.target.value})}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white px-4 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Knockout Stage Start Date
            </label>
            <input
              type="datetime-local"
              value={dates.knockout_stage_start_date}
              onChange={(e) => setDates({...dates, knockout_stage_start_date: e.target.value})}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white px-4 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Final Date
            </label>
            <input
              type="datetime-local"
              value={dates.final_date}
              onChange={(e) => setDates({...dates, final_date: e.target.value})}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white px-4 py-2"
            />
          </div>
          <button
            onClick={handleSaveSettings}
            disabled={saving}
            className="w-full px-6 py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Helper Components
function StatCard({ label, value, icon: Icon, color }) {
  const colorClasses = {
    indigo: 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400',
    green: 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400',
    emerald: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400',
    blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">{label}</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{value}</p>
        </div>
        <div className={`p-3 rounded-lg ${colorClasses[color]}`}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
    </div>
  );
}

function DetailItem({ label, value }) {
  return (
    <div>
      <dt className="text-sm font-medium text-slate-600 dark:text-slate-400">{label}</dt>
      <dd className="mt-1 text-sm text-slate-900 dark:text-white">{value}</dd>
    </div>
  );
}

function FixtureRow({ fixture, onSubmitResult }) {
  const [editing, setEditing] = useState(false);
  const [homeScore, setHomeScore] = useState(fixture.home_score || '');
  const [awayScore, setAwayScore] = useState(fixture.away_score || '');

  const handleSubmit = () => {
    if (homeScore === '' || awayScore === '') return;
    onSubmitResult(fixture.id, homeScore, awayScore);
    setEditing(false);
  };

  return (
    <div className="p-4 flex items-center justify-between">
      <div className="flex items-center gap-4 flex-1">
        <div className="flex items-center gap-2 flex-1">
          <span className="text-xl">{fixture.home_country?.flag_emoji}</span>
          <span className="font-medium text-slate-900 dark:text-white">
            {fixture.home_country?.country_name}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <input
                type="number"
                min="0"
                value={homeScore}
                onChange={(e) => setHomeScore(e.target.value)}
                className="w-16 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white px-2 py-1 text-center"
              />
              <span className="text-slate-500">-</span>
              <input
                type="number"
                min="0"
                value={awayScore}
                onChange={(e) => setAwayScore(e.target.value)}
                className="w-16 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white px-2 py-1 text-center"
              />
              <button
                onClick={handleSubmit}
                className="p-1 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded"
              >
                <Check className="h-4 w-4" />
              </button>
              <button
                onClick={() => setEditing(false)}
                className="p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
              >
                <X className="h-4 w-4" />
              </button>
            </>
          ) : (
            <>
              <span className="font-bold text-slate-900 dark:text-white">
                {fixture.home_score !== null ? fixture.home_score : '-'}
              </span>
              <span className="text-slate-500">-</span>
              <span className="font-bold text-slate-900 dark:text-white">
                {fixture.away_score !== null ? fixture.away_score : '-'}
              </span>
              {fixture.status === 'scheduled' && (
                <button
                  onClick={() => setEditing(true)}
                  className="p-1 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded"
                >
                  <Edit className="h-4 w-4" />
                </button>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-2 flex-1 justify-end">
          <span className="font-medium text-slate-900 dark:text-white">
            {fixture.away_country?.country_name}
          </span>
          <span className="text-xl">{fixture.away_country?.flag_emoji}</span>
        </div>
      </div>
      <div className="ml-4 text-sm text-slate-500 dark:text-slate-400">
        {fixture.group_letter && `Group ${fixture.group_letter}`}
        {fixture.knockout_round && ` ${fixture.knockout_round.replace('_', ' ')}`}
      </div>
    </div>
  );
}

function GroupStandings({ group }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
      <h4 className="text-lg font-bold text-slate-900 dark:text-white mb-3">
        Group {group.letter}
      </h4>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-600 dark:text-slate-400">
            <th className="pb-2">#</th>
            <th className="pb-2">Team</th>
            <th className="pb-2 text-center">P</th>
            <th className="pb-2 text-center">W</th>
            <th className="pb-2 text-center">D</th>
            <th className="pb-2 text-center">L</th>
            <th className="pb-2 text-center">GD</th>
            <th className="pb-2 text-center">Pts</th>
          </tr>
        </thead>
        <tbody>
          {group.teams.map((team, index) => (
            <tr key={team.id} className="border-t border-slate-200 dark:border-slate-700">
              <td className="py-2">{index + 1}</td>
              <td className="py-2">
                <div className="flex items-center gap-2">
                  <span>{team.countries?.flag_emoji}</span>
                  <span className="text-slate-900 dark:text-white">{team.countries?.country_name}</span>
                </div>
              </td>
              <td className="py-2 text-center">{team.played}</td>
              <td className="py-2 text-center">{team.won}</td>
              <td className="py-2 text-center">{team.draw}</td>
              <td className="py-2 text-center">{team.lost}</td>
              <td className="py-2 text-center">{team.goal_difference}</td>
              <td className="py-2 text-center font-bold">{team.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}