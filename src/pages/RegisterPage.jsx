import { UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { isSupabaseConfigured, supabase } from '../lib/supabase.js';

export default function RegisterPage() {
  const [form, setForm] = useState({ email: '', password: '', gamertag: '', efootball_username: '', squad_name: '', full_name: '', whatsapp_number: '' });
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

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
      result = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          data: {
            gamertag: form.gamertag,
            efootball_username: form.efootball_username,
            squad_name: form.squad_name,
            full_name: form.full_name,
            whatsapp_number: form.whatsapp_number,
          },
        },
      });
    } catch (error) {
      setMessage('Could not reach Supabase. Check the deployed environment variables and your Supabase project URL.');
      setLoading(false);
      return;
    }

    const { error } = result;
    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    setMessage('Registration received. An admin must approve your account before league access.');
    setLoading(false);
  }

  return (
    <section className="flex min-h-screen items-center justify-center bg-frost px-4 py-8">
      <form onSubmit={handleSubmit} className="w-full max-w-xl space-y-4 rounded-md border border-slate-200 bg-white p-6 shadow-panel">
        <div className="flex items-center gap-3">
          <img src="/goalquest-logo.webp" alt="GoalQuest League logo" className="h-16 w-24 rounded object-cover" />
          <div>
            <h1 className="text-2xl font-black text-ink">Player registration</h1>
            <p className="text-sm font-semibold text-slate-600">GoalQuest League approval queue</p>
          </div>
        </div>
        {message && <div className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-900">{message}</div>}
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            ['full_name', 'Full name', 'text'],
            ['gamertag', 'Gamertag', 'text'],
            ['efootball_username', 'eFootball username', 'text'],
            ['squad_name', 'Squad / team', 'text'],
            ['whatsapp_number', 'WhatsApp number', 'tel'],
            ['email', 'Email', 'email'],
            ['password', 'Password', 'password'],
          ].map(([field, label, type]) => (
            <label key={field} className={field === 'password' ? 'block text-sm font-bold text-slate-700 sm:col-span-2' : 'block text-sm font-bold text-slate-700'}>
              {label}
              <input
                type={type}
                required
                value={form[field]}
                onChange={(event) => updateField(field, event.target.value)}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              />
            </label>
          ))}
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
