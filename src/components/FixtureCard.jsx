import { AlertTriangle, Check, Send, ShieldAlert, MessageCircle, X, Trophy, User } from 'lucide-react';
import { useState } from 'react';
import Badge from './Badge.jsx';
import { supabase } from '../lib/supabase.js';

export default function FixtureCard({ fixture, userId, onSubmitScore, onConfirmScore, onDisputeScore }) {
  const [homeScore, setHomeScore] = useState(fixture.home_score ?? '');
  const [awayScore, setAwayScore] = useState(fixture.away_score ?? '');
  const [disputeReason, setDisputeReason] = useState('');
  const [showSquad, setShowSquad] = useState(false);
  const [opponentSquad, setOpponentSquad] = useState(null);
  const [opponentProfile, setOpponentProfile] = useState(null);
  const [loadingSquad, setLoadingSquad] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportType, setReportType] = useState('');
  const [reportDescription, setReportDescription] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);

  const isHome = fixture.home_player_id === userId;
  const isAway = fixture.away_player_id === userId;
  const canSubmit = isHome && ['scheduled', 'disputed'].includes(fixture.status);
  const canRespond = isAway && fixture.status === 'pending_confirmation';

  const opponentId = isHome ? fixture.away_player_id : fixture.home_player_id;
  const opponentName = isHome ? fixture.away_team : fixture.home_team;

  async function loadOpponentSquad() {
    if (!opponentId) return;

    setLoadingSquad(true);
    try {
      const [squadData, profileData] = await Promise.all([
        supabase
          .from('squad_rosters')
          .select('*')
          .eq('user_id', opponentId)
          .order('player_rating', { ascending: false }),
        supabase
          .from('profiles')
          .select('*')
          .eq('id', opponentId)
          .single()
      ]);

      setOpponentSquad(squadData || []);
      setOpponentProfile(profileData);
    } catch (error) {
      console.error('Error loading opponent squad:', error);
    } finally {
      setLoadingSquad(false);
    }
  }

  function calculateSquadRating(squad) {
    if (!squad || squad.length === 0) return 0;
    return squad.reduce((total, player) => total + player.player_rating, 0);
  }

  async function handleReportViolation() {
    if (!reportType || !reportDescription.trim()) {
      alert('Please select a violation type and provide a description');
      return;
    }

    setSubmittingReport(true);
    try {
      const { error } = await supabase
        .from('squad_violation_reports')
        .insert({
          reporter_id: userId,
          reported_user_id: opponentId,
          fixture_id: fixture.id,
          violation_type: reportType,
          description: reportDescription,
          status: 'pending'
        });

      if (error) throw error;

      alert('Violation report submitted successfully. Admins have been notified.');
      setShowReportModal(false);
      setReportType('');
      setReportDescription('');
    } catch (error) {
      console.error('Error submitting report:', error);
      alert('Failed to submit report. Please try again.');
    } finally {
      setSubmittingReport(false);
    }
  }

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

        <button
          type="button"
          onClick={() => {
            setShowSquad(!showSquad);
            if (!showSquad) loadOpponentSquad();
          }}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <User className="h-4 w-4" />
          {showSquad ? 'Hide Squad' : 'View Squad'}
        </button>

        {opponentProfile?.whatsapp_number && (
          <a
            href={`https://wa.me/${opponentProfile.whatsapp_number}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 px-4 py-2 text-sm font-bold text-white hover:from-green-500 hover:to-emerald-500 shadow-lg shadow-green-500/25"
          >
            <MessageCircle className="h-4 w-4" />
            WhatsApp Challenge
          </a>
        )}

        <button
          type="button"
          onClick={() => setShowReportModal(true)}
          className="inline-flex items-center gap-2 rounded-xl border border-rose-300 dark:border-rose-600 px-4 py-2 text-sm font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
        >
          <ShieldAlert className="h-4 w-4" />
          Report Violation
        </button>
      </div>

      {/* Squad Display */}
      {showSquad && (
        <div className="mt-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4">
          {loadingSquad ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Loading squad...</p>
          ) : opponentSquad && opponentSquad.length > 0 ? (
            <>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                    {opponentProfile?.manager_handle || opponentProfile?.gamertag || opponentName}'s Squad
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {opponentSquad.length} players • Total Rating: {calculateSquadRating(opponentSquad)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <span className="text-lg font-black text-slate-900 dark:text-white">
                    {Math.round(calculateSquadRating(opponentSquad) / opponentSquad.length)}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">avg</span>
                </div>
              </div>
              <div className="overflow-x-auto max-h-64">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700">
                      <th className="px-3 py-2 text-left font-bold text-slate-700 dark:text-slate-400">Player</th>
                      <th className="px-3 py-2 text-left font-bold text-slate-700 dark:text-slate-400">Rating</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {opponentSquad.map((player, index) => (
                      <tr key={player.id}>
                        <td className="px-3 py-2 text-slate-900 dark:text-white">{index + 1}. {player.player_name}</td>
                        <td className="px-3 py-2 font-bold text-slate-700 dark:text-slate-300">{player.player_rating}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">No squad registered yet.</p>
          )}
        </div>
      )}

      {/* Violation Report Modal */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/70 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-black text-slate-900 dark:text-white">Report Squad Violation</h3>
              <button
                type="button"
                onClick={() => setShowReportModal(false)}
                className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Violation Type</label>
                <select
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Select violation type...</option>
                  <option value="unlisted_player">Unlisted Player</option>
                  <option value="incorrect_rating">Incorrect Rating</option>
                  <option value="squad_size_violation">Squad Size Violation</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Description</label>
                <textarea
                  value={reportDescription}
                  onChange={(e) => setReportDescription(e.target.value)}
                  placeholder="Describe the violation in detail..."
                  rows="3"
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>

              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setShowReportModal(false)}
                  className="px-4 py-2 text-sm font-bold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleReportViolation}
                  disabled={submittingReport}
                  className="px-4 py-2 text-sm font-bold text-white bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 disabled:opacity-50 shadow-lg shadow-rose-500/25"
                >
                  {submittingReport ? 'Submitting...' : 'Submit Report'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
