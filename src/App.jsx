import { Outlet, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import Footer from './components/Footer.jsx';
import Navbar from './components/Navbar.jsx';

const authRoutes = ['/login', '/register'];

export default function App() {
  const { pathname } = useLocation();
  const compact = authRoutes.includes(pathname);

  // Warm up the Render backend on initial app load
  useEffect(() => {
    const warmUpBackend = async () => {
      try {
        const visionApiUrl = import.meta.env.VITE_API_URL || 'https://goalquestleague.onrender.com';
        await fetch(`${visionApiUrl}/api/health`, {
          method: 'GET',
          cache: 'no-store',
        });
      } catch (error) {
        // Silently fail - this is just a warm-up ping
        console.log('Backend warm-up ping failed:', error.message);
      }
    };

    warmUpBackend();
  }, []);

  return (
    <div className="min-h-screen bg-frost text-ink transition-colors">
      {!compact && <Navbar />}
      <main className={compact ? '' : 'mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8'}>
        <Outlet />
      </main>
      {!compact && <Footer />}
    </div>
  );
}
