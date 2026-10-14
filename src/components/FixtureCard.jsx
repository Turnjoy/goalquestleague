import { AlertTriangle, Check, Send } from 'lucide-react';
import { useState } from 'react';
import Badge from './Badge.jsx';

export default function FixtureCard({ fixture, userId, onSubmitScore, onConfirmScore, onDisputeScore }) {
  const [homeScore, setHomeScore] = useState(fixture.home_score ?? '');
  const [awayScore, setAwayScore] = useState(fixture.away_score ?? '');
  const [disputeReason, setDisputeReason] = useState('');
  const isHome = fixture.home_player_id === userId;
  const isAway = fixture.away_player_id === userId;
  const canSubmit = isHome && ['scheduled', 'disputed'].includes(fixture.status);
  const canRespond = isAway && fixture.status === 'pending_confirmation';

  return (
    <article className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-lg dark:shadow-xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400">Matchweek {fixture.matchweek} · {fixture.division}</p>
          <h3 className="mt-1 text-lg font-black text-slate-900 dark:text-white">
            {fixture.home_team} vs {fixture.away_team}
          </h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {fixture.fixture_date ? new Date(fixture.fixture_date).toLocaleString() : 'Date pending'}
          </p>
        </div>
        <Badge tone={fixture.status}>{fixture.status}</Badge>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <label className="text-sm font-bold text-slate-700 dark:text-slate-300">
          Home Score
          <input
            type="number"
            min="0"
            value={homeScore}
            onChange={(event) => setHomeScore(event.target.value)}
            disabled={!canSubmit}
            className="mt-1 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white px-3 py-2 text-base font-bold disabled:bg-slate-100 dark:disabled:bg-slate-800 focus:ring-2 focus:ring-indigo-500"
          />
        </label>
        <label className="text-sm font-bold text-slate-700 dark:text-slate-300">
          Away Score
          <input
            type="number"
            min="0"
            value={awayScore}
            onChange={(event) => setAwayScore(event.target.value)}
            disabled={!canSubmit}
            className="mt-1 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white px-3 py-2 text-base font-bold disabled:bg-slate-100 dark:disabled:bg-slate-800 focus:ring-2 focus:ring-indigo-500"
          />
        </label>
      </div>

      {fixture.status === 'pending_confirmation' && (
        <div className="mt-4 rounded-xl border border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10 px-3 py-2 text-sm font-semibold text-blue-900 dark:text-blue-400">
          Submitted score: {fixture.home_score} - {fixture.away_score}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {canSubmit && (
          <button
            type="button"
            onClick={() => onSubmitScore(fixture, homeScore, awayScore)}
            className="inline-flex items-center gap-2 rounded-xl bg-ink dark:bg-slate-800 px-4 py-2 text-sm font-bold text-white hover:bg-navy dark:hover:bg-slate-700 transition-colors"
          >
            <Send className="h-4 w-4" />
            Submit Score
          </button>
        )}

        {canRespond && (
          <>
            <button
              type="button"
              onClick={() => onConfirmScore(fixture.id)}
              className="inline-flex items-center gap-2 rounded-xl bg-pitch px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800 transition-colors"
            >
              <Check className="h-4 w-4" />
              Accept Score
            </button>
            <label className="min-w-64 flex-1 text-sm font-bold text-slate-700 dark:text-slate-300">
              Dispute reason
              <input
                value={disputeReason}
                onChange={(event) => setDisputeReason(event.target.value)}
                placeholder="Short reason for admin"
                className="mt-1 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white px-3 py-2 focus:ring-2 focus:ring-indigo-500"
              />
            </label>
            <button
              type="button"
              onClick={() => onDisputeScore(fixture.id, disputeReason)}
              className="inline-flex items-center gap-2 rounded-xl bg-rose-700 px-4 py-2 text-sm font-bold text-white hover:bg-rose-800 transition-colors"
            >
              <AlertTriangle className="h-4 w-4" />
              Dispute
            </button>
          </>
        )}
      </div>
    </article>
  );
}
