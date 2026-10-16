import { ArrowLeft, Mail, CheckCircle, AlertCircle } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { isSupabaseConfigured, supabase } from '../lib/supabase.js';

export default function ForgotPasswordPage() {
  const [step, setStep] = useState('request'); // 'request' or 'verify'
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState(''); // 'success' or 'error'
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  function showMessage(text, type) {
    setMessage(text);
    setMessageType(type);
    setTimeout(() => setMessage(''), 5000);
  }

  async function handleRequestOTP(event) {
    event.preventDefault();
    if (!isSupabaseConfigured) {
      showMessage('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Cloudflare Pages, then redeploy.', 'error');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        showMessage(error.message, 'error');
      } else {
        showMessage('Password reset link sent to your email. Please check your inbox.', 'success');
        setStep('verify');
      }
    } catch (error) {
      showMessage('Could not reach Supabase. Check the deployed environment variables and your Supabase project URL.', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOTP(event) {
    event.preventDefault();
    if (!isSupabaseConfigured) {
      showMessage('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Cloudflare Pages, then redeploy.', 'error');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      // Verify OTP and update password
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        showMessage(error.message, 'error');
      } else {
        showMessage('Password updated successfully. You can now sign in with your new password.', 'success');
        setTimeout(() => navigate('/login'), 2000);
      }
    } catch (error) {
      showMessage('Could not reach Supabase. Check the deployed environment variables and your Supabase project URL.', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="flex min-h-screen items-center justify-center bg-frost dark:bg-slate-900 px-4 py-8">
      <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-lg dark:shadow-xl">
        <div className="mb-6">
          <Link to="/login" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Back to Sign In
          </Link>
        </div>

        <div className="mb-6 flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-xl">
            <Mail className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white">
              {step === 'request' ? 'Reset Password' : 'Verify & Reset'}
            </h1>
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">
              {step === 'request' ? 'Enter your email to receive a reset link' : 'Enter your new password'}
            </p>
          </div>
        </div>

        {message && (
          <div className={`mb-4 rounded-xl px-4 py-3 text-sm font-semibold flex items-center gap-2 ${
            messageType === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-400'
              : 'bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-rose-800 dark:text-rose-400'
          }`}>
            {messageType === 'success' ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            {message}
          </div>
        )}

        {step === 'request' ? (
          <form onSubmit={handleRequestOTP} className="space-y-4">
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">
              Email Address
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="your@email.com"
              />
            </label>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 px-4 py-3 text-sm font-black text-white hover:from-blue-500 hover:to-cyan-500 disabled:opacity-70 shadow-lg shadow-blue-500/25"
            >
              <Mail className="h-4 w-4" />
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOTP} className="space-y-4">
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">
              New Password
              <input
                type="password"
                required
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="••••••••"
                minLength={6}
              />
            </label>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-3 text-sm font-black text-white hover:from-emerald-500 hover:to-teal-500 disabled:opacity-70 shadow-lg shadow-emerald-500/25"
            >
              <CheckCircle className="h-4 w-4" />
              {loading ? 'Updating...' : 'Update Password'}
            </button>
            <button
              type="button"
              onClick={() => setStep('request')}
              className="w-full text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              Back to Email Entry
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-xs font-semibold text-slate-500 dark:text-slate-400">
          © GoalQuest League — Powered by Turnjoy Innovation Services
        </p>
      </div>
    </section>
  );
}
