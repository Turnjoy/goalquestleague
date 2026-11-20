import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Flag, Trophy, Users } from 'lucide-react';
import { getCupFixtures, getCupParticipants, getCupStandings } from '../lib/cupApi.js';
import { supabase } from '../lib/supabase.js';

const SECTIONS = ['Fixtures', 'Standings', 'Participants'];

export default function CupsPage() {
  const [configs, setConfigs] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [fixtures, setFixtures] = useState([]);
  const [standings, setStandings] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [section, setSection] = useState('Fixtures');
  const [loading, setLoading] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadActiveCups() {
      setLoading(true);
      setError('');
      const { data, error: loadError } = await supabase
        .from('cup_configurations')
        .select('*, cup_competitions (id, name, description)')
        .eq('is_draft', false)
        .order('season_year', { ascending: false })
        .order('created_at', { ascending: false });

      if (loadError) {
        setError(loadError.message || 'Could not load active cups.');
        setLoading(false);
        return;
      }

      const activeConfigs = data || [];
      setConfigs(activeConfigs);
      setSelectedId((current) => activeConfigs.some((config) => config.id === current)
        ? current
        : activeConfigs[0]?.id || '');
      setLoading(false);
    }

    loadActiveCups();
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setFixtures([]);
      setStandings([]);
      setParticipants([]);
      return undefined;
    }

    let cancelled = false;
    setLoadingDetails(true);
    setError('');
    Promise.all([
      getCupFixtures(selectedId),
      getCupStandings(selectedId),
      getCupParticipants(selectedId),
    ]).then(([fixtureRows, standingRows, participantRows]) => {
      if (cancelled) return;
      setFixtures(fixtureRows || []);
      setStandings(standingRows || []);
      setParticipants(participantRows || []);
    }).catch((loadError) => {
      if (!cancelled) setError(loadError?.message || 'Could not load cup details.');
    }).finally(() => {
      if (!cancelled) setLoadingDetails(false);
    });

    return () => { cancelled = true; };
  }, [selectedId]);

  const selectedCup = configs.find((config) => config.id === selectedId);
  const groupedFixtures = useMemo(() => fixtures.reduce((groups, fixture) => {
    const key = fixture.round_name || 'Fixtures';
    groups[key] ||= [];
    groups[key].push(fixture);
    return groups;
  }, {}), [fixtures]);
  const groupedStandings = useMemo(() => standings.reduce((groups, row) => {
    const key = row.group_letter || 'Overall';
    groups[key] ||= [];
    groups[key].push(row);
    return groups;
  }, {}), [standings]);

  return (
    <div className="space-y-6">
      <header className="rounded-2xl bg-gradient-to-r from-indigo-700 to-purple-700 p-6 text-white shadow-lg">
        <div className="flex items-center gap-3">
          <Trophy className="h-9 w-9" />
          <div>
            <h1 className="text-2xl font-black">Cups</h1>
            <p className="text-sm text-indigo-100">Fixtures, standings, and qualified clubs</p>
          </div>
        </div>
      </header>

      {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-300">{error}</p>}

      {loading ? (
        <div className="rounded-xl bg-white p-10 text-center text-slate-500 dark:bg-slate-900 dark:text-slate-400">Loading active cups…</div>
      ) : configs.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center dark:border-slate-700 dark:bg-slate-900">
          <Trophy className="mx-auto mb-3 h-10 w-10 text-slate-400" />
          <p className="font-bold text-slate-800 dark:text-white">No active cups yet</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Active competition fixtures and standings will appear here.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="active-cup" className="text-sm font-bold text-slate-700 dark:text-slate-300">Competition</label>
            <select
              id="active-cup"
              value={selectedId}
              onChange={(event) => setSelectedId(event.target.value)}
              className="min-w-64 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
            >
              {configs.map((config) => (
                <option key={config.id} value={config.id}>
                  {config.cup_competitions?.name || 'Cup'} · {config.season_year}
                </option>
              ))}
            </select>
          </div>

          {selectedCup && (
            <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
              <h2 className="text-xl font-black text-slate-900 dark:text-white">{selectedCup.cup_competitions?.name}</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Season {selectedCup.season_year}{selectedCup.cup_competitions?.description ? ` · ${selectedCup.cup_competitions.description}` : ''}</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <Summary icon={CalendarDays} label="Fixtures" value={fixtures.length} />
                <Summary icon={Flag} label="Completed" value={fixtures.filter((fixture) => fixture.status === 'completed').length} />
                <Summary icon={Users} label="Clubs" value={participants.length} />
              </div>
            </section>
          )}

          <nav className="flex gap-2 overflow-x-auto" aria-label="Cup information">
            {SECTIONS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setSection(item)}
                className={`rounded-lg px-4 py-2 text-sm font-bold ${section === item ? 'bg-indigo-600 text-white' : 'border border-slate-300 bg-white text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300'}`}
              >
                {item}
              </button>
            ))}
          </nav>

          {loadingDetails ? (
            <div className="rounded-xl bg-white p-8 text-center text-slate-500 dark:bg-slate-900 dark:text-slate-400">Loading competition details…</div>
          ) : section === 'Fixtures' ? (
            <div className="space-y-4">
              {Object.entries(groupedFixtures).length === 0 ? <EmptyState>No fixtures have been generated for this cup yet.</EmptyState> : Object.entries(groupedFixtures).map(([round, rows]) => (
                <section key={round} className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                  <h3 className="border-b border-slate-200 px-4 py-3 font-black text-slate-900 dark:border-slate-700 dark:text-white">{round}</h3>
                  <div className="divide-y divide-slate-200 dark:divide-slate-700">
                    {rows.map((fixture) => <CupFixture key={fixture.id} fixture={fixture} />)}
                  </div>
                </section>
              ))}
            </div>
          ) : section === 'Standings' ? (
            <div className="grid gap-4 md:grid-cols-2">
              {Object.entries(groupedStandings).length === 0 ? <EmptyState>Standings will appear when this cup has them.</EmptyState> : Object.entries(groupedStandings).map(([group, rows]) => (
                <section key={group} className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                  <h3 className="mb-3 font-black text-slate-900 dark:text-white">{group === 'Overall' ? group : `Group ${group}`}</h3>
                  <table className="w-full min-w-[420px] text-left text-sm">
                    <thead className="text-xs uppercase text-slate-500"><tr>{['#', 'Club', 'P', 'W', 'D', 'L', 'GD', 'Pts'].map((heading) => <th key={heading} className="px-2 py-2">{heading}</th>)}</tr></thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {rows.map((row, index) => <tr key={row.id}>
                        <td className="px-2 py-2 font-bold">{row.position || index + 1}</td>
                        <td className="px-2 py-2 font-semibold">{row.league_clubs?.club_name || 'Club'}</td>
                        <td className="px-2 py-2">{row.played}</td><td className="px-2 py-2">{row.won}</td><td className="px-2 py-2">{row.draw}</td><td className="px-2 py-2">{row.lost}</td><td className="px-2 py-2">{row.goal_difference}</td><td className="px-2 py-2 font-black">{row.points}</td>
                      </tr>)}
                    </tbody>
                  </table>
                </section>
              ))}
            </div>
          ) : (
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {participants.length === 0 ? <EmptyState>No qualified clubs are listed yet.</EmptyState> : participants.map((participant) => (
                <article key={participant.id} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                  <p className="font-bold text-slate-900 dark:text-white">{participant.league_clubs?.club_name || 'Club'}</p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{participant.group_assignment ? `Group ${participant.group_assignment} · ` : ''}{participant.league_clubs?.league_name} · {participant.league_clubs?.division}</p>
                </article>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Summary({ icon: Icon, label, value }) {
  return <div className="flex items-center gap-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800"><Icon className="h-5 w-5 text-indigo-600 dark:text-indigo-400" /><div><p className="font-black text-slate-900 dark:text-white">{value}</p><p className="text-xs text-slate-500 dark:text-slate-400">{label}</p></div></div>;
}

function CupFixture({ fixture }) {
  return <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
    <span className="font-semibold text-slate-900 dark:text-white">{fixture.home_club?.club_name || 'TBD'}</span>
    <span className="rounded-lg bg-slate-100 px-3 py-1 font-black text-slate-800 dark:bg-slate-800 dark:text-white">{fixture.home_score ?? '-'} : {fixture.away_score ?? '-'}</span>
    <span className="font-semibold text-slate-900 dark:text-white">{fixture.away_club?.club_name || 'TBD'}</span>
    <span className="text-xs capitalize text-slate-500 dark:text-slate-400">{fixture.status?.replaceAll('_', ' ')}</span>
  </div>;
}

function EmptyState({ children }) {
  return <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">{children}</p>;
}
