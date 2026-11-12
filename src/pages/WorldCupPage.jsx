import { useState, useEffect } from 'react';
import { Trophy, Globe, Calendar, Users, Flag, BarChart3, Shield } from 'lucide-react';
import {
  getTournament,
  getCountries,
  getGroupAssignments,
  getAllManagerAppointments,
  getFixtures,
  getAllGroupStandings
} from '../lib/tournamentApi.js';

const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

export default function WorldCupPage() {
  const [tournament, setTournament] = useState(null);
  const [countries, setCountries] = useState([]);
  const [groupAssignments, setGroupAssignments] = useState([]);
  const [managerAppointments, setManagerAppointments] = useState([]);
  const [fixtures, setFixtures] = useState([]);
  const [standings, setStandings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    loadTournamentData();
  }, []);

  async function loadTournamentData() {
    setLoading(true);
    setError('');
    try {
      const tournamentData = await getTournament();
      if (!tournamentData) {
        setLoading(false);
        return;
      }
      
      setTournament(tournamentData);
      
      const [countriesData, assignmentsData, appointmentsData, fixturesData, standingsData] = await Promise.all([
        getCountries(tournamentData.id),
        getGroupAssignments(tournamentData.id),
        getAllManagerAppointments(tournamentData.id),
        getFixtures(tournamentData.id),
        getAllGroupStandings(tournamentData.id)
      ]);
      
      setCountries(countriesData);
      setGroupAssignments(assignmentsData);
      setManagerAppointments(appointmentsData);
      setFixtures(fixturesData);
      setStandings(standingsData);
    } catch (err) {
      setError(err?.message || 'Failed to load tournament data.');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-slate-600 dark:text-slate-400">Loading tournament...</p>
        </div>
      </div>
    );
  }

  if (!tournament) {
    if (error) {
      return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center px-4">
          <div className="text-center max-w-md rounded-xl border border-rose-200 dark:border-rose-800 bg-white dark:bg-slate-800 p-6">
            <Globe className="h-14 w-14 text-rose-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
              Elite World Cup 2031/2032
            </h2>
            <p className="text-sm text-rose-600 dark:text-rose-400 mb-4">{error}</p>
            <button
              onClick={loadTournamentData}
              className="px-5 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center max-w-md">
          <Globe className="h-16 w-16 text-slate-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
            Elite World Cup 2031/2032
          </h2>
          <p className="text-slate-600 dark:text-slate-400">
            The tournament has not been initialized yet. Check back later for updates.
          </p>
        </div>
      </div>
    );
  }

  const TABS = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'groups', label: 'Groups', icon: Flag },
    { id: 'fixtures', label: 'Fixtures', icon: Calendar },
    { id: 'standings', label: 'Standings', icon: Trophy },
    { id: 'managers', label: 'Managers', icon: Users }
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="flex items-center gap-4 mb-4">
            <Globe className="h-12 w-12" />
            <div>
              <h1 className="text-3xl md:text-4xl font-bold">Elite World Cup 2031/2032</h1>
              <p className="text-indigo-100">International Tournament</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            <span className="font-medium">
              Status: <span className="font-bold">{tournament.status}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Stats Banner */}
      <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatItem label="Countries" value={countries.length} icon={Flag} />
            <StatItem label="Fixtures" value={fixtures.length} icon={Calendar} />
            <StatItem label="Completed" value={fixtures.filter(f => f.status === 'completed').length} icon={Trophy} />
            <StatItem label="Managers" value={managerAppointments.length} icon={Users} />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-1 overflow-x-auto">
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
                  } flex items-center gap-2 px-4 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap`}
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
          <div className="mb-6 rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20 px-4 py-3 flex items-center justify-between gap-4">
            <p className="text-sm text-rose-700 dark:text-rose-300">{error}</p>
            <button
              onClick={loadTournamentData}
              className="shrink-0 px-3 py-1.5 text-sm font-medium text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-700 rounded-md hover:bg-rose-100 dark:hover:bg-rose-900/40"
            >
              Retry
            </button>
          </div>
        )}
        {activeTab === 'overview' && (
          <OverviewContent 
            tournament={tournament} 
            countries={countries}
            fixtures={fixtures}
            standings={standings}
          />
        )}
        {activeTab === 'groups' && (
          <GroupsContent groupAssignments={groupAssignments} />
        )}
        {activeTab === 'fixtures' && (
          <FixturesContent fixtures={fixtures} />
        )}
        {activeTab === 'standings' && (
          <StandingsContent standings={standings} />
        )}
        {activeTab === 'managers' && (
          <ManagersContent appointments={managerAppointments} />
        )}
      </div>
    </div>
  );
}

function StatItem({ label, value, icon: Icon }) {
  return (
    <div className="flex items-center gap-3">
      <div className="p-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg">
        <Icon className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
        <p className="text-xs text-slate-600 dark:text-slate-400">{label}</p>
      </div>
    </div>
  );
}

function OverviewContent({ tournament, countries, fixtures, standings }) {
  const qualifiedTeams = standings.filter(s => s.advanced).length;
  const completedFixtures = fixtures.filter(f => f.status === 'completed').length;

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Tournament Overview</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white mb-2">Competition Details</h3>
            <dl className="space-y-2 text-sm">
              <Detail label="Name" value={tournament.name} />
              <Detail label="Edition" value={tournament.edition} />
              <Detail label="Status" value={tournament.status} />
              <Detail label="Current Round" value={tournament.current_round || 'Not started'} />
            </dl>
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white mb-2">Progress</h3>
            <dl className="space-y-2 text-sm">
              <Detail label="Participating Countries" value={countries} />
              <Detail label="Total Fixtures" value={fixtures.length} />
              <Detail label="Completed Matches" value={completedFixtures} />
              <Detail label="Qualified for Knockout" value={qualifiedTeams} />
            </dl>
          </div>
        </div>
      </div>

      {tournament.status === 'setup' && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-6">
          <h3 className="font-semibold text-amber-900 dark:text-amber-100 mb-2">
            Tournament in Setup Phase
          </h3>
          <p className="text-sm text-amber-800 dark:text-amber-300">
            The tournament is currently being configured. Group assignments and manager appointments are being finalized.
          </p>
        </div>
      )}
    </div>
  );
}

function GroupsContent({ groupAssignments }) {
  const groups = GROUPS.map(group => ({
    letter: group,
    countries: groupAssignments
      .filter(ga => ga.group_letter === group)
      .map(ga => ga.countries)
      .filter(Boolean)
  })).filter(g => g.countries.length > 0);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {groups.length === 0 ? (
        <div className="col-span-full text-center py-12 text-slate-500 dark:text-slate-400">
          Groups have not been assigned yet.
        </div>
      ) : (
        groups.map(group => (
          <div key={group.letter} className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-3">
              Group {group.letter}
            </h3>
            <div className="space-y-2">
              {group.countries.map(country => (
                <div key={country.id} className="flex items-center gap-2">
                  <span className="text-2xl">{country.flag_emoji}</span>
                  <span className="text-slate-900 dark:text-white">{country.country_name}</span>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function FixturesContent({ fixtures }) {
  const [filter, setFilter] = useState('all');

  const filteredFixtures = fixtures.filter(f => 
    filter === 'all' ? true : f.match_type === filter
  );

  const groupedFixtures = filteredFixtures.reduce((acc, fixture) => {
    const key = fixture.group_letter || fixture.knockout_round || 'other';
    if (!acc[key]) acc[key] = [];
    acc[key].push(fixture);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
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

      {Object.keys(groupedFixtures).length === 0 ? (
        <div className="text-center py-12 text-slate-500 dark:text-slate-400">
          No fixtures available.
        </div>
      ) : (
        Object.entries(groupedFixtures).map(([key, matches]) => (
          <div key={key} className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="font-semibold text-slate-900 dark:text-white">
                {key.startsWith('Group') ? key : key.replace('_', ' ').toUpperCase()}
              </h3>
            </div>
            <div className="divide-y divide-slate-200 dark:divide-slate-700">
              {matches.map(fixture => (
                <FixtureDisplay key={fixture.id} fixture={fixture} />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function StandingsContent({ standings }) {
  const groups = GROUPS.map(group => ({
    letter: group,
    teams: standings.filter(s => s.group_letter === group)
  })).filter(g => g.teams.length > 0);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {groups.length === 0 ? (
        <div className="col-span-full text-center py-12 text-slate-500 dark:text-slate-400">
          No standings available yet.
        </div>
      ) : (
        groups.map(group => (
          <GroupStandings key={group.letter} group={group} />
        ))
      )}
    </div>
  );
}

function ManagersContent({ appointments }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
      <div className="p-6 border-b border-slate-200 dark:border-slate-700">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
          Country Manager Appointments
        </h3>
      </div>
      <div className="divide-y divide-slate-200 dark:divide-slate-700">
        {appointments.length === 0 ? (
          <div className="p-6 text-center text-slate-500 dark:text-slate-400">
            No manager appointments yet.
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
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-600 dark:text-slate-400">{label}</dt>
      <dd className="text-slate-900 dark:text-white font-medium">
        {typeof value === 'number' ? value : value || '-'}
      </dd>
    </div>
  );
}

function FixtureDisplay({ fixture }) {
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
          <span className="font-bold text-slate-900 dark:text-white">
            {fixture.home_score !== null ? fixture.home_score : '-'}
          </span>
          <span className="text-slate-500">-</span>
          <span className="font-bold text-slate-900 dark:text-white">
            {fixture.away_score !== null ? fixture.away_score : '-'}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-1 justify-end">
          <span className="font-medium text-slate-900 dark:text-white">
            {fixture.away_country?.country_name}
          </span>
          <span className="text-xl">{fixture.away_country?.flag_emoji}</span>
        </div>
      </div>
      <div className="ml-4 text-sm text-slate-500 dark:text-slate-400">
        {fixture.fixture_date && new Date(fixture.fixture_date).toLocaleDateString()}
      </div>
    </div>
  );
}

function GroupStandings({ group }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
      <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-3">
        Group {group.letter}
      </h3>
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