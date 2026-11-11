import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchStandingsOptions } from '../lib/leagueApi.js';
import StandingsTable from './StandingsTable.jsx';
import Spinner from './Spinner.jsx';

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

function seasonNumber(value) {
  const season = Number(value);
  return Number.isInteger(season) && season >= 2000 && season <= 2200 ? season : null;
}

function matchingOptions(options, league, division) {
  return options.filter(option =>
    (!league || option.league_name === league)
    && (!division || option.division === division),
  );
}

export default function StandingsBrowser({
  initialLeague = '',
  initialDivision = '',
  initialSeason = null,
}) {
  const [options, setOptions] = useState([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [optionsError, setOptionsError] = useState('');
  const [selectedLeague, setSelectedLeague] = useState(initialLeague || '');
  const [selectedDivision, setSelectedDivision] = useState(initialDivision || '');
  const [selectedSeason, setSelectedSeason] = useState(seasonNumber(initialSeason));
  const initialized = useRef(false);

  useEffect(() => {
    let mounted = true;

    async function loadOptions() {
      setLoadingOptions(true);
      setOptionsError('');
      try {
        const data = await fetchStandingsOptions();
        if (mounted) setOptions(data);
      } catch (error) {
        if (mounted) setOptionsError(error instanceof Error ? error.message : 'Unknown error');
      } finally {
        if (mounted) setLoadingOptions(false);
      }
    }

    loadOptions();
    return () => {
      mounted = false;
    };
  }, []);

  const leagues = useMemo(() => uniqueValues(options.map(option => option.league_name)).sort(), [options]);
  const divisions = useMemo(() => uniqueValues(
    options
      .filter(option => !selectedLeague || option.league_name === selectedLeague)
      .map(option => option.division),
  ).sort(), [options, selectedLeague]);
  const seasons = useMemo(() => uniqueValues(
    matchingOptions(options, selectedLeague, selectedDivision).map(option => option.season_year),
  )
    .map(seasonNumber)
    .filter(Boolean)
    .sort((left, right) => right - left), [options, selectedLeague, selectedDivision]);

  useEffect(() => {
    if (initialized.current || options.length === 0) return;
    initialized.current = true;

    const league = leagues.includes(initialLeague) ? initialLeague : '';
    const divisionOptions = uniqueValues(
      options
        .filter(option => !league || option.league_name === league)
        .map(option => option.division),
    );
    const division = divisionOptions.includes(initialDivision) ? initialDivision : '';
    const seasonOptions = uniqueValues(
      matchingOptions(options, league, division).map(option => option.season_year),
    )
      .map(seasonNumber)
      .filter(Boolean)
      .sort((left, right) => right - left);
    const preferredSeason = seasonNumber(initialSeason);

    setSelectedLeague(league);
    setSelectedDivision(division);
    setSelectedSeason(
      seasonOptions.includes(preferredSeason) ? preferredSeason : seasonOptions[0] ?? null,
    );
  }, [initialDivision, initialLeague, initialSeason, leagues, options]);

  useEffect(() => {
    if (!initialized.current || options.length === 0) return;
    if (selectedLeague && !leagues.includes(selectedLeague)) setSelectedLeague('');
    if (selectedDivision && !divisions.includes(selectedDivision)) setSelectedDivision('');
    if (seasons.length > 0 && !seasons.includes(selectedSeason)) setSelectedSeason(seasons[0]);
  }, [divisions, leagues, options.length, seasons, selectedDivision, selectedLeague, selectedSeason]);

  if (loadingOptions) return <Spinner label="Loading standings filters" />;
  if (optionsError) {
    return (
      <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
        Could not load standings filters: {optionsError}. Check your Supabase connection and verify the latest migration is applied.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
          Competition: <span className="text-pitch">GoalQuest League</span>
        </div>
        <label className="text-sm font-bold text-slate-700 dark:text-slate-300">
          League
          <select
            value={selectedLeague}
            onChange={event => {
              setSelectedLeague(event.target.value);
              setSelectedDivision('');
              setSelectedSeason(null);
            }}
            className="mt-1 block rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          >
            <option value="">All leagues</option>
            {leagues.map(league => (
              <option key={league} value={league}>{league}</option>
            ))}
          </select>
        </label>
        <label className="text-sm font-bold text-slate-700 dark:text-slate-300">
          Division
          <select
            value={selectedDivision}
            onChange={event => {
              setSelectedDivision(event.target.value);
              setSelectedSeason(null);
            }}
            className="mt-1 block rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          >
            <option value="">All divisions</option>
            {divisions.map(division => (
              <option key={division} value={division}>{division}</option>
            ))}
          </select>
        </label>
        <label className="text-sm font-bold text-slate-700 dark:text-slate-300">
          Season
          <select
            value={selectedSeason ?? ''}
            onChange={event => setSelectedSeason(seasonNumber(event.target.value))}
            className="mt-1 block rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          >
            {seasons.map(season => (
              <option key={season} value={season}>{season}</option>
            ))}
          </select>
        </label>
      </div>
      <StandingsTable
        division={selectedDivision || undefined}
        league={selectedLeague || undefined}
        season={selectedSeason ?? undefined}
      />
    </div>
  );
}
