import { supabase } from './supabase.js';

export async function fetchMyFixtures(userId) {
  const { data, error } = await supabase
    .from('fixtures')
    .select('*')
    .or(`home_player_id.eq.${userId},away_player_id.eq.${userId}`)
    .order('fixture_date', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function fetchStandings(division) {
  let query = supabase
    .from('standings')
    .select('*')
    .order('points', { ascending: false })
    .order('goal_difference', { ascending: false })
    .order('goals_for', { ascending: false });

  if (division) query = query.eq('division', division);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function submitScore(fixture, homeScore, awayScore) {
  const { error } = await supabase
    .from('fixtures')
    .update({
      home_score: Number(homeScore),
      away_score: Number(awayScore),
      submitted_by: fixture.home_player_id,
      submitted_at: new Date().toISOString(),
      status: 'pending_confirmation',
    })
    .eq('id', fixture.id)
    .eq('home_player_id', fixture.home_player_id);
  if (error) throw error;
}

export async function confirmScore(fixtureId) {
  const { error } = await supabase.rpc('confirm_fixture_score', { fixture_id_input: fixtureId });
  if (error) throw error;
}

export async function disputeScore(fixtureId, reason) {
  const { error } = await supabase
    .from('fixtures')
    .update({
      status: 'disputed',
      dispute_reason: reason,
    })
    .eq('id', fixtureId);
  if (error) throw error;
}

export async function fetchDisputedFixtures() {
  const { data, error } = await supabase
    .from('fixtures')
    .select('*')
    .eq('status', 'disputed')
    .order('submitted_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function resolveDispute(fixtureId, homeScore, awayScore, notes) {
  const { error } = await supabase.rpc('admin_resolve_dispute', {
    fixture_id_input: fixtureId,
    home_score_input: Number(homeScore),
    away_score_input: Number(awayScore),
    notes_input: notes || 'Resolved by admin',
  });
  if (error) throw error;
}

export async function fetchPlayers(searchTerm = '') {
  let query = supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(100);
  if (searchTerm) {
    query = query.or(`email.ilike.%${searchTerm}%,gamertag.ilike.%${searchTerm}%,full_name.ilike.%${searchTerm}%`);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function updatePlayerApproval(playerId, isApproved) {
  const { error } = await supabase.from('profiles').update({ is_approved: isApproved }).eq('id', playerId);
  if (error) throw error;
}

export async function updatePlayerStatus(playerId, status) {
  const { error } = await supabase.from('profiles').update({ status }).eq('id', playerId);
  if (error) throw error;
}

export async function deductPlayerPoints(playerId, division, season, amount) {
  const { error } = await supabase.rpc('admin_deduct_points', {
    player_id_input: playerId,
    division_input: division,
    season_input: Number(season),
    penalty_points_input: Number(amount),
  });
  if (error) throw error;
}
