import { Check, LogIn, Menu, Moon, Pencil, Shield, Sun, Trophy, UserPlus, X } from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import NotificationCenter from './NotificationCenter.jsx';
import { supabase } from '../lib/supabase.js';
import { normalizeWhatsAppNumber } from '../lib/whatsappPhone.js';

const links = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/fixtures', label: 'Fixtures' },
  { to: '/standings', label: 'Standings' },
];

const publicLinks = [
  { to: '/world-cup', label: 'World Cup' },
  { to: '/leaderboard', label: 'Leaderboard' },
  { to: '/rules', label: 'Rules' },
];

export default function Navbar() {
  const { user, profile, loadProfile, signOut } = useAuth();
  const navigate = useNavigate();
  const { dark, toggleTheme } = useTheme();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isProfileEditorOpen, setIsProfileEditorOpen] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileNotice, setProfileNotice] = useState('');
  const [profileForm, setProfileForm] = useState({ fullName: '', whatsappNumber: '', email: '' });

  async function handleSignOut() {
    await signOut();
    navigate('/login');
  }

  function closeMobileMenu() {
    setIsMobileMenuOpen(false);
  }

  function openProfileEditor() {
    setProfileForm({
      fullName: profile?.full_name || '',
      whatsappNumber: profile?.whatsapp_number || '',
      email: user?.email || profile?.email || '',
    });
    setProfileNotice('');
    setIsProfileEditorOpen(true);
    closeMobileMenu();
  }

  async function saveProfile(event) {
    event.preventDefault();
    const fullName = profileForm.fullName.trim();
    const whatsappNumber = normalizeWhatsAppNumber(profileForm.whatsappNumber);
    const email = profileForm.email.trim();

    if (!fullName) {
      setProfileNotice('Enter your full legal name.');
      return;
    }
    if (!whatsappNumber) {
      setProfileNotice('Enter a valid international WhatsApp number with its country code.');
      return;
    }
    if (!email) {
      setProfileNotice('Enter your email address.');
      return;
    }

    setSavingProfile(true);
    setProfileNotice('');
    try {
      const { error: profileError } = await supabase.rpc('update_my_profile_contact', {
        full_name_input: fullName,
        whatsapp_number_input: whatsappNumber,
      });
      if (profileError) throw profileError;

      const emailChanged = email.toLowerCase() !== (user.email || '').toLowerCase();
      if (emailChanged) {
        const { error: emailError } = await supabase.auth.updateUser({ email });
        if (emailError) {
          await loadProfile(user.id);
          setProfileNotice(`Name and WhatsApp were saved, but the email could not be updated: ${emailError.message}`);
          return;
        }
      }

      await loadProfile(user.id);
      setProfileNotice(emailChanged
        ? `Name and WhatsApp saved. Complete any email confirmation sent to ${email}.`
        : 'Profile updated.');
    } catch (error) {
      setProfileNotice(`Could not update your profile: ${error.message}`);
    } finally {
      setSavingProfile(false);
    }
  }

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-lg dark:shadow-xl">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="flex items-center justify-between gap-3">
          <img src="/goalquest-logo.webp" alt="GoalQuest League logo" className="h-12 w-20 rounded-xl object-cover" />
          <div>
            <div className="flex items-center gap-2 text-lg font-black tracking-wide">
              <Trophy className="h-5 w-5 text-amber-500 dark:text-amber-400" />
              GoalQuest League
            </div>
            <p className="text-xs font-semibold uppercase text-amber-600 dark:text-amber-400">Powered by Turnjoy Innovation Services</p>
          </div>
          {user && <NotificationCenter userId={user.id} />}
        </div>

        <nav className="flex flex-wrap items-center justify-between gap-4 w-full lg:w-auto">
          {/* Mobile menu toggle button */}
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label="Toggle mobile menu"
            className="lg:hidden inline-flex items-center justify-center rounded-xl border border-slate-300 dark:border-slate-600 p-2 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>

          {/* Desktop navigation */}
          <div className="hidden lg:flex flex-wrap items-center gap-2 w-full lg:w-auto">
            <div className="flex flex-wrap items-center gap-2">
              {publicLinks.map((link) => (
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
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={toggleTheme}
                aria-label={`Switch to ${dark ? 'light' : 'dark'} mode`}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                {dark ? 'Light' : 'Dark'}
              </button>
              {profile ? (
                <>
                  <button
                    type="button"
                    onClick={openProfileEditor}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <Pencil className="h-4 w-4" />
                    Update profile
                  </button>
                <button type="button" onClick={handleSignOut} className="rounded-xl border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                  Sign Out
                </button>
                </>
              ) : (
                <>
                  <NavLink to="/login" className="inline-flex items-center gap-2 rounded-xl border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"><LogIn className="h-4 w-4" /> Login</NavLink>
                  <NavLink to="/register" className="inline-flex items-center gap-2 rounded-xl bg-amber-500 dark:bg-amber-500/20 px-3 py-2 text-sm font-black text-white dark:text-amber-400 hover:bg-amber-600 dark:hover:bg-amber-500/30 transition-colors"><UserPlus className="h-4 w-4" /> Join League</NavLink>
                </>
              )}
            </div>
          </div>

          {/* Mobile menu drawer */}
          {isMobileMenuOpen && (
            <div className="lg:hidden w-full flex flex-col gap-3 py-4 border-t border-slate-200 dark:border-slate-700 mt-4">
              <div className="flex flex-col gap-2">
                {publicLinks.map((link) => (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    onClick={closeMobileMenu}
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
                {profile && links.map((link) => (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    onClick={closeMobileMenu}
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
                    onClick={closeMobileMenu}
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
              </div>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    toggleTheme();
                    closeMobileMenu();
                  }}
                  aria-label={`Switch to ${dark ? 'light' : 'dark'} mode`}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                  {dark ? 'Light' : 'Dark'}
                </button>
                {profile ? (
                  <>
                    <button
                      type="button"
                      onClick={openProfileEditor}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      <Pencil className="h-4 w-4" />
                      Update profile
                    </button>
                    <button type="button" onClick={() => { handleSignOut(); closeMobileMenu(); }} className="rounded-xl border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                      Sign Out
                    </button>
                  </>
                ) : (
                  <>
                    <NavLink to="/login" onClick={closeMobileMenu} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"><LogIn className="h-4 w-4" /> Login</NavLink>
                    <NavLink to="/register" onClick={closeMobileMenu} className="inline-flex items-center gap-2 rounded-xl bg-amber-500 dark:bg-amber-500/20 px-3 py-2 text-sm font-black text-white dark:text-amber-400 hover:bg-amber-600 dark:hover:bg-amber-500/30 transition-colors"><UserPlus className="h-4 w-4" /> Join League</NavLink>
                  </>
                )}
              </div>
            </div>
          )}
        </nav>
      </div>
      {isProfileEditorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" role="presentation">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-editor-title"
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-2xl dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          >
            <div className="flex items-center justify-between gap-4">
              <h2 id="profile-editor-title" className="text-xl font-black">Update profile</h2>
              <button
                type="button"
                onClick={() => setIsProfileEditorOpen(false)}
                aria-label="Close profile editor"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Update your legal name, WhatsApp number, or login email.</p>
            <form className="mt-5 space-y-4" onSubmit={saveProfile}>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">
                Full legal name
                <input
                  type="text"
                  autoComplete="name"
                  required
                  value={profileForm.fullName}
                  onChange={(event) => setProfileForm((current) => ({ ...current, fullName: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                />
              </label>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">
                WhatsApp number
                <input
                  type="tel"
                  autoComplete="tel"
                  required
                  value={profileForm.whatsappNumber}
                  onChange={(event) => setProfileForm((current) => ({ ...current, whatsappNumber: event.target.value }))}
                  placeholder="+234 801 234 5678"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                />
              </label>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">
                Login email
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={profileForm.email}
                  onChange={(event) => setProfileForm((current) => ({ ...current, email: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                />
              </label>
              {profileNotice && <p role="status" className="text-sm font-semibold text-slate-700 dark:text-slate-300">{profileNotice}</p>}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  disabled={savingProfile}
                  onClick={() => setIsProfileEditorOpen(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 dark:border-slate-600 dark:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-black text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Check className="h-4 w-4" />
                  {savingProfile ? 'Saving...' : 'Save profile'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </header>
  );
}
