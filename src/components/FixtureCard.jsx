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
    <article className="rounded-md border border-slate-200 bg-white p-4 shadow-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase text-slate-500">Matchweek {fixture.matchweek} · {fixture.division}</p>
          <h3 className="mt-1 text-lg font-black text-ink">
            {fixture.home_team} vs {fixture.away_team}
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            {fixture.fixture_date ? new Date(fixture.fixture_date).toLocaleString() : 'Date pending'}
          </p>
        </div>
        <Badge tone={fixture.status}>{fixture.status}</Badge>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <label className="text-sm font-bold text-slate-700">
          Home Score
          <input
            type="number"
            min="0"
            value={homeScore}
            onChange={(event) => setHomeScore(event.target.value)}
            disabled={!canSubmit}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-base font-bold disabled:bg-slate-100"
          />
        </label>
        <label className="text-sm font-bold text-slate-700">
          Away Score
          <input
            type="number"
            min="0"
            value={awayScore}
            onChange={(event) => setAwayScore(event.target.value)}
            disabled={!canSubmit}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-base font-bold disabled:bg-slate-100"
          />
        </label>
      </div>

      {fixture.status === 'pending_confirmation' && (
        <div className="mt-4 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-900">
          Submitted score: {fixture.home_score} - {fixture.away_score}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {canSubmit && (
          <button
            type="button"
            onClick={() => onSubmitScore(fixture, homeScore, awayScore)}
            className="inline-flex items-center gap-2 rounded bg-ink px-4 py-2 text-sm font-bold text-white hover:bg-navy"
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
              className="inline-flex items-center gap-2 rounded bg-pitch px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800"
            >
              <Check className="h-4 w-4" />
              Accept Score
            </button>
            <label className="min-w-64 flex-1 text-sm font-bold text-slate-700">
              Dispute reason
              <input
                value={disputeReason}
                onChange={(event) => setDisputeReason(event.target.value)}
                placeholder="Short reason for admin"
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              />
            </label>
            <button
              type="button"
              onClick={() => onDisputeScore(fixture.id, disputeReason)}
              className="inline-flex items-center gap-2 rounded bg-rose-700 px-4 py-2 text-sm font-bold text-white hover:bg-rose-800"
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
