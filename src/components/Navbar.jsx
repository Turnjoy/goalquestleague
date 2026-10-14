import { LogIn, Moon, Shield, Sun, Trophy, UserPlus } from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';

const links = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/fixtures', label: 'Fixtures' },
  { to: '/standings', label: 'Standings' },
];

export default function Navbar() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const { dark, toggleTheme } = useTheme();

  async function handleSignOut() {
    await signOut();
    navigate('/login');
  }

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-lg dark:shadow-xl">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="flex items-center gap-3">
          <img src="/goalquest-logo.webp" alt="GoalQuest League logo" className="h-12 w-20 rounded-xl object-cover" />
          <div>
            <div className="flex items-center gap-2 text-lg font-black tracking-wide">
              <Trophy className="h-5 w-5 text-amber-500 dark:text-amber-400" />
              GoalQuest League
            </div>
            <p className="text-xs font-semibold uppercase text-amber-600 dark:text-amber-400">Powered by Turnjoy Innovation Services</p>
          </div>
        </div>

        <nav className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={`Switch to ${dark ? 'light' : 'dark'} mode`}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {dark ? 'Light' : 'Dark'}
          </button>
          {profile && links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `rounded-xl px-3 py-2 text-sm font-semibold transition ${
                  isActive 
                    ? 'bg-amber-500 dark:bg-amber-500/20 text-white dark:text-amber-400' 
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
          {profile?.is_admin && (
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                  isActive 
                    ? 'bg-amber-500 dark:bg-amber-500/20 text-white dark:text-amber-400' 
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`
              }
            >
              <Shield className="h-4 w-4" />
              Admin
            </NavLink>
          )}
          {profile ? (
            <button type="button" onClick={handleSignOut} className="rounded-xl border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              Sign Out
            </button>
          ) : (
            <>
              <NavLink to="/login" className="inline-flex items-center gap-2 rounded-xl border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"><LogIn className="h-4 w-4" /> Login</NavLink>
              <NavLink to="/register" className="inline-flex items-center gap-2 rounded-xl bg-amber-500 dark:bg-amber-500/20 px-3 py-2 text-sm font-black text-white dark:text-amber-400 hover:bg-amber-600 dark:hover:bg-amber-500/30 transition-colors"><UserPlus className="h-4 w-4" /> Join League</NavLink>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
