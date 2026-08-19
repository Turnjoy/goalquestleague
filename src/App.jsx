import { Outlet, useLocation } from 'react-router-dom';
import Footer from './components/Footer.jsx';
import Navbar from './components/Navbar.jsx';

const authRoutes = ['/login', '/register'];

export default function App() {
  const { pathname } = useLocation();
  const compact = authRoutes.includes(pathname);

  return (
    <div className="min-h-screen bg-frost text-ink">
      {!compact && <Navbar />}
      <main className={compact ? '' : 'mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8'}>
        <Outlet />
      </main>
      {!compact && <Footer />}
    </div>
  );
}
