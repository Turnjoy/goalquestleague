import { ArrowLeft, Lock, CheckCircle, AlertCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { isSupabaseConfigured, supabase } from '../lib/supabase.js';

export default function ResetPasswordPage() {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState(''); // 'success' or 'error'
  const [loading, setLoading] = useState(false);
  const [hasAccessCode, setHasAccessCode] = useState(false);
  const navigate = useNavigate();

  function showMessage(text, type) {
    setMessage(text);
    setMessageType(type);
    setTimeout(() => setMessage(''), 5000);
  }

  useEffect(() => {
    // Check if we have the access code in the URL (from Supabase email link)
    const hash = window.location.hash;
    if (hash && hash.includes('access_token')) {
      setHasAccessCode(true);
    } else {
      showMessage('Invalid or expired reset link. Please request a new password reset.', 'error');
    }
  }, []);

  async function handleResetPassword(event) {
    event.preventDefault();

    if (!isSupabaseConfigured) {
      showMessage('Supabase is not configured. Please contact support.', 'error');
      return;
    }

    if (!hasAccessCode) {
      showMessage('Invalid or expired reset link. Please request a new password reset.', 'error');
      return;
    }

    if (newPassword.length < 6) {
      showMessage('Password must be at least 6 characters long.', 'error');
      return;
    }

    if (newPassword !== confirmPassword) {
      showMessage('Passwords do not match.', 'error');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      // Supabase will automatically extract the access token from the URL
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        showMessage(error.message, 'error');
      } else {
        showMessage('Password updated successfully! Redirecting to login...', 'success');
        setTimeout(() => navigate('/login'), 2000);
      }
    } catch (error) {
      showMessage('Could not update password. Please try again or contact support.', 'error');
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
            <Lock className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white">
              Reset Your Password
            </h1>
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">
              Enter your new password below
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

        {!hasAccessCode && !message && (
          <div className="mb-4 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 px-4 py-3 text-sm font-semibold text-amber-800 dark:text-amber-400">
            Invalid or expired reset link. <Link to="/forgot-password" className="underline hover:text-amber-900 dark:hover:text-amber-300">Request a new one</Link>.
          </div>
        )}

        <form onSubmit={handleResetPassword} className="space-y-4">
          <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">
            New Password
            <input
              type="password"
              required
              minLength={6}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              disabled={!hasAccessCode}
              className="mt-1 w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="••••••••"
            />
          </label>

          <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">
            Confirm New Password
            <input
              type="password"
              required
              minLength={6}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              disabled={!hasAccessCode}
              className="mt-1 w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="••••••••"
            />
          </label>

          <button
            type="submit"
            disabled={loading || !hasAccessCode}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 px-4 py-3 text-sm font-black text-white hover:from-blue-500 hover:to-cyan-500 disabled:opacity-70 shadow-lg shadow-blue-500/25"
          >
            <Lock className="h-4 w-4" />
            {loading ? 'Updating...' : 'Update Password'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Remember your password?{' '}
            <Link to="/login" className="font-bold text-blue-600 dark:text-blue-400 hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}
