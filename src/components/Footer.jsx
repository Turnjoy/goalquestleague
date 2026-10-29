import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto flex w-full max-w-7xl flex-col items-center gap-3 px-4 py-5 text-center text-sm font-medium text-slate-600 sm:px-6 lg:px-8">
        <nav aria-label="Public pages" className="flex flex-wrap justify-center gap-4 font-bold">
          <Link to="/">Home</Link>
          <Link to="/leaderboard">Leaderboard</Link>
          <Link to="/rules">Tournament rules</Link>
          <Link to="/register">Registration</Link>
        </nav>
        <p>© GoalQuest League — Powered by Turnjoy Innovation Services</p>
      </div>
    </footer>
  );
}
