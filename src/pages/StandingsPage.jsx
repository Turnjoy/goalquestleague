import { useState } from 'react';
import ProtectedRoute from '../components/ProtectedRoute.jsx';
import StandingsTable from '../components/StandingsTable.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { LEAGUES, TIERS } from '../lib/divisions.js';

function StandingsContent() {
  const { profile } = useAuth();
  // Auto-filter to player's league and division by default
  const [selectedLeague, setSelectedLeague] = useState(profile?.league_name || LEAGUES[0].name);
  const [selectedDivision, setSelectedDivision] = useState(profile?.division || TIERS[0].name);
  
  // If profile loads, auto-select their league/division
  if (profile && (selectedLeague !== (profile.league_name || LEAGUES[0].name) || selectedDivision !== (profile.division || TIERS[0].name))) {
    setSelectedLeague(profile.league_name || LEAGUES[0].name);
    setSelectedDivision(profile.division || TIERS[0].name);
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-slate-900 dark:text-white">Standings</h1>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">
            Your league: <span className="font-black text-pitch">{selectedLeague}</span> · 
            Your division: <span className="font-black text-pitch">{selectedDivision}</span>
          </p>
        </div>
        <div className="mt-3 flex flex-wrap gap-3">
          <select 
            value={selectedLeague} 
            onChange={(event) => setSelectedLeague(event.target.value)} 
            className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-indigo-500"
          >
            {LEAGUES.map((league) => (
              <option key={league.name} value={league.name} className="dark:bg-slate-900 dark:text-white">
                {league.name}
              </option>
            ))}
          </select>
          <select 
            value={selectedDivision} 
            onChange={(event) => setSelectedDivision(event.target.value)} 
            className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-indigo-500"
          >
            {TIERS.map((tier) => (
              <option key={tier.name} value={tier.name} className="dark:bg-slate-900 dark:text-white">
                {tier.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="overflow-x-auto w-full">
        <StandingsTable division={selectedDivision} league={selectedLeague} />
      </div>
    </section>
  );
}

export default function StandingsPage() {
  return <ProtectedRoute><StandingsContent /></ProtectedRoute>;
}
