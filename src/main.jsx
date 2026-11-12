import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import AdminPage from './pages/AdminPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import FixturesPage from './pages/FixturesPage.jsx';
import ForgotPasswordPage from './pages/ForgotPasswordPage.jsx';
import LandingPage from './pages/LandingPage.jsx';
import LeaderboardPage from './pages/LeaderboardPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import ResetPasswordPage from './pages/ResetPasswordPage.jsx';
import RulesPage from './pages/RulesPage.jsx';
import StandingsPage from './pages/StandingsPage.jsx';
import WorldCupPage from './pages/WorldCupPage.jsx';
import WorldCupAdminPage from './pages/WorldCupAdminPage.jsx';
import CupManagementPage from './pages/CupManagementPage.jsx';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <Routes>
            <Route element={<App />}>
              <Route index element={<LandingPage />} />
              <Route path="/leaderboard" element={<LeaderboardPage />} />
              <Route path="/rules" element={<RulesPage />} />
              <Route path="/world-cup" element={<WorldCupPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/squad-registration" element={<Navigate to="/dashboard" replace />} />
              <Route path="/transfer-window" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/fixtures" element={<FixturesPage />} />
              <Route path="/standings" element={<StandingsPage />} />
              <Route path="/admin" element={<AdminPage />} />
              <Route path="/admin/world-cup" element={<WorldCupAdminPage />} />
              <Route path="/admin/cup-management" element={<CupManagementPage />} />
            </Route>
          </Routes>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
