import { useEffect, useState } from 'react';
import { fetchStandings } from '../lib/leagueApi.js';
import { supabase } from '../lib/supabase.js';
import Spinner from './Spinner.jsx';

export default function StandingsTable({ division }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      const data = await fetchStandings(division);
      if (mounted) {
        setRows(data);
        setLoading(false);
      }
    }

    load();

    const channel = supabase
      .channel(`standings-${division || 'all'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'standings' }, load)
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [division]);

  if (loading) return <Spinner label="Loading live standings" />;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg dark:shadow-xl">
      <div className="overflow-x-auto w-full">
        <table className="min-w-[800px] w-full divide-y divide-slate-200 dark:divide-slate-700 text-sm">
          <thead className="bg-slate-900 dark:bg-slate-800 text-white">
            <tr>
              {['#', 'Player', 'Team', 'P', 'W', 'D', 'L', 'GF', 'GA', 'GD', 'PP', 'Pts', 'Form'].map((head) => (
                <th key={head} className="px-3 py-3 text-left font-bold">
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
            {rows.map((row, index) => (
              <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                <td className="px-3 py-3 font-black text-slate-900 dark:text-white">{index + 1}</td>
                <td className="px-3 py-3 font-bold text-slate-900 dark:text-white">{row.player_name}</td>
                <td className="px-3 py-3 text-slate-700 dark:text-slate-300">{row.team_name}</td>
                <td className="px-3 py-3 text-slate-700 dark:text-slate-300">{row.played}</td>
                <td className="px-3 py-3 text-slate-700 dark:text-slate-300">{row.won}</td>
                <td className="px-3 py-3 text-slate-700 dark:text-slate-300">{row.draw}</td>
                <td className="px-3 py-3 text-slate-700 dark:text-slate-300">{row.lost}</td>
                <td className="px-3 py-3 text-slate-700 dark:text-slate-300">{row.goals_for}</td>
                <td className="px-3 py-3 text-slate-700 dark:text-slate-300">{row.goals_against}</td>
                <td className="px-3 py-3 text-slate-700 dark:text-slate-300">{row.goal_difference}</td>
                <td className="px-3 py-3 text-slate-700 dark:text-slate-300">{row.penalty_points}</td>
                <td className="px-3 py-3 font-black text-pitch">{row.points}</td>
                <td className="px-3 py-3 font-semibold text-slate-700 dark:text-slate-300">{row.form || '-'}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan="13" className="px-3 py-8 text-center text-slate-500 dark:text-slate-400">
                  No standings yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
