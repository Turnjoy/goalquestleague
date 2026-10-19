import { ArrowDown, ArrowUp, Clock, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { supabase } from '../lib/supabase.js';
import ProtectedRoute from '../components/ProtectedRoute.jsx';

function TransferWindowContent() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [currentSquad, setCurrentSquad] = useState([]);
  const [activeWindow, setActiveWindow] = useState(null);
  const [transferQuota, setTransferQuota] = useState(4);
  const [transferHistory, setTransferHistory] = useState([]);
  const [selectedDrop, setSelectedDrop] = useState(null);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerRating, setNewPlayerRating] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function loadData() {
      if (!profile?.id) return;

      setLoading(true);

      try {
        // Load current squad
        const { data: squadData } = await supabase
          .from('squad_rosters')
          .select('*')
          .eq('user_id', profile.id)
          .order('player_rating', { ascending: false });

        setCurrentSquad(squadData || []);

        // Check for active transfer window
        const currentYear = new Date().getFullYear();
        const { data: windowData } = await supabase
          .from('transfer_windows')
          .select('*')
          .eq('division', profile.division)
          .eq('season_year', currentYear)
          .eq('is_active', true)
          .single();

        setActiveWindow(windowData);

        // Calculate transfer quota
        if (windowData) {
          const { data: usedTransfers } = await supabase
            .from('transfer_records')
            .select('*')
            .eq('user_id', profile.id)
            .eq('window_id', windowData.id);

          const quota = 4 - (usedTransfers?.length || 0);
          setTransferQuota(quota);
        }

        // Load transfer history
        const { data: historyData } = await supabase
          .from('transfer_records')
          .select('*')
          .eq('user_id', profile.id)
          .order('transfer_date', { ascending: false })
          .limit(10);

        setTransferHistory(historyData || []);

      } catch (error) {
        console.error('Error loading transfer data:', error);
        setMessage('Failed to load transfer data', 'error');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [profile?.id, profile?.division]);

  function showMessage(text, type) {
    setMessage(text);
    setMessageType(type);
    setTimeout(() => setMessage(''), 5000);
  }

  function calculateDaysRemaining() {
    if (!activeWindow?.end_date) return null;
    const end = new Date(activeWindow.end_date);
    const now = new Date();
    const diff = end - now;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  async function handleTransfer() {
    if (!selectedDrop) {
      showMessage('Please select a player to drop', 'error');
      return;
    }

    if (!newPlayerName.trim()) {
      showMessage('Please enter the new player name', 'error');
      return;
    }

    if (!newPlayerRating || parseInt(newPlayerRating) < 1 || parseInt(newPlayerRating) > 150) {
      showMessage('Please enter a valid rating (1-150)', 'error');
      return;
    }

    if (transferQuota <= 0) {
      showMessage('You have no remaining transfer quota for this window', 'error');
      return;
    }

    // Check for duplicate name
    const duplicateName = currentSquad.find(
      p => p.id !== selectedDrop.id && p.player_name.toLowerCase() === newPlayerName.toLowerCase()
    );
    if (duplicateName) {
      showMessage('Player name already exists in your squad', 'error');
      return;
    }

    setSubmitting(true);

    try {
      // Drop the selected player
      await supabase
        .from('squad_rosters')
        .delete()
        .eq('id', selectedDrop.id);

      // Add the new player
      const { error: addError } = await supabase
        .from('squad_rosters')
        .insert({
          user_id: profile.id,
          player_name: newPlayerName.trim(),
          player_rating: parseInt(newPlayerRating),
          is_initial: false,
          added_via: 'transfer'
        });

      if (addError) throw addError;

      // Record the transfer
      await supabase
        .from('transfer_records')
        .insert({
          user_id: profile.id,
          division: profile.division,
          season_year: new Date().getFullYear(),
          window_id: activeWindow.id,
          action_type: 'drop',
          player_name: selectedDrop.player_name,
          player_rating: selectedDrop.player_rating,
          squad_size_after: currentSquad.length
        });

      await supabase
        .from('transfer_records')
        .insert({
          user_id: profile.id,
          division: profile.division,
          season_year: new Date().getFullYear(),
          window_id: activeWindow.id,
          action_type: 'add',
          player_name: newPlayerName.trim(),
          player_rating: parseInt(newPlayerRating),
          squad_size_after: currentSquad.length
        });

      showMessage('Transfer completed successfully!', 'success');

      // Reset form and reload data
      setSelectedDrop(null);
      setNewPlayerName('');
      setNewPlayerRating('');

      // Reload squad
      const { data: squadData } = await supabase
        .from('squad_rosters')
        .select('*')
        .eq('user_id', profile.id)
        .order('player_rating', { ascending: false });

      setCurrentSquad(squadData || []);
      setTransferQuota(transferQuota - 1);

    } catch (error) {
      console.error('Transfer error:', error);
      showMessage('Failed to complete transfer. Please try again.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <section className="flex min-h-screen items-center justify-center bg-frost dark:bg-slate-900 px-4 py-8">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 mx-auto mb-4 text-indigo-600 dark:text-indigo-400 animate-spin" />
          <p className="text-slate-600 dark:text-slate-400">Loading transfer window...</p>
        </div>
      </section>
    );
  }

  return (
    <section className="flex min-h-screen items-center justify-center bg-frost dark:bg-slate-900 px-4 py-8">
      <div className="w-full max-w-6xl rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-8 shadow-lg dark:shadow-xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-xl">
            <RefreshCw className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white">Transfer Window</h1>
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">
              Swap players during active transfer periods
            </p>
          </div>
        </div>

        {message && (
          <div className={`mb-6 rounded-xl px-4 py-3 text-sm font-semibold flex items-center gap-2 ${
            messageType === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-400'
              : 'bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-rose-800 dark:text-rose-400'
          }`}>
            {messageType === 'success' ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            {message}
          </div>
        )}

        {/* Window Status */}
        {!activeWindow ? (
          <div className="mb-6 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-slate-500 dark:text-slate-400" />
              <div>
                <p className="text-sm font-bold text-slate-700 dark:text-slate-300">Transfer Window Closed</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  No active transfer window for your division. Check back during pre-season or mid-season periods.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="mb-6 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                <div>
                  <p className="text-sm font-bold text-emerald-900 dark:text-emerald-400">
                    Transfer Window Active
                  </p>
                  <p className="text-xs text-emerald-800 dark:text-emerald-300">
                    {activeWindow.window_type === 'pre_season' ? 'Pre-Season' : 'Mid-Season'} Window • {calculateDaysRemaining()} days remaining
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-emerald-700 dark:text-emerald-400">Transfers Used</p>
                <p className="text-2xl font-black text-emerald-900 dark:text-emerald-400">
                  {4 - transferQuota} <span className="text-sm font-normal">/ 4</span>
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Transfer Form */}
        {activeWindow && transferQuota > 0 && (
          <div className="mb-6 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-xl p-6">
            <h3 className="text-lg font-black text-blue-900 dark:text-blue-400 mb-4">Make a Transfer</h3>

            <div className="grid gap-6 md:grid-cols-2">
              {/* Drop Player */}
              <div>
                <p className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3">
                  <ArrowDown className="inline h-4 w-4 mr-1" />
                  Drop Player
                </p>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {currentSquad.map((player) => (
                    <button
                      key={player.id}
                      type="button"
                      onClick={() => setSelectedDrop(player)}
                      className={`w-full text-left rounded-lg p-3 border transition-colors ${
                        selectedDrop?.id === player.id
                          ? 'border-rose-500 bg-rose-50 dark:bg-rose-500/10'
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-900 dark:text-white">{player.player_name}</span>
                        <span className="text-sm font-bold text-slate-600 dark:text-slate-400">{player.player_rating}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Add Player */}
              <div>
                <p className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3">
                  <ArrowUp className="inline h-4 w-4 mr-1" />
                  Add New Player
                </p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Player Name</label>
                    <input
                      type="text"
                      value={newPlayerName}
                      onChange={(e) => setNewPlayerName(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="Enter player name"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Rating (1-99)</label>
                    <input
                      type="number"
                      min="1"
                      max="99"
                      value={newPlayerRating}
                      onChange={(e) => setNewPlayerRating(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="1-99"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleTransfer}
                    disabled={!selectedDrop || submitting}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 px-4 py-2.5 text-sm font-black text-white hover:from-blue-500 hover:to-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/25"
                  >
                    {submitting ? 'Processing...' : 'Complete Transfer'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Transfer History */}
        <div className="mb-6">
          <h3 className="text-lg font-black text-slate-900 dark:text-white mb-4">Recent Transfers</h3>
          {transferHistory.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="px-4 py-2 text-left text-xs font-black text-slate-700 dark:text-slate-400 uppercase">Action</th>
                    <th className="px-4 py-2 text-left text-xs font-black text-slate-700 dark:text-slate-400 uppercase">Player</th>
                    <th className="px-4 py-2 text-left text-xs font-black text-slate-700 dark:text-slate-400 uppercase">Rating</th>
                    <th className="px-4 py-2 text-left text-xs font-black text-slate-700 dark:text-slate-400 uppercase">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {transferHistory.map((record) => (
                    <tr key={record.id}>
                      <td className="px-4 py-2">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-bold ${
                          record.action_type === 'add'
                            ? 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-400'
                            : 'bg-rose-100 dark:bg-rose-500/10 text-rose-800 dark:text-rose-400'
                        }`}>
                          {record.action_type === 'add' ? '+' : '-'}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-sm font-semibold text-slate-900 dark:text-white">{record.player_name}</td>
                      <td className="px-4 py-2 text-sm text-slate-700 dark:text-slate-300">{record.player_rating}</td>
                      <td className="px-4 py-2 text-xs text-slate-500 dark:text-slate-400">
                        {new Date(record.transfer_date).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">No transfer history yet.</p>
          )}
        </div>

        {/* Back Button */}
        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          className="text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
        >
          ← Back to Dashboard
        </button>
      </div>
    </section>
  );
}

export default function TransferWindowPage() {
  return <ProtectedRoute><TransferWindowContent /></ProtectedRoute>;
}
