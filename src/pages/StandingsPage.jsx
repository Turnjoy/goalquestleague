import { useState } from 'react';
import ProtectedRoute from '../components/ProtectedRoute.jsx';
import StandingsTable from '../components/StandingsTable.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { DIVISION_NAMES } from '../lib/divisions.js';

function StandingsContent() {
  const { profile } = useAuth();
  const [division, setDivision] = useState(profile.division);
  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-3xl font-black">Standings</h1>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <p className="text-sm font-semibold text-slate-600">Live division table</p>
          <select value={division} onChange={(event) => setDivision(event.target.value)} className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-bold">
            {DIVISION_NAMES.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>
      </div>
      <StandingsTable division={division} />
    </section>
  );
}

export default function StandingsPage() {
  return <ProtectedRoute><StandingsContent /></ProtectedRoute>;
}
