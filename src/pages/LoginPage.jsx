import { LogIn } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { isSupabaseConfigured, supabase } from '../lib/supabase.js';

export default function LoginPage() {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState(() => localStorage.getItem('goalquest.rememberedEmail') || '');
  const [password, setPassword] = useState('');
  const [rememberEmail, setRememberEmail] = useState(() => Boolean(localStorage.getItem('goalquest.rememberedEmail')));
  const [message, setMessage] = useState(searchParams.get('error') === 'unauthorized' ? 'Your account is not approved or active.' : '');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(event) {
    event.preventDefault();
    if (!isSupabaseConfigured) {
      setMessage('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Cloudflare Pages, then redeploy.');
      return;
    }

    setLoading(true);
    setMessage('');

    let result;
    try {
      result = await supabase.auth.signInWithPassword({ email, password });
    } catch (error) {
      setMessage('Could not reach Supabase. Check the deployed environment variables and your Supabase project URL.');
      setLoading(false);
      return;
    }

    const { data, error } = result;
    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_approved,status,is_admin')
      .eq('id', data.user.id)
      .single();

    if (profileError || profile?.is_approved !== true || profile?.status !== 'active') {
      await supabase.auth.signOut();
      setMessage('Your registration is pending approval or your account is inactive.');
      setLoading(false);
      return;
    }

    if (rememberEmail) {
      localStorage.setItem('goalquest.rememberedEmail', email);
    } else {
      localStorage.removeItem('goalquest.rememberedEmail');
    }

    navigate(profile.is_admin ? '/admin' : '/dashboard', { replace: true });
  }

  return (
    <section className="flex min-h-screen items-center justify-center bg-ink px-4 py-8">
      <div className="w-full max-w-md rounded-md bg-white shadow-panel">
        <img src="/goalquest-logo.png" alt="GoalQuest League logo" className="h-52 w-full rounded-t-md object-cover" />
        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          <div>
            <h1 className="text-2xl font-black text-ink">Sign in</h1>
            <p className="mt-1 text-sm font-semibold text-slate-600">Powered by Turnjoy Innovation Services</p>
          </div>
          {message && <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">{message}</div>}
          <label className="block text-sm font-bold text-slate-700">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm font-bold text-slate-700">
            Password
            <input
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
            <input
              type="checkbox"
              checked={rememberEmail}
              onChange={(event) => setRememberEmail(event.target.checked)}
              className="h-4 w-4 accent-pitch"
            />
            Remember email/username
          </label>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex w-full items-center justify-center gap-2 rounded bg-gold px-4 py-3 text-sm font-black text-ink hover:bg-amber-400 disabled:opacity-70"
          >
            <LogIn className="h-4 w-4" />
            {loading ? 'Signing In...' : 'Sign In'}
          </button>
          <p className="text-center text-sm text-slate-600">
            New player? <Link className="font-bold text-pitch" to="/register">Register for approval</Link>
          </p>
          <p className="pt-2 text-center text-xs font-semibold text-slate-500">© GoalQuest League — Powered by Turnjoy Innovation Services</p>
        </form>
      </div>
    </section>
  );
}
