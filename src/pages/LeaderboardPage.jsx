import { Link } from 'react-router-dom';
import { useState } from 'react';
import SeoMeta from '../components/SeoMeta.jsx';
import { LEAGUES, TIERS } from '../lib/divisions.js';
import { PUBLIC_SEO } from '../lib/publicSeo.js';
import StandingsTable from '../components/StandingsTable.jsx';

export default function LeaderboardPage() {
  const [selectedLeague, setSelectedLeague] = useState(LEAGUES[0].name);
  const [selectedTier, setSelectedTier] = useState(TIERS[0].name);

  return (
    <article className="mx-auto max-w-6xl space-y-8 py-8">
      <SeoMeta {...PUBLIC_SEO.leaderboard} />
      <header className="space-y-3">
        <p className="text-sm font-black uppercase tracking-wide text-pitch">GoalQuest League standings</p>
        <h1 className="text-4xl font-black leading-tight text-ink dark:text-white sm:text-5xl">
          eFootball League Nigeria Leaderboard
        </h1>
        <p className="text-lg font-semibold leading-8 text-slate-600 dark:text-slate-300">
          Follow the competition across GoalQuest League divisions. Confirmed match results update player standings, giving competitors a clear view of their progress through the season.
        </p>
      </header>

      <section className="space-y-6">
        <h2 className="text-2xl font-black text-ink dark:text-white">Live Standings</h2>
        
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Select League</label>
            <select 
              value={selectedLeague} 
              onChange={(e) => setSelectedLeague(e.target.value)}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-indigo-500"
            >
              {LEAGUES.map((league) => (
                <option key={league.name} value={league.name} className="dark:bg-slate-900 dark:text-white">
                  {league.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Select Tier/Division</label>
            <select 
              value={selectedTier} 
              onChange={(e) => setSelectedTier(e.target.value)}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-indigo-500"
            >
              {TIERS.map((tier) => (
                <option key={tier.name} value={tier.name} className="dark:bg-slate-900 dark:text-white">
                  {tier.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto w-full">
          <StandingsTable division={selectedTier} league={selectedLeague} />
        </div>
      </section>

      <section className="space-y-4 rounded-md bg-navy p-6 text-white">
        <h2 className="text-2xl font-black">Turn eFootball results into league progress</h2>
        <p className="leading-7 text-slate-200">
          Submit accurate scores for your fixtures and make sure your opponent confirms the result. GoalQuest League records confirmed outcomes in the standings; disputed results are reviewed through the league process.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link to="/register" className="rounded bg-gold px-5 py-3 text-sm font-black text-ink hover:bg-amber-400">
            Register for the league
          </Link>
          <Link to="/login" className="rounded border border-white/40 px-5 py-3 text-sm font-black text-white hover:bg-white/10">
            Sign in to view your dashboard
          </Link>
        </div>
      </section>
    </article>
  );
}
