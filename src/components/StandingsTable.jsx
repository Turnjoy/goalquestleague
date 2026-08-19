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
    <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-panel">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-ink text-white">
            <tr>
              {['#', 'Player', 'Team', 'P', 'W', 'D', 'L', 'GF', 'GA', 'GD', 'PP', 'Pts', 'Form'].map((head) => (
                <th key={head} className="px-3 py-3 text-left font-bold">
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, index) => (
              <tr key={row.id} className="hover:bg-slate-50">
                <td className="px-3 py-3 font-black">{index + 1}</td>
                <td className="px-3 py-3 font-bold">{row.player_name}</td>
                <td className="px-3 py-3">{row.team_name}</td>
                <td className="px-3 py-3">{row.played}</td>
                <td className="px-3 py-3">{row.won}</td>
                <td className="px-3 py-3">{row.draw}</td>
                <td className="px-3 py-3">{row.lost}</td>
                <td className="px-3 py-3">{row.goals_for}</td>
                <td className="px-3 py-3">{row.goals_against}</td>
                <td className="px-3 py-3">{row.goal_difference}</td>
                <td className="px-3 py-3">{row.penalty_points}</td>
                <td className="px-3 py-3 font-black text-pitch">{row.points}</td>
                <td className="px-3 py-3 font-semibold">{row.form || '-'}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan="13" className="px-3 py-8 text-center text-slate-500">
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
