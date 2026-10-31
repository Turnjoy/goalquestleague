import { UserPlus } from 'lucide-react';
import { useState } from 'react';
import SeoMeta from '../components/SeoMeta.jsx';
import { PUBLIC_SEO } from '../lib/publicSeo.js';
import { Link } from 'react-router-dom';
import { isSupabaseConfigured, supabase } from '../lib/supabase.js';
import { normalizeWhatsAppNumber } from '../lib/whatsappPhone.js';
import { LEAGUES } from '../lib/divisions.js';

const REAL_WORLD_CLUBS = [
  'real madrid', 'manchester united', 'barcelona', 'psg', 'arsenal', 'chelsea',
  'liverpool', 'manchester city', 'bayern munich', 'juventus', 'inter milan',
  'ac milan', 'dortmund', 'atletico madrid', 'napoli', 'rb leipzig', 'benfica',
  'porto', 'ajax', 'sevilla', 'roma', 'lazio', 'athletic bilbao', 'real sociedad',
  'villarreal', 'valencia', 'real betis', 'celtic', 'rangers', 'feyenoord',
  'psv', 'galatasaray', 'fenerbahce', 'olympiacos', 'panathinaikos', 'red star',
  'partizan', 'shakhtar', 'dynamo kyiv', 'salzburg', 'basel', 'club brugge',
  'anderlecht', 'sporting', 'braga', 'wolverhampton', 'leicester', 'west ham',
  'everton', 'tottenham', 'newcastle', 'aston villa', 'crystal palace', 'brighton',
  'brentford', 'fulham', 'nottingham forest', 'bournemouth', 'luton', 'burnley',
  'sheffield united', 'monaco', 'marseille', 'lyon', 'nice', 'lens', 'rennes',
  'lille', 'strasbourg', 'reims', 'nantes', 'montpellier', 'toulouse', 'wolfsburg',
  'leverkusen', 'frankfurt', 'monchengladbach', 'union berlin', 'freiburg', 'mainz',
  'koln', 'hoffenheim', 'werder bremen', 'stuttgart', 'bochum', 'augsburg',
  'darmstadt', 'heidenheim', 'atalanta', 'fiorentina', 'torino', 'bologna',
  'udinese', 'sassuolo', 'empoli', 'lecce', 'verona', 'monza', 'cagliari',
  'genoa', 'frosinone', 'cosenza', 'parma', 'como', 'venezia'
];

export default function RegisterPage() {
  const [form, setForm] = useState({
    email: '',
    password: '',
    gamertag: '',
    manager_handle: '',
    custom_team_name: '',
    full_name: '',
    whatsapp_number: '',
    league_name: 'Apex Football League' // Default to Apex
  });
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState(''); // 'success' or 'error'
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    // Clear error for this field when user starts typing
    if (fieldErrors[field]) {
      setFieldErrors((current) => ({ ...current, [field]: null }));
    }
  }

  function validateForm() {
    const errors = {};

    // Validate full name
    if (!form.full_name.trim()) {
      errors.full_name = 'Full legal name is required';
    }

    // Validate manager handle (username)
    if (!form.manager_handle.trim()) {
      errors.manager_handle = 'Manager handle is required';
    } else if (form.manager_handle.length < 3) {
      errors.manager_handle = 'Manager handle must be at least 3 characters';
    }

    // Validate custom team name and check against blacklist
    if (!form.custom_team_name.trim()) {
      errors.custom_team_name = 'Custom team name is required';
    } else {
      const lowerTeamName = form.custom_team_name.toLowerCase();
      const isBlacklisted = REAL_WORLD_CLUBS.some(club =>
        lowerTeamName.includes(club) || club.includes(lowerTeamName)
      );
      if (isBlacklisted) {
        errors.custom_team_name = 'This team name is not allowed. Please choose a unique custom name.';
      }
    }

    // Validate WhatsApp number
    if (!form.whatsapp_number.trim()) {
      errors.whatsapp_number = 'WhatsApp number is required';
    } else {
      if (!normalizeWhatsAppNumber(form.whatsapp_number)) {
        errors.whatsapp_number = 'Enter a valid international number with its country code, such as +234 801 234 5678.';
      }
    }

    // Validate email
    if (!form.email.trim()) {
      errors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(form.email)) {
      errors.email = 'Please enter a valid email address';
    }

    // Validate password
    if (!form.password) {
      errors.password = 'Password is required';
    } else if (form.password.length < 6) {
      errors.password = 'Password must be at least 6 characters';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!validateForm()) {
      return;
    }

    if (!isSupabaseConfigured) {
      setMessage('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Cloudflare Pages, then redeploy.');
      setMessageType('error');
      return;
    }

    setLoading(true);
    setMessage('');

    // Format WhatsApp number
    const formattedWhatsApp = normalizeWhatsAppNumber(form.whatsapp_number);

    let result;
    try {
      result = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          data: {
            gamertag: form.manager_handle,
            efootball_username: form.manager_handle, // Map manager handle to both fields
            squad_name: form.custom_team_name,
            full_name: form.full_name,
            whatsapp_number: formattedWhatsApp,
            manager_handle: form.manager_handle,
            custom_team_name: form.custom_team_name,
            league_name: form.league_name, // Include selected league
          },
        },
      });
    } catch (error) {
      setMessage('Could not reach Supabase. Check the deployed environment variables and your Supabase project URL.');
      setMessageType('error');
      setLoading(false);
      return;
    }

    const { error } = result;
    if (error) {
      setMessage(error.message);
      setMessageType('error');
      setLoading(false);
      return;
    }

    setMessage('Registration received. An admin must approve your account before league access.');
    setMessageType('success');
    setLoading(false);
  }

  return (
    <section className="flex min-h-screen items-center justify-center bg-frost px-4 py-8">
      <SeoMeta {...PUBLIC_SEO.registration} />
      <form onSubmit={handleSubmit} className="w-full max-w-xl space-y-4 rounded-md border border-slate-200 bg-white p-6 shadow-panel">
        <div className="flex items-center gap-3">
          <img src="/goalquest-logo.webp" alt="GoalQuest League logo" className="h-16 w-24 rounded object-cover" />
          <div>
            <h1 className="text-2xl font-black text-ink">Player registration</h1>
            <p className="text-sm font-semibold text-slate-600">GoalQuest League approval queue</p>
          </div>
        </div>
        {message && (
          <div className={`rounded-xl px-4 py-3 text-sm font-semibold flex items-center gap-2 ${
            messageType === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-400'
              : 'bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-rose-800 dark:text-rose-400'
          }`}>
            {message}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 sm:col-span-2">
            Full Legal Name (for verification & payouts)
            <input
              type="text"
              required
              value={form.full_name}
              onChange={(event) => updateField('full_name', event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Enter your full legal name"
            />
            {fieldErrors.full_name && <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{fieldErrors.full_name}</p>}
          </label>

          <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">
            Manager Handle / Username
            <input
              type="text"
              required
              value={form.manager_handle}
              onChange={(event) => updateField('manager_handle', event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g., TurnjoyBoss"
            />
            {fieldErrors.manager_handle && <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{fieldErrors.manager_handle}</p>}
          </label>

          <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">
            Custom eFootball Team Name
            <input
              type="text"
              required
              value={form.custom_team_name}
              onChange={(event) => updateField('custom_team_name', event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g., Turnjoy FC (NOT Real Madrid)"
            />
            {fieldErrors.custom_team_name && <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{fieldErrors.custom_team_name}</p>}
          </label>

          <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">
            Select League
            <select
              required
              value={form.league_name}
              onChange={(event) => updateField('league_name', event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {LEAGUES.map((league) => (
                <option key={league.name} value={league.name}>
                  {league.name} ({league.tiers} Tiers, {league.maxPlayers} players)
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Players will be allocated to tiers sequentially (Premier → Championship → Division 1-3) within the selected league.</p>
          </label>

          <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 sm:col-span-2">
            International WhatsApp Number
            <input
              type="tel"
              required
              value={form.whatsapp_number}
              onChange={(event) => updateField('whatsapp_number', event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g., +234 801 234 5678 or +1 202 555 0123"
            />
            {fieldErrors.whatsapp_number && <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{fieldErrors.whatsapp_number}</p>}
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Include the country calling code. Formatting spaces, brackets, hyphens, and a leading + are accepted.</p>
          </label>

          <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 sm:col-span-2">
            Email Address
            <input
              type="email"
              required
              value={form.email}
              onChange={(event) => updateField('email', event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="your@email.com"
            />
            {fieldErrors.email && <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{fieldErrors.email}</p>}
          </label>

          <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 sm:col-span-2">
            Password
            <input
              type="password"
              required
              value={form.password}
              onChange={(event) => updateField('password', event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="••••••••"
              minLength={6}
            />
            {fieldErrors.password && <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{fieldErrors.password}</p>}
          </label>
        </div>
        <button type="submit" disabled={loading} className="inline-flex w-full items-center justify-center gap-2 rounded bg-ink px-4 py-3 text-sm font-black text-white hover:bg-navy disabled:opacity-70">
          <UserPlus className="h-4 w-4" />
          {loading ? 'Submitting...' : 'Register'}
        </button>
        <p className="text-center text-sm text-slate-600">
          Already approved? <Link className="font-bold text-pitch" to="/login">Sign in</Link>
        </p>
      </form>
    </section>
  );
}
