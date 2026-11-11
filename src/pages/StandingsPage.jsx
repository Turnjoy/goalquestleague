import ProtectedRoute from '../components/ProtectedRoute.jsx';
import StandingsBrowser from '../components/StandingsBrowser.jsx';
import { useAuth } from '../context/AuthContext.jsx';

function StandingsContent() {
  const { profile } = useAuth();

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-slate-900 dark:text-white">Standings</h1>
        <p className="mt-1 text-sm font-semibold text-slate-600 dark:text-slate-400">
          Every configured club is listed for the selected competition, league, division, and season.
        </p>
      </div>
      <StandingsBrowser
        initialLeague={profile?.league_name || ''}
        initialDivision={profile?.division || ''}
      />
    </section>
  );
}

export default function StandingsPage() {
  return <ProtectedRoute><StandingsContent /></ProtectedRoute>;
}
