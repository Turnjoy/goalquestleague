import { useState } from 'react';
import ProtectedRoute from '../components/ProtectedRoute.jsx';
import StandingsTable from '../components/StandingsTable.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { DIVISION_NAMES } from '../lib/divisions.js';

function StandingsContent() {
  const { profile } = useAuth();
  const [division, setDivision] = useState(profile.division);
  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-slate-900 dark:text-white">Standings</h1>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">Live division table</p>
          <select 
            value={division} 
            onChange={(event) => setDivision(event.target.value)} 
            className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-indigo-500"
          >
            {DIVISION_NAMES.map((name) => <option key={name} value={name} className="dark:bg-slate-900 dark:text-white">{name}</option>)}
          </select>
        </div>
      </div>
      <div className="overflow-x-auto w-full">
        <StandingsTable division={division} />
      </div>
    </section>
  );
}

export default function StandingsPage() {
  return <ProtectedRoute><StandingsContent /></ProtectedRoute>;
}
