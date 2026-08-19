import ProtectedRoute from '../components/ProtectedRoute.jsx';
import StandingsTable from '../components/StandingsTable.jsx';
import { useAuth } from '../context/AuthContext.jsx';

function StandingsContent() {
  const { profile } = useAuth();
  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-3xl font-black">Standings</h1>
        <p className="mt-1 text-sm font-semibold text-slate-600">{profile.division} Division live table</p>
      </div>
      <StandingsTable division={profile.division} />
    </section>
  );
}

export default function StandingsPage() {
  return <ProtectedRoute><StandingsContent /></ProtectedRoute>;
}
