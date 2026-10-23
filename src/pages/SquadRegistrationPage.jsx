import { Plus, Trash2, Trophy, User, AlertCircle, CheckCircle, Upload, Scan, X, ArrowRight, Sparkles, RefreshCw } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { supabase } from '../lib/supabase.js';
import ProtectedRoute from '../components/ProtectedRoute.jsx';
import { BACKEND_WAKE_MESSAGE, waitForVisionBackend } from '../lib/visionBackendWakeup.js';

const visionApiUrl = (import.meta.env.VITE_VISION_API_URL || '').replace(/\/$/, '');

function SquadRegistrationContent() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [squad, setSquad] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [existingSquad, setExistingSquad] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // AI Vision State
  const [step, setStep] = useState(1); // 1: inventory, 2: pitch, 3: review
  const [inventoryScreenshots, setInventoryScreenshots] = useState([]);
  const [pitchScreenshot, setPitchScreenshot] = useState(null);
  const [aiProcessing, setAiProcessing] = useState(false);
  const [aiProgress, setAiProgress] = useState(0);
  const [aiStage, setAiStage] = useState('idle');
  const [aiError, setAiError] = useState('');
  const aiProcessingRef = useRef(false);

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
      return !rating || rating < 1 || rating > 150;
    });
    if (invalidRatings.length > 0) {
      errors.push('All player ratings must be between 1 and 150');
    }

    const duplicateNames = squad.filter((p, i) =>
      squad.findIndex((other, j) => i !== j && other.player_name.trim().toLowerCase() === p.player_name.trim().toLowerCase()) !== -1
    );
    if (duplicateNames.length > 0) {
      errors.push('Player names must be unique');
    }

    return errors;
  }

  // AI Vision Functions
  function handleInventoryUpload(e) {
    const files = Array.from(e.target.files);
    if (files.length > 30) {
      showMessage('Maximum 30 inventory screenshots allowed', 'error');
      return;
    }
    setInventoryScreenshots(files);
  }

  function handlePitchUpload(e) {
    const file = e.target.files[0];
    if (file) {
      setPitchScreenshot(file);
    }
  }

  async function processWithAI() {
    if (aiProcessingRef.current) return;
    if (inventoryScreenshots.length === 0) {
      showMessage('Please upload at least one inventory screenshot', 'error');
      return;
    }

    if (!pitchScreenshot) {
      showMessage('Please upload the pitch/formation screenshot', 'error');
      return;
    }

    aiProcessingRef.current = true;
    setAiError('');
    setAiStage('checking');
    setAiProcessing(true);
    setAiProgress(10);
    const controller = new AbortController();
    let requestTimeout;
    let postStarted = false;

    try {
      await waitForVisionBackend({
        healthUrl: `${visionApiUrl}/api/health`,
        signal: controller.signal,
        onWaking: () => setAiStage('waking'),
      });
      setAiStage('processing');
      const formData = new FormData();
      inventoryScreenshots.forEach(file => {
        formData.append('inventoryScreenshots', file);
      });
      formData.append('pitchScreenshot', pitchScreenshot);

      setAiProgress(30);

      requestTimeout = setTimeout(() => controller.abort(), 320000);
      postStarted = true;
      const response = await fetch(`${visionApiUrl}/api/squad/extract-vision`, {
        method: 'POST',
        signal: controller.signal,
        body: formData,
      });

      setAiProgress(70);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to process images');
      }

      const data = await response.json();

      if (data.success && data.players) {
        setSquad(data.players.map(p => ({
          id: null,
          player_name: p.player_name,
          player_rating: p.player_rating
        })));
        setStep(3);
        showMessage(`AI successfully extracted ${data.players.length} players from your squad pitch!`, 'success');
      } else {
        throw new Error('AI processing failed');
      }

      setAiProgress(100);

    } catch (error) {
      console.error('AI Vision error:', error);
      const uncertain = error.name === 'AbortError' && postStarted;
      const text = error.code === 'BACKEND_UNAVAILABLE'
        ? 'The squad service is taking longer than expected to wake up. Your screenshots are still selected. You can try again shortly.'
        : uncertain
          ? 'We could not confirm whether image processing finished. Your screenshots are still selected. Wait a moment before choosing to try again.'
          : error.name === 'AbortError'
            ? 'The squad service did not wake up in time. Your screenshots are still selected; try again shortly.'
            : (error.message || 'We could not process these screenshots. Your selections are still saved; please try again.');
      setAiError(text);
      showMessage(text, 'error');
    } finally {
      clearTimeout(requestTimeout);
      controller.abort();
      aiProcessingRef.current = false;
      setAiProcessing(false);
      setAiProgress(0);
      setAiStage('idle');
    }
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

      if (insertError) throw insertError;

      // Lock the squad
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          squad_locked: true,
          initial_squad_submitted_at: new Date().toISOString()
        })
        .eq('id', profile.id);

      if (updateError) throw updateError;

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
            <h1 className="text-2xl font-black text-slate-900 dark:text-white">AI-Powered Squad Registration</h1>
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">
              Register your squad using Google Gemini 1.5 Flash vision AI
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

        {/* Step Indicator */}
        <div className="mb-6">
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold ${step >= 1 ? 'bg-indigo-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'}`}>
              <span className="w-6 h-6 rounded-full bg-white text-indigo-600 flex items-center justify-center text-xs font-black">1</span>
              Inventory Screenshots
            </div>
            <ArrowRight className="h-4 w-4 text-slate-400" />
            <div className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold ${step >= 2 ? 'bg-indigo-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'}`}>
              <span className="w-6 h-6 rounded-full bg-white text-indigo-600 flex items-center justify-center text-xs font-black">2</span>
              Pitch Screenshot
            </div>
            <ArrowRight className="h-4 w-4 text-slate-400" />
            <div className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold ${step >= 3 ? 'bg-indigo-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'}`}>
              <span className="w-6 h-6 rounded-full bg-white text-indigo-600 flex items-center justify-center text-xs font-black">3</span>
              Review & Submit
            </div>
          </div>
        </div>

        {/* Step 1: Inventory Screenshots */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-xl p-6">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-blue-500 dark:bg-blue-500/20 rounded-xl">
                  <Upload className="h-5 w-5 text-white dark:text-blue-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-black text-blue-900 dark:text-blue-400 mb-2">Step 1: Upload Inventory Screenshots</h3>
                  <p className="text-sm text-blue-800 dark:text-blue-300 mb-4">
                    Upload screenshots of your player inventory. The AI will extract all player names to create a name pool for matching.
                  </p>
                  <div className="space-y-3">
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={handleInventoryUpload}
                      disabled={aiProcessing}
                      className="w-full text-sm text-slate-700 dark:text-slate-300 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-white dark:file:bg-slate-800 file:text-blue-700 dark:file:text-blue-400 hover:file:bg-blue-50 dark:hover:file:bg-blue-500/30"
                    />
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Max 30 screenshots. Supported: PNG, JPG, JPEG.
                    </p>
                  </div>
                  {inventoryScreenshots.length > 0 && (
                    <div className="mt-4">
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                        Selected: {inventoryScreenshots.length} screenshot(s)
                      </p>
                      <button
                        type="button"
                        onClick={() => setInventoryScreenshots([])}
                        className="text-xs text-rose-600 dark:text-rose-400 hover:underline"
                      >
                        Clear selection
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={inventoryScreenshots.length === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-3 text-sm font-black text-white hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/25"
            >
              Next: Upload Pitch Screenshot
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Step 2: Pitch Screenshot */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/30 rounded-xl p-6">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-purple-500 dark:bg-purple-500/20 rounded-xl">
                  <Scan className="h-5 w-5 text-white dark:text-purple-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-black text-purple-900 dark:text-purple-400 mb-2">Step 2: Upload Pitch/Formation Screenshot</h3>
                  <p className="text-sm text-purple-800 dark:text-purple-300 mb-4">
                    Upload a screenshot of your tactical pitch showing the 23 active players with their boosted ratings (1-150).
                  </p>
                  <div className="space-y-3">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePitchUpload}
                      disabled={aiProcessing}
                      className="w-full text-sm text-slate-700 dark:text-slate-300 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-white dark:file:bg-slate-800 file:text-purple-700 dark:file:text-purple-400 hover:file:bg-purple-50 dark:hover:file:bg-purple-500/30"
                    />
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Max 10MB. Supported: PNG, JPG, JPEG.
                    </p>
                  </div>
                  {pitchScreenshot && (
                    <div className="mt-4">
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                        Selected: {pitchScreenshot.name}
                      </p>
                      <button
                        type="button"
                        onClick={() => setPitchScreenshot(null)}
                        className="text-xs text-rose-600 dark:text-rose-400 hover:underline"
                      >
                        Clear selection
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={processWithAI}
                disabled={!pitchScreenshot || aiProcessing}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 px-6 py-3 text-sm font-black text-white hover:from-purple-500 hover:to-pink-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-purple-500/25"
              >
                {aiProcessing ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    {aiStage === 'waking' ? 'Preparing squad registration...' : 'Processing with AI...'}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Extract with AI
                  </>
                )}
              </button>
            </div>
            {aiProcessing && aiStage === 'waking' && (
              <div role="status" aria-live="polite" className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100">
                <div className="flex items-start gap-3">
                  <RefreshCw className="mt-1 h-5 w-5 shrink-0 animate-spin" />
                  <div>
                    <p className="font-black">{BACKEND_WAKE_MESSAGE.title}</p>
                    <p className="mt-1 text-sm">{BACKEND_WAKE_MESSAGE.body}</p>
                    <p className="mt-2 text-sm font-semibold">{BACKEND_WAKE_MESSAGE.reminder}</p>
                  </div>
                </div>
              </div>
            )}
            {aiError && !aiProcessing && (
              <div role="alert" className="mt-5 rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-100">
                <p>{aiError}</p>
                <button type="button" onClick={processWithAI} className="mt-3 rounded-lg bg-rose-700 px-4 py-2 font-bold text-white hover:bg-rose-600 dark:bg-rose-500 dark:text-slate-950">
                  Try again with selected screenshots
                </button>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Review & Submit */}
        {step === 3 && (
          <div className="space-y-6">
            {/* AI Success Notice */}
            <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <CheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                <div>
                  <p className="text-sm font-bold text-emerald-900 dark:text-emerald-400">
                    AI Successfully Extracted 23 Players
                  </p>
                  <p className="text-xs text-emerald-800 dark:text-emerald-300">
                    Extracted from your squad pitch with boosted ratings. You can manually adjust names or ratings below.
                  </p>
                </div>
              </div>
            </div>

            {/* Add Reserve Players Notice */}
            {squad.length < 25 && (
              <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  <div>
                    <p className="text-sm font-bold text-amber-900 dark:text-amber-400">
                      Add Reserve Players
                    </p>
                    <p className="text-xs text-amber-800 dark:text-amber-300">
                      You have {25 - squad.length} reserve player slots remaining. Minimum squad size is 22 players.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Squad Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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

            {/* Player List */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px]">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="px-4 py-3 text-left text-xs font-black text-slate-700 dark:text-slate-400 uppercase tracking-wider">#</th>
                    <th className="px-4 py-3 text-left text-xs font-black text-slate-700 dark:text-slate-400 uppercase tracking-wider">Player Name</th>
                    <th className="px-4 py-3 text-left text-xs font-black text-slate-700 dark:text-slate-400 uppercase tracking-wider">Rating (1-150)</th>
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
                          max="150"
                          value={player.player_rating}
                          onChange={(e) => updatePlayer(index, 'player_rating', e.target.value)}
                          className="w-24 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          placeholder="1-150"
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
                        No players added yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Add Reserve Player Button */}
            <div>
              <button
                type="button"
                onClick={addPlayer}
                disabled={squad.length >= 25}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 dark:border-slate-600 px-4 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="h-4 w-4" />
                Add Reserve Player
              </button>
              {squad.length >= 25 && (
                <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">Maximum squad size reached (25 players)</p>
              )}
            </div>

            {/* Requirements Info */}
            <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                <div className="text-sm">
                  <p className="font-semibold text-blue-900 dark:text-blue-400 mb-1">Squad Requirements:</p>
                  <ul className="list-disc list-inside space-y-1 text-blue-800 dark:text-blue-300">
                    <li>Minimum 22 players, maximum 25 players</li>
                    <li>All player names must be unique</li>
                    <li>Player ratings must be between 1 and 150 (boosted ratings supported)</li>
                    <li>Once submitted, your squad will be locked for the season</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Submit Buttons */}
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
                onClick={() => setStep(2)}
                className="text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                ← Back to AI Extraction
              </button>
            </div>
          </div>
        )}

        {/* Back to Dashboard */}
        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          className="text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
        >
          ← Cancel and Return to Dashboard
        </button>
      </div>
    </section>
  );
}

export default function SquadRegistrationPage() {
  return <ProtectedRoute><SquadRegistrationContent /></ProtectedRoute>;
}
