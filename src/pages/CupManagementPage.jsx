import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ProtectedRoute from '../components/ProtectedRoute.jsx';
import { 
  Trophy, 
  Settings, 
  Plus,
  Calendar,
  Clock,
  Check,
  X,
  Eye,
  Edit,
  Play,
  Sparkles,
  Shield,
  Users,
  Zap
} from 'lucide-react';
import {
  seedSystemCupCompetitions,
  getAllCupCompetitions,
  getCupCompetition,
  createCupConfiguration,
  getCupConfiguration,
  getCupConfigurations,
  getQualifiedClubsForCup,
  autoQualifyClubsForCup,
  getCupParticipants,
  assignParticipantGroups,
  generateCupGroupFixtures,
  getCupFixtures,
  generateDraftPreview,
  activateCupConfiguration,
  updateCupStatus
} from '../lib/cupApi.js';

const SYSTEM_COMPETITIONS = [
  { name: 'quest_champions_league', display: 'Quest Champions League', description: 'Top 8 from each league' },
  { name: 'quest_europa_league', display: 'Quest Europa League', description: 'Positions 9-16 from each league' },
  { name: 'quest_super_cup', display: 'Quest Super Cup', description: 'QCL winner vs QEL winner' },
  { name: 'universal_cup', display: 'Universal Cup', description: 'Top 4 from each league' },
  { name: 'club_world_cup', display: 'Club World Cup', description: 'Top 16 from each league' },
  { name: 'apex_premier_cup', display: 'Apex Premier Cup', description: 'Top 16 from Apex Football League' },
  { name: 'diamond_elite_cup', display: 'Diamond Elite Cup', description: 'Top 16 from Diamond Elite League' }
];

function getStatusBadge(status) {
  const styles = {
    unconfigured: 'bg-slate-100 text-slate-800 border-slate-300',
    draft_preview: 'bg-amber-100 text-amber-800 border-amber-300',
    active: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    completed: 'bg-blue-100 text-blue-800 border-blue-300',
    cancelled: 'bg-rose-100 text-rose-800 border-rose-300'
  };
  const label = typeof status === 'string' ? status : 'unconfigured';
  return (
    <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${styles[label] || styles.unconfigured}`}>
      {label.replace('_', ' ').toUpperCase()}
    </span>
  );
}

function CupManagementContent() {
  const navigate = useNavigate();
  const [competitions, setCompetitions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCompetition, setSelectedCompetition] = useState(null);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [draftPreview, setDraftPreview] = useState(null);
  const [currentConfig, setCurrentConfig] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    loadCompetitions();
  }, []);

  async function loadCompetitions() {
    setLoading(true);
    setError('');
    try {
      await seedSystemCupCompetitions();
      const competitionsData = await getAllCupCompetitions();
      setCompetitions(competitionsData);
    } catch (err) {
      setError(err?.message || 'Could not load cup competitions.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSetupCup(competition) {
    setSelectedCompetition(competition);
    setShowSetupModal(true);
  }

  async function handleViewPreview(competition) {
    try {
      const currentYear = new Date().getFullYear();
      const configs = await getCupConfigurations(competition.id, currentYear);

      if (configs.length > 0) {
        const preview = await generateDraftPreview(configs[0].id);
        setDraftPreview(preview);
        setCurrentConfig(configs[0]);
        setShowPreviewModal(true);
      } else {
        alert('No configuration found for this competition. Please set up the cup first.');
      }
    } catch (err) {
      alert(`Failed to load preview: ${err.message}`);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-slate-600 dark:text-slate-400">Loading cup competitions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
        {/* Header */}
        <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center gap-3">
                <Trophy className="h-8 w-8 text-indigo-600" />
                <div>
                  <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                    Cup & Tournament Management
                  </h1>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Automated competition setup and management
                  </p>
                </div>
              </div>
              <button
                onClick={() => navigate('/admin')}
                className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
              >
                Back to Admin
              </button>
            </div>
          </div>
        </div>

        {/* Competition List */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
              System Competitions
            </h2>
            <p className="text-slate-600 dark:text-slate-400">
              Pre-seeded competitions with automatic qualification criteria
            </p>
          </div>

          {error && (
            <div className="mb-6 rounded-lg border border-rose-300 bg-rose-50 dark:bg-rose-900/20 dark:border-rose-800 px-4 py-3 flex items-center justify-between gap-4">
              <p className="text-sm text-rose-700 dark:text-rose-300">{error}</p>
              <button
                onClick={loadCompetitions}
                className="shrink-0 px-3 py-1.5 text-sm font-medium text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-700 rounded-md hover:bg-rose-100 dark:hover:bg-rose-900/40"
              >
                Retry
              </button>
            </div>
          )}

          {!error && competitions.length === 0 && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-10 text-center">
              <Trophy className="h-10 w-10 text-slate-400 mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">No cup competitions found</p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                The seven system competitions have not been seeded yet. Apply the cup schema migration, then retry.
              </p>
              <button
                onClick={loadCompetitions}
                className="mt-4 px-4 py-2 text-sm font-medium text-indigo-600 border border-indigo-300 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
              >
                Retry
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {competitions.map(competition => (
              <CompetitionCard
                key={competition.id}
                competition={competition}
                onSetup={() => handleSetupCup(competition)}
                onPreview={() => handleViewPreview(competition)}
              />
            ))}
          </div>
        </div>

        {/* Setup Modal */}
        {showSetupModal && selectedCompetition && (
          <CupSetupModal
            competition={selectedCompetition}
            onClose={() => setShowSetupModal(false)}
            onComplete={() => {
              setShowSetupModal(false);
              loadCompetitions();
            }}
          />
        )}

        {/* Preview Modal */}
        {showPreviewModal && draftPreview && (
          <DraftPreviewModal
            preview={draftPreview}
            config={currentConfig}
            onClose={() => setShowPreviewModal(false)}
            onActivate={async () => {
              try {
                await activateCupConfiguration(currentConfig.id);
                await updateCupStatus(selectedCompetition.id, 'active');
                setShowPreviewModal(false);
                loadCompetitions();
                alert('Cup activated successfully!');
              } catch (err) {
                alert(`Failed to activate cup: ${err.message}`);
              }
            }}
          />
        )}
      </div>
  );
}

export default function CupManagementPage() {
  return <ProtectedRoute adminOnly><CupManagementContent /></ProtectedRoute>;
}

function CompetitionCard({ competition, onSetup, onPreview }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6 hover:shadow-lg transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg">
            <Trophy className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white">
              {competition.display_name}
            </h3>
            {competition.is_system_competition && (
              <span className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">
                System Competition
              </span>
            )}
          </div>
        </div>
        {getStatusBadge(competition.status)}
      </div>

      <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
        {competition.description}
      </p>

      <div className="flex gap-2">
        <button
          onClick={onSetup}
          className="flex-1 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700"
        >
          Setup Cup
        </button>
        {competition.status !== 'unconfigured' && (
          <button
            onClick={onPreview}
            className="flex-1 px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm font-medium rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600"
          >
            View Preview
          </button>
        )}
      </div>
    </div>
  );
}

function CupSetupModal({ competition, onClose, onComplete }) {
  const [step, setStep] = useState(1);
  const [seasonYear, setSeasonYear] = useState(new Date().getFullYear());
  const [config, setConfig] = useState({
    start_date: '',
    end_date: '',
    match_deadlines: {},
    has_group_stage: false,
    number_of_groups: 0,
    group_format: 'single_round_robin',
    teams_advance_per_group: 2,
    knockout_format: 'single_match',
    final_format: 'single_match'
  });
  const [qualifiedClubs, setQualifiedClubs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [configId, setConfigId] = useState(null);

  async function handleInitializeConfiguration() {
    setLoading(true);
    try {
      const configData = {
        ...config,
        match_deadlines: JSON.stringify(config.match_deadlines)
      };
      
      const newConfigId = await createCupConfiguration(competition.name, seasonYear, configData);
      setConfigId(newConfigId);
      
      // Auto-qualify clubs
      const count = await autoQualifyClubsForCup(newConfigId);
      alert(`${count} clubs auto-qualified for ${competition.display_name}`);
      
      setStep(2);
    } catch (err) {
      alert(`Failed to initialize: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleGeneratePreview() {
    setLoading(true);
    try {
      if (config.has_group_stage) {
        await generateCupGroupFixtures(configId);
      }
      
      const preview = await generateDraftPreview(configId);
      setQualifiedClubs(await getCupParticipants(configId));
      setStep(3);
    } catch (err) {
      alert(`Failed to generate preview: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              Setup {competition.display_name}
            </h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        <div className="p-6">
          {/* Step 1: Timeline & Format */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white mb-4">
                  Timeline & Deadlines
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Season Year
                    </label>
                    <input
                      type="number"
                      value={seasonYear}
                      onChange={(e) => setSeasonYear(parseInt(e.target.value))}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white px-4 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Start Date
                    </label>
                    <input
                      type="datetime-local"
                      value={config.start_date}
                      onChange={(e) => setConfig({...config, start_date: e.target.value})}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white px-4 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      End Date
                    </label>
                    <input
                      type="datetime-local"
                      value={config.end_date}
                      onChange={(e) => setConfig({...config, end_date: e.target.value})}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white px-4 py-2"
                    />
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white mb-4">
                  Group Stage
                </h3>
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="has_group_stage"
                      checked={config.has_group_stage}
                      onChange={(e) => setConfig({...config, has_group_stage: e.target.checked})}
                      className="rounded border-slate-300"
                    />
                    <label htmlFor="has_group_stage" className="text-sm text-slate-700 dark:text-slate-300">
                      Include Group Stage
                    </label>
                  </div>

                  {config.has_group_stage && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                          Number of Groups
                        </label>
                        <input
                          type="number"
                          value={config.number_of_groups}
                          onChange={(e) => setConfig({...config, number_of_groups: parseInt(e.target.value)})}
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white px-4 py-2"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                          Group Format
                        </label>
                        <select
                          value={config.group_format}
                          onChange={(e) => setConfig({...config, group_format: e.target.value})}
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white px-4 py-2"
                        >
                          <option value="single_round_robin">Single Round-Robin</option>
                          <option value="home_away">Home & Away</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                          Teams Advance Per Group
                        </label>
                        <input
                          type="number"
                          value={config.teams_advance_per_group}
                          onChange={(e) => setConfig({...config, teams_advance_per_group: parseInt(e.target.value)})}
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white px-4 py-2"
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white mb-4">
                  Knockout Stage Format
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Knockout Format
                    </label>
                    <select
                      value={config.knockout_format}
                      onChange={(e) => setConfig({...config, knockout_format: e.target.value})}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white px-4 py-2"
                    >
                      <option value="single_match">Single Match</option>
                      <option value="two_legged">Two-Legged (Home & Away)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Final Format
                    </label>
                    <select
                      value={config.final_format}
                      onChange={(e) => setConfig({...config, final_format: e.target.value})}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white px-4 py-2"
                    >
                      <option value="single_match">Single Match</option>
                      <option value="two_legged">Two-Legged (Home & Away)</option>
                    </select>
                  </div>
                </div>
              </div>

              <button
                onClick={handleInitializeConfiguration}
                disabled={loading}
                className="w-full px-6 py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {loading ? 'Initializing...' : 'Initialize & Auto-Qualify'}
              </button>
            </div>
          )}

          {/* Step 2: Group Assignment (if group stage) */}
          {step === 2 && config.has_group_stage && (
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white mb-4">
                  Assign Groups
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                  Assign qualified clubs to groups for the group stage.
                </p>
                {/* Group assignment interface would go here */}
                <p className="text-sm text-slate-500">
                  Group assignment interface - simplified for demo
                </p>
              </div>

              <button
                onClick={handleGeneratePreview}
                disabled={loading}
                className="w-full px-6 py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {loading ? 'Generating...' : 'Generate Draft Preview'}
              </button>
            </div>
          )}

          {/* Step 2: Direct to preview (no group stage) */}
          {step === 2 && !config.has_group_stage && (
            <div className="space-y-6">
              <div className="text-center py-8">
                <Check className="h-16 w-16 text-emerald-500 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                  Configuration Complete
                </h3>
                <p className="text-slate-600 dark:text-slate-400 mb-4">
                  Ready to generate fixture preview
                </p>
                <button
                  onClick={handleGeneratePreview}
                  disabled={loading}
                  className="px-6 py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {loading ? 'Generating...' : 'Generate Draft Preview'}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Preview */}
          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white mb-4">
                  Configuration Summary
                </h3>
                <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Season:</span>
                    <span className="font-medium text-slate-900 dark:text-white">{seasonYear}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Group Stage:</span>
                    <span className="font-medium text-slate-900 dark:text-white">{config.has_group_stage ? 'Yes' : 'No'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Knockout Format:</span>
                    <span className="font-medium text-slate-900 dark:text-white">{config.knockout_format.replace('_', ' ')}</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium rounded-lg"
                >
                  Back
                </button>
                <button
                  onClick={onComplete}
                  className="flex-1 px-4 py-2 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700"
                >
                  Complete Setup
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DraftPreviewModal({ preview, config, onClose, onActivate }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              Draft Preview - Road to the Final
            </h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Timeline */}
          <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-3">Timeline</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-slate-600 dark:text-slate-400">Start:</span>
                <span className="ml-2 font-medium text-slate-900 dark:text-white">
                  {preview.timeline?.start_date ? new Date(preview.timeline.start_date).toLocaleDateString() : 'Not set'}
                </span>
              </div>
              <div>
                <span className="text-slate-600 dark:text-slate-400">End:</span>
                <span className="ml-2 font-medium text-slate-900 dark:text-white">
                  {preview.timeline?.end_date ? new Date(preview.timeline.end_date).toLocaleDateString() : 'Not set'}
                </span>
              </div>
            </div>
          </div>

          {/* Fixture Preview */}
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white mb-3">
              Generated Fixtures ({preview.totalFixtures})
            </h3>
            <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4 max-h-64 overflow-y-auto">
              <div className="space-y-2">
                {preview.fixturePreview.map((fixture, index) => (
                  <div key={index} className="flex items-center justify-between text-sm p-2 bg-white dark:bg-slate-800 rounded">
                    <span className="text-slate-600 dark:text-slate-400">Match {index + 1}</span>
                    <span className="text-slate-900 dark:text-white">
                      {fixture.type} {fixture.format}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Bracket Preview */}
          {preview.bracketPreview && preview.bracketPreview.length > 0 && (
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white mb-3">
                Road to the Final
              </h3>
              <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4">
                <div className="space-y-2">
                  {preview.bracketPreview.map((round, index) => (
                    <div key={index} className="text-sm">
                      <span className="font-medium text-slate-900 dark:text-white">{round.round}</span>
                      <span className="text-slate-600 dark:text-slate-400 ml-2">({round.format})</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium rounded-lg"
            >
              Make Changes
            </button>
            <button
              onClick={onActivate}
              className="flex-1 px-4 py-2 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700"
            >
              Accept & Activate Cup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}