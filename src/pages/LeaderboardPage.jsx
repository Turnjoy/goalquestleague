import { Link } from 'react-router-dom';
import SeoMeta from '../components/SeoMeta.jsx';
import { DIVISIONS } from '../lib/divisions.js';
import { PUBLIC_SEO } from '../lib/publicSeo.js';

export default function LeaderboardPage() {
  return (
    <article className="mx-auto max-w-4xl space-y-8 py-8">
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

      <section className="space-y-4">
        <h2 className="text-2xl font-black text-ink dark:text-white">League divisions and standings</h2>
        <p className="leading-7 text-slate-700 dark:text-slate-300">
          Players are organized into divisions, from Elite through Trial. Live tables are available to approved players after sign-in, where you can follow points, results, and your division position.
        </p>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {DIVISIONS.map((division) => (
            <li key={division.name} className="rounded border border-slate-200 bg-white p-4 font-bold text-ink shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white">
              {division.name}
            </li>
          ))}
        </ul>
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
            Sign in to view standings
          </Link>
        </div>
      </section>
    </article>
  );
}
