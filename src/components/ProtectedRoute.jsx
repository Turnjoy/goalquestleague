import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { supabase } from '../lib/supabase.js';
import Spinner from './Spinner.jsx';

export default function ProtectedRoute({ adminOnly = false, children }) {
  const { loading, session, profile, loadProfile } = useAuth();
  const [checking, setChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [redirectTo, setRedirectTo] = useState(null);
  const location = useLocation();

  useEffect(() => {
    let mounted = true;

    async function verify() {
      if (loading) return;

      if (!session?.user) {
        setRedirectTo('/login');
        setAuthorized(false);
        setChecking(false);
        return;
      }

      const currentProfile = profile ?? (await loadProfile(session.user.id));
      if (!mounted) return;

      if (currentProfile?.is_approved !== true || currentProfile?.status !== 'active') {
        await supabase.auth.signOut();
        if (!mounted) return;
        setRedirectTo('/login?error=unauthorized');
        setAuthorized(false);
        setChecking(false);
        return;
      }

      if (adminOnly && currentProfile?.is_admin !== true) {
        setRedirectTo('/dashboard');
        setAuthorized(false);
        setChecking(false);
        return;
      }

      setAuthorized(true);
      setRedirectTo(null);
      setChecking(false);
    }

    verify();
    return () => {
      mounted = false;
    };
  }, [adminOnly, loadProfile, loading, profile, session]);

  if (loading || checking) return <Spinner label="Checking league access" />;
  if (redirectTo) return <Navigate to={redirectTo} replace state={{ from: location }} />;
  if (!authorized) return null;
  return children;
}
