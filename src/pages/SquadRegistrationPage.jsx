import { Plus, Trash2, Trophy, User, AlertCircle, CheckCircle, Upload, Scan, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { supabase } from '../lib/supabase.js';
import ProtectedRoute from '../components/ProtectedRoute.jsx';
import Tesseract from 'tesseract.js';

function SquadRegistrationContent() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [squad, setSquad] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [existingSquad, setExistingSquad] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [ocrScanning, setOcrScanning] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [showOcrSection, setShowOcrSection] = useState(false);

  // Check if user already has a squad
  useEffect(() => {
    async function checkExistingSquad() {
      if (!profile?.id) return;

      const { data: existingSquadData, error } = await supabase
        .from('squad_rosters')
        .select('*')
        .eq('user_id', profile.id);

      if (error) {
        console.error('Error checking squad:', error);
        return;
      }

      if (existingSquadData && existingSquadData.length > 0) {
        setExistingSquad(existingSquadData);
        setSquad(existingSquadData.map(row => ({
          id: row.id,
          player_name: row.player_name,
          player_rating: row.player_rating
        })));
      }
    }

    checkExistingSquad();
  }, [profile?.id]);

  function showMessage(text, type) {
    setMessage(text);
    setMessageType(type);
    setTimeout(() => setMessage(''), 5000);
  }

  function addPlayer() {
    if (squad.length >= 25) {
      showMessage('Maximum squad size is 25 players', 'error');
      return;
    }

    setSquad([...squad, { id: null, player_name: '', player_rating: '' }]);
  }

  function updatePlayer(index, field, value) {
    const updatedSquad = [...squad];
    updatedSquad[index][field] = value;
    setSquad(updatedSquad);
  }

  function removePlayer(index) {
    const updatedSquad = squad.filter((_, i) => i !== index);
    setSquad(updatedSquad);
  }

  function calculateTotalRating() {
    return squad.reduce((total, player) => {
      const rating = parseInt(player.player_rating) || 0;
      return total + rating;
    }, 0);
  }

  function calculateAverageRating() {
    if (squad.length === 0) return 0;
    return Math.round(calculateTotalRating() / squad.length);
  }

  function validateSquad() {
    const errors = [];

    if (squad.length < 22) {
      errors.push('Squad must have at least 22 players');
    }

    if (squad.length > 25) {
      errors.push('Squad cannot exceed 25 players');
    }

    const emptyNames = squad.filter(p => !p.player_name.trim());
    if (emptyNames.length > 0) {
      errors.push('All players must have a name');
    }

    const invalidRatings = squad.filter(p => {
      const rating = parseInt(p.player_rating);
      return !rating || rating < 1 || rating > 99;
    });
    if (invalidRatings.length > 0) {
      errors.push('All player ratings must be between 1 and 99');
    }

    const duplicateNames = squad.filter((p, i) =>
      squad.findIndex((other, j) => i !== j && other.player_name.trim().toLowerCase() === p.player_name.trim().toLowerCase()) !== -1
    );
    if (duplicateNames.length > 0) {
      errors.push('Player names must be unique');
    }

    return errors;
  }

  async function handleOcrScan(files) {
    if (!files || files.length === 0) return;

    if (files.length > 30) {
      showMessage('Maximum 30 screenshots allowed', 'error');
      return;
    }

    setOcrScanning(true);
    setOcrProgress(0);

    const allExtractedPlayers = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setOcrProgress(Math.round(((i + 1) / files.length) * 100));

        const result = await Tesseract.recognize(file, 'eng', {
          logger: (m) => {
            if (m.status === 'recognizing text') {
              // Progress is handled per file
            }
          }
        });

        const text = result.data.text;
        const extractedPlayers = parseOcrText(text);
        allExtractedPlayers.push(...extractedPlayers);
      }

      // Deduplicate and merge with existing squad
      const deduplicatedPlayers = deduplicatePlayers(allExtractedPlayers);
      const mergedSquad = mergeWithExistingSquad(deduplicatedPlayers);

      setSquad(mergedSquad);
      showMessage(`Successfully extracted ${deduplicatedPlayers.length} players from ${files.length} screenshot(s)`, 'success');
      setShowOcrSection(false);

    } catch (error) {
      console.error('OCR Error:', error);
      showMessage('Failed to process screenshots. Please try manual entry instead.', 'error');
    } finally {
      setOcrScanning(false);
      setOcrProgress(0);
    }
  }

  function parseOcrText(text) {
    const players = [];
    const lines = text.split('\n').filter(line => line.trim());

    for (const line of lines) {
      // Try to match patterns like "Player Name 99" or "Player Name  99"
      const match = line.match(/^([A-Za-z\s\.]+)\s+(\d{1,2})$/);
      if (match) {
        const name = match[1].trim();
        const rating = parseInt(match[2]);

        if (name && rating >= 1 && rating <= 99) {
          players.push({
            id: null,
            player_name: name,
            player_rating: rating
          });
        }
      }
    }

    return players;
  }

  function deduplicatePlayers(players) {
    const seen = new Set();
    const deduplicated = [];

    for (const player of players) {
      const key = player.player_name.toLowerCase().trim();
      if (!seen.has(key)) {
        seen.add(key);
        deduplicated.push(player);
      }
    }

    return deduplicated;
  }

  function mergeWithExistingSquad(newPlayers) {
    const existingNames = new Set(squad.map(p => p.player_name.toLowerCase().trim()));
    const merged = [...squad];

    for (const player of newPlayers) {
      const key = player.player_name.toLowerCase().trim();
      if (!existingNames.has(key)) {
        merged.push(player);
        existingNames.add(key);
      }
    }

    // Enforce max 25 players
    return merged.slice(0, 25);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const errors = validateSquad();
    if (errors.length > 0) {
      showMessage(errors[0], 'error');
      return;
    }

    if (!profile?.id) {
      showMessage('You must be logged in to register a squad', 'error');
      return;
    }

    setSubmitting(true);
    setLoading(true);

    try {
      // Check if squad is already locked
      const { data: profileData } = await supabase
        .from('profiles')
        .select('squad_locked')
        .eq('id', profile.id)
        .single();

      if (profileData?.squad_locked) {
        showMessage('Your squad is already locked and registered', 'error');
        setSubmitting(false);
        setLoading(false);
        return;
      }

      // Delete existing squad if any
      await supabase
        .from('squad_rosters')
        .delete()
        .eq('user_id', profile.id);

      // Insert new squad
      const squadData = squad.map(player => ({
        user_id: profile.id,
        player_name: player.player_name.trim(),
        player_rating: parseInt(player.player_rating),
        is_initial: true,
        added_via: 'initial'
      }));

      const { error: insertError } = await supabase
        .from('squad_rosters')
        .insert(squadData);

      if (insertError) {
        throw insertError;
      }

      // Lock the squad
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          squad_locked: true,
          initial_squad_submitted_at: new Date().toISOString()
        })
        .eq('id', profile.id);

      if (updateError) {
        throw updateError;
      }

      showMessage('Squad registered successfully! Redirecting to dashboard...', 'success');
      setTimeout(() => navigate('/dashboard'), 2000);

    } catch (error) {
      console.error('Error submitting squad:', error);
      showMessage(error.message || 'Failed to register squad. Please try again.', 'error');
    } finally {
      setSubmitting(false);
      setLoading(false);
    }
  }

  if (existingSquad && existingSquad.length > 0 && profile?.squad_locked) {
    return (
      <section className="flex min-h-screen items-center justify-center bg-frost dark:bg-slate-900 px-4 py-8">
        <div className="w-full max-w-4xl rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-8 shadow-lg dark:shadow-xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-emerald-500 dark:bg-emerald-500/20 rounded-xl">
              <CheckCircle className="h-6 w-6 text-white dark:text-emerald-400" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 dark:text-white">Squad Already Registered</h1>
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">Your squad is locked and ready for the season</p>
            </div>
          </div>

          <div className="mb-6">
            <p className="text-slate-700 dark:text-slate-300 mb-4">
              You have successfully registered your squad with <span className="font-bold text-emerald-600 dark:text-emerald-400">{existingSquad.length}</span> players.
            </p>
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Squad Summary:</p>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-slate-500 dark:text-slate-400">Total Players:</span>
                  <span className="ml-2 font-bold text-slate-900 dark:text-white">{existingSquad.length}</span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400">Total Rating:</span>
                  <span className="ml-2 font-bold text-slate-900 dark:text-white">
                    {existingSquad.reduce((sum, p) => sum + p.player_rating, 0)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400">Average Rating:</span>
                  <span className="ml-2 font-bold text-slate-900 dark:text-white">
                    {Math.round(existingSquad.reduce((sum, p) => sum + p.player_rating, 0) / existingSquad.length)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={() => navigate('/dashboard')}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-3 text-sm font-black text-white hover:from-indigo-500 hover:to-violet-500 shadow-lg shadow-indigo-500/25"
          >
            Go to Dashboard
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="flex min-h-screen items-center justify-center bg-frost dark:bg-slate-900 px-4 py-8">
      <div className="w-full max-w-6xl rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-8 shadow-lg dark:shadow-xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl">
            <Trophy className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white">Squad Registration</h1>
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">
              Register your initial squad (22-25 players) for the season
            </p>
          </div>
        </div>

        {message && (
          <div className={`mb-6 rounded-xl px-4 py-3 text-sm font-semibold flex items-center gap-2 ${
            messageType === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-400'
              : 'bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-rose-800 dark:text-rose-400'
          }`}>
            {messageType === 'success' ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            {message}
          </div>
        )}

        {/* Squad Stats */}
        <div className="mb-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <User className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              <span className="text-sm font-semibold text-slate-600 dark:text-slate-400">Players</span>
            </div>
            <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">
              {squad.length} <span className="text-sm font-normal text-slate-500 dark:text-slate-400">/ 25</span>
            </p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              <span className="text-sm font-semibold text-slate-600 dark:text-slate-400">Total Rating</span>
            </div>
            <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{calculateTotalRating()}</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <User className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              <span className="text-sm font-semibold text-slate-600 dark:text-slate-400">Average Rating</span>
            </div>
            <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{calculateAverageRating()}</p>
          </div>
        </div>

        {/* OCR Scan Section */}
        <div className="mb-6">
          {!showOcrSection ? (
            <button
              type="button"
              onClick={() => setShowOcrSection(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-blue-300 dark:border-blue-600 px-4 py-2.5 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors"
            >
              <Scan className="h-4 w-4" />
              Scan Squad Screenshots (OCR)
            </button>
          ) : (
            <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-xl p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Scan className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  <h3 className="text-sm font-bold text-blue-900 dark:text-blue-400">Scan Squad Screenshots</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowOcrSection(false)}
                  className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {ocrScanning ? (
                <div className="text-center py-4">
                  <div className="mb-2 text-sm font-semibold text-blue-900 dark:text-blue-400">
                    Processing screenshots... {ocrProgress}%
                  </div>
                  <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2">
                    <div
                      className="bg-blue-600 dark:bg-blue-400 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${ocrProgress}%` }}
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-blue-800 dark:text-blue-300">
                    Upload up to 30 squad screenshots. The system will automatically extract player names and ratings.
                    You can edit the results before submitting.
                  </p>
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={(e) => handleOcrScan(e.target.files)}
                    disabled={ocrScanning}
                    className="w-full text-sm text-slate-700 dark:text-slate-300 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-blue-50 dark:file:bg-blue-500/20 file:text-blue-700 dark:file:text-blue-400 hover:file:bg-blue-100 dark:hover:file:bg-blue-500/30"
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Supported formats: PNG, JPG, JPEG. Max 30 images.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Player List */}
        <div className="mb-6 overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
                <th className="px-4 py-3 text-left text-xs font-black text-slate-700 dark:text-slate-400 uppercase tracking-wider">#</th>
                <th className="px-4 py-3 text-left text-xs font-black text-slate-700 dark:text-slate-400 uppercase tracking-wider">Player Name</th>
                <th className="px-4 py-3 text-left text-xs font-black text-slate-700 dark:text-slate-400 uppercase tracking-wider">Rating (1-99)</th>
                <th className="px-4 py-3 text-left text-xs font-black text-slate-700 dark:text-slate-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {squad.map((player, index) => (
                <tr key={index} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="px-4 py-3 font-black text-slate-900 dark:text-white">{index + 1}</td>
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      value={player.player_name}
                      onChange={(e) => updatePlayer(index, 'player_name', e.target.value)}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="Player name"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      min="1"
                      max="99"
                      value={player.player_rating}
                      onChange={(e) => updatePlayer(index, 'player_rating', e.target.value)}
                      className="w-24 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="1-99"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => removePlayer(index)}
                      className="inline-flex items-center gap-1 rounded-lg border border-rose-300 dark:border-rose-600 px-3 py-2 text-sm font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              {squad.length === 0 && (
                <tr>
                  <td colSpan="4" className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                    No players added yet. Click "Add Player" to start building your squad.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Add Player Button */}
        <div className="mb-6">
          <button
            type="button"
            onClick={addPlayer}
            disabled={squad.length >= 25}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 dark:border-slate-600 px-4 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="h-4 w-4" />
            Add Player
          </button>
          {squad.length >= 25 && (
            <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">Maximum squad size reached (25 players)</p>
          )}
        </div>

        {/* Requirements Info */}
        <div className="mb-6 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold text-blue-900 dark:text-blue-400 mb-1">Squad Requirements:</p>
              <ul className="list-disc list-inside space-y-1 text-blue-800 dark:text-blue-300">
                <li>Minimum 22 players, maximum 25 players</li>
                <li>All player names must be unique</li>
                <li>Player ratings must be between 1 and 99</li>
                <li>Once submitted, your squad will be locked for the season</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || squad.length < 22 || squad.length > 25}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-3 text-sm font-black text-white hover:from-indigo-500 hover:to-violet-500 shadow-lg shadow-indigo-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Submitting...' : 'Submit Squad'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </section>
  );
}

export default function SquadRegistrationPage() {
  return <ProtectedRoute><SquadRegistrationContent /></ProtectedRoute>;
}
