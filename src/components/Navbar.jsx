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
    <header className="sticky top-0 z-30 border-b border-white/10 bg-ink text-white shadow-lg">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="flex items-center gap-3">
          <img src="/goalquest-logo.webp" alt="GoalQuest League logo" className="h-12 w-20 rounded object-cover" />
          <div>
            <div className="flex items-center gap-2 text-lg font-black tracking-wide">
              <Trophy className="h-5 w-5 text-gold" />
              GoalQuest League
            </div>
            <p className="text-xs font-semibold uppercase text-gold">Powered by Turnjoy Innovation Services</p>
          </div>
        </div>

        <nav className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={`Switch to ${dark ? 'light' : 'dark'} mode`}
            className="inline-flex items-center gap-2 rounded border border-white/25 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10"
          >
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {dark ? 'Light' : 'Dark'}
          </button>
          {profile && links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `rounded px-3 py-2 text-sm font-semibold transition ${
                  isActive ? 'bg-gold text-ink' : 'text-slate-200 hover:bg-white/10 hover:text-white'
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
                `inline-flex items-center gap-2 rounded px-3 py-2 text-sm font-semibold transition ${
                  isActive ? 'bg-gold text-ink' : 'text-slate-200 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              <Shield className="h-4 w-4" />
              Admin
            </NavLink>
          )}
          {profile ? (
            <button type="button" onClick={handleSignOut} className="rounded border border-white/25 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10">
              Sign Out
            </button>
          ) : (
            <>
              <NavLink to="/login" className="inline-flex items-center gap-2 rounded border border-white/25 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10"><LogIn className="h-4 w-4" /> Login</NavLink>
              <NavLink to="/register" className="inline-flex items-center gap-2 rounded bg-gold px-3 py-2 text-sm font-black text-ink hover:bg-amber-400"><UserPlus className="h-4 w-4" /> Join League</NavLink>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
