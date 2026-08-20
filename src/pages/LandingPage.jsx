import { BadgeDollarSign, Download, Handshake, LogIn, Trophy, UserPlus, Verified } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DIVISIONS } from '../lib/divisions.js';

export default function LandingPage() {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [selectedDivision, setSelectedDivision] = useState(DIVISIONS[0].name);

  const selected = useMemo(
    () => DIVISIONS.find((division) => division.name === selectedDivision) ?? DIVISIONS[0],
    [selectedDivision],
  );

  useEffect(() => {
    function handleBeforeInstallPrompt(event) {
      event.preventDefault();
      setInstallPrompt(event);
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  async function handleInstall() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    setInstallPrompt(null);
  }

  return (
    <div className="bg-frost">
      <section className="relative isolate min-h-[88vh] overflow-hidden bg-ink text-white">
        <img
          src="/goalquest-logo.png"
          alt="GoalQuest League crest"
          className="absolute inset-0 h-full w-full object-cover opacity-45"
        />
        <div className="absolute inset-0 bg-ink/70" />
        <div className="relative mx-auto flex min-h-[88vh] w-full max-w-7xl flex-col justify-center px-4 py-12 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded bg-gold px-3 py-2 text-sm font-black uppercase text-ink">
              <Trophy className="h-4 w-4" />
              GoalQuest League
            </div>
            <h1 className="text-4xl font-black leading-tight sm:text-6xl">Competitive eFootball league management for serious players.</h1>
            <p className="mt-5 max-w-2xl text-lg font-semibold text-slate-200">
              Powered by Turnjoy Innovation Services
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/register" className="inline-flex items-center gap-2 rounded bg-gold px-5 py-3 text-sm font-black text-ink hover:bg-amber-400">
                <UserPlus className="h-4 w-4" />
                Join League
              </Link>
              <Link to="/login" className="inline-flex items-center gap-2 rounded border border-white/35 px-5 py-3 text-sm font-black text-white hover:bg-white/10">
                <LogIn className="h-4 w-4" />
                Player Login
              </Link>
              {installPrompt && (
                <button type="button" onClick={handleInstall} className="inline-flex items-center gap-2 rounded bg-white px-5 py-3 text-sm font-black text-ink hover:bg-slate-100">
                  <Download className="h-4 w-4" />
                  Install App
                </button>
              )}
            </div>
          </div>
          <dl className="mt-12 grid max-w-4xl gap-3 sm:grid-cols-3">
            {[
              ['11', 'Official divisions'],
              ['1,000+', 'Upper-division slots'],
            ].map(([value, label]) => (
              <div key={label} className="border-l-4 border-gold bg-white/10 px-4 py-3 backdrop-blur">
                <dt className="text-3xl font-black text-gold">{value}</dt>
                <dd className="text-sm font-bold text-slate-200">{label}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-3xl font-black">Division showcase</h2>
            <p className="mt-1 text-sm font-semibold text-slate-600">Players are placed top-down from Elite to Trial as slots fill.</p>
          </div>
          <div className="rounded border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-xs font-bold uppercase text-slate-500">Selected</p>
            <p className="font-black">{selected.name} · {selected.slots ? `${selected.slots} slots` : 'Unlimited / Open'}</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {DIVISIONS.map((division, index) => (
            <button
              key={division.name}
              type="button"
              onClick={() => setSelectedDivision(division.name)}
              className={`rounded-md border p-4 text-left transition ${
                selectedDivision === division.name
                  ? 'border-gold bg-ink text-white shadow-panel'
                  : 'border-slate-200 bg-white hover:border-gold hover:shadow-sm'
              }`}
            >
              <span className="text-xs font-black uppercase text-gold">Division {index + 1}</span>
              <span className="mt-2 block text-xl font-black">{division.name}</span>
              <span className={selectedDivision === division.name ? 'text-sm font-semibold text-slate-200' : 'text-sm font-semibold text-slate-600'}>
                {division.slots ? `${division.slots} slots` : 'Unlimited / Open'}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 pb-10 sm:px-6 lg:px-8">
        <div className="mb-5">
          <p className="text-sm font-black uppercase tracking-wide text-pitch">Built for momentum</p>
          <h2 className="mt-1 text-3xl font-black">Grow &amp; Earn With Us</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            [BadgeDollarSign, 'Play & Win Cash', 'Climb from Trial to Elite. Top players in each division compete for cash prize pools and sponsored rewards.'],
            [Handshake, 'Sponsor & Host', 'Host custom tournaments or sponsor division prize pools with automated standings and tracking.'],
            [Verified, 'Verifiable Standings', 'Automated match reporting, live leaderboards, and transparent dispute workflows.'],
          ].map(([Icon, title, copy]) => (
            <article key={title} className="rounded-md border border-slate-200 bg-white p-5 shadow-panel">
              <div className="flex h-11 w-11 items-center justify-center rounded bg-ink text-gold"><Icon className="h-6 w-6" /></div>
              <h3 className="mt-4 text-xl font-black">{title}</h3>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 pb-10 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 rounded-md bg-navy px-6 py-7 text-white shadow-panel sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-black">Contact Us</h2>
            <p className="mt-1 text-sm font-semibold text-slate-200">Partnerships, inquiries, and player support.</p>
          </div>
          <a href="mailto:support@goalquestleague.com.ng" className="inline-flex w-fit items-center rounded bg-gold px-4 py-3 text-sm font-black text-ink hover:bg-amber-400">
            support@goalquestleague.com.ng
          </a>
        </div>
      </section>
    </div>
  );
}
