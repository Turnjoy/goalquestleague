import { useEffect, useState } from 'react';
import { fetchStandings } from '../lib/leagueApi.js';
import { supabase } from '../lib/supabase.js';
import Spinner from './Spinner.jsx';

export default function StandingsTable({ division, league, season }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setLoadError('');
      try {
        const data = await fetchStandings({ division, league, season });
        if (mounted) setRows(data);
      } catch (error) {
        if (mounted) setLoadError(error instanceof Error ? error.message : 'Unknown error');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();

    const channel = supabase
      .channel(`standings-${league || 'all'}-${division || 'all'}-${season || 'current'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'standings' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'league_clubs' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'season_club_assignments' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, load)
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [division, league, season]);

  if (loading) return <Spinner label="Loading live standings" />;
  if (loadError) {
    return (
      <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
        Could not load standings: {loadError}. Check your Supabase connection and verify the latest migration is applied.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg dark:shadow-xl">
      <div className="overflow-x-auto w-full">
        <table className="min-w-[800px] w-full divide-y divide-slate-200 dark:divide-slate-700 text-sm">
          <thead className="bg-slate-900 dark:bg-slate-800 text-white">
            <tr>
              {['#', 'League', 'Division', 'Club', 'Manager', 'P', 'W', 'D', 'L', 'GF', 'GA', 'GD', 'PP', 'Pts', 'Form'].map((head) => (
                <th key={head} className="px-3 py-3 text-left font-bold">
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
            {rows.map((row, index) => {
              const position = index + 1;
              const getPositionColor = (pos) => {
                if (pos >= 1 && pos <= 10) return 'bg-emerald-500 text-white dark:bg-emerald-600';
                if (pos >= 11 && pos <= 18) return 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white';
                if (pos >= 19 && pos <= 20) return 'bg-rose-500 text-white dark:bg-rose-600';
                return 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white';
              };
              return (
                <tr key={row.club_id ?? row.id ?? index} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="px-3 py-3">
                    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm ${getPositionColor(position)}`}>
                      {position}
                    </span>
                  </td>
                  <td className="px-3 py-3 font-bold text-slate-900 dark:text-white">{row.league_name || '-'}</td>
                  <td className="px-3 py-3 text-slate-700 dark:text-slate-300">{row.division_name || row.division || '-'}</td>
                  <td className="px-3 py-3 font-bold text-slate-900 dark:text-white">{row.club_name || row.team_name || 'Unassigned'}</td>
                  <td className="px-3 py-3 font-semibold text-slate-700 dark:text-slate-300">{row.manager_name || row.player_name || 'Unassigned'}</td>
                  <td className="px-3 py-3 text-slate-700 dark:text-slate-300">{row.played ?? 0}</td>
                  <td className="px-3 py-3 text-slate-700 dark:text-slate-300">{row.won ?? 0}</td>
                  <td className="px-3 py-3 text-slate-700 dark:text-slate-300">{row.draw ?? 0}</td>
                  <td className="px-3 py-3 text-slate-700 dark:text-slate-300">{row.lost ?? 0}</td>
                  <td className="px-3 py-3 text-slate-700 dark:text-slate-300">{row.goals_for ?? 0}</td>
                  <td className="px-3 py-3 text-slate-700 dark:text-slate-300">{row.goals_against ?? 0}</td>
                  <td className="px-3 py-3 text-slate-700 dark:text-slate-300">{row.goal_difference ?? 0}</td>
                  <td className="px-3 py-3 text-slate-700 dark:text-slate-300">{row.penalty_points ?? 0}</td>
                  <td className="px-3 py-3 font-black text-pitch">{row.points ?? 0}</td>
                  <td className="px-3 py-3 font-semibold text-slate-700 dark:text-slate-300">{row.form || '-'}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan="15" className="px-3 py-8 text-center text-slate-500 dark:text-slate-400">
                  No configured clubs match these standings filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
