import { supabase } from './supabase.js';

export async function fetchMyFixtures(userId) {
  const { data: assignments, error: assignmentsError } = await supabase
    .from('season_club_assignments')
    .select('season_year, club_id')
    .eq('player_id', userId);
  if (assignmentsError) throw assignmentsError;

  const assignmentsBySeason = new Map(
    (assignments ?? []).map(assignment => [assignment.season_year, assignment.club_id]),
  );
  const clubIds = [...new Set(assignmentsBySeason.values())];
  const fixtureFilters = [`home_player_id.eq.${userId}`, `away_player_id.eq.${userId}`];
  if (clubIds.length > 0) {
    const clubIdFilter = clubIds.join(',');
    fixtureFilters.push(`home_club_id.in.(${clubIdFilter})`, `away_club_id.in.(${clubIdFilter})`);
  }

  const { data, error } = await supabase
    .from('fixtures')
    .select('*')
    .or(fixtureFilters.join(','))
    .order('fixture_date', { ascending: true });
  if (error) throw error;

  return (data ?? []).map(fixture => {
    const seasonYear = fixture.season_year ?? (
      fixture.fixture_date ? new Date(fixture.fixture_date).getUTCFullYear() : null
    );
    return {
      ...fixture,
      assignedClubId: seasonYear === null ? null : assignmentsBySeason.get(seasonYear) ?? null,
    };
  });
}

export async function fetchStandings(division, league) {
  let query = supabase
    .from('standings')
    .select('*')
    .order('points', { ascending: false })
    .order('goal_difference', { ascending: false })
    .order('goals_for', { ascending: false });

  if (division) query = query.eq('division', division);
  if (league) query = query.eq('league_name', league);
  
  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map(row => ({
    ...row,
    division_name: row.division,
  }));
}

export async function confirmScore(fixtureId) {
  const { error } = await supabase.rpc('confirm_fixture_score', { fixture_id_input: fixtureId });
  if (error) throw error;
}

export async function disputeScore(fixtureId, reason) {
  const { error } = await supabase.rpc('dispute_fixture_score', {
    fixture_id_input: fixtureId,
    reason_input: reason,
  });
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

// Admin score submission - admin can submit scores for any fixture
// Uses the existing admin_resolve_dispute RPC function for reliability
export async function adminSubmitScore(fixtureId, homeScore, awayScore, adminNotes = '') {
  const { error } = await supabase.rpc('admin_resolve_dispute', {
    fixture_id_input: fixtureId,
    home_score_input: Number(homeScore),
    away_score_input: Number(awayScore),
    notes_input: adminNotes || 'Score submitted by admin',
  });
  if (error) {
    console.error('Admin score submission error:', error);
    throw error;
  }
}

// Fetch all fixtures for admin viewing
export async function fetchAllFixtures(division = '', league = '') {
  let query = supabase
    .from('fixtures')
    .select('*')
    .order('fixture_date', { ascending: true });
  
  if (division) query = query.eq('division', division);
  if (league) query = query.eq('league_name', league);
  
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function fetchPlayers(searchTerm = '', leagueName = '', division = '') {
  let query = supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(100);
  if (searchTerm) {
    query = query.or(`email.ilike.%${searchTerm}%,manager_handle.ilike.%${searchTerm}%,gamertag.ilike.%${searchTerm}%,full_name.ilike.%${searchTerm}%,whatsapp_number.ilike.%${searchTerm}%`);
  }
  if (leagueName) query = query.eq('league_name', leagueName);
  if (division) query = query.eq('division', division);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function updatePlayerLeague(playerId, leagueName) {
  const { error } = await supabase.from('profiles').update({ league_name: leagueName }).eq('id', playerId);
  if (error) throw error;
}

export async function updatePlayerApproval(playerId, isApproved) {
  const { error } = await supabase.rpc('admin_approve_player', {
    player_id_input: playerId,
    approved_input: isApproved,
  });
  if (error) throw error;
}

export async function rejectPlayer(playerId) {
  const { error } = await supabase.rpc('admin_reject_player', {
    player_id_input: playerId,
  });
  if (error) throw error;
}

export async function reassignPlayer(playerId, division) {
  const { error } = await supabase.rpc('admin_reassign_player', {
    player_id_input: playerId,
    division_input: division,
  });
  if (error) throw error;
}

// Reassign player with team name and inherit fixtures/results from old player
export async function reassignPlayerWithTeam(playerId, division, teamName, inheritFromPlayerId = null) {
  // First update the player's division and team
  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      division_name: division,
      team_name: teamName,
    })
    .eq('id', playerId);

  if (updateError) throw updateError;

  // If inheriting from another player, transfer fixtures and standings
  if (inheritFromPlayerId) {
    // Transfer fixtures: update home_player_id or away_player_id
    await supabase
      .from('fixtures')
      .update({ home_player_id: playerId })
      .eq('home_player_id', inheritFromPlayerId);

    await supabase
      .from('fixtures')
      .update({ away_player_id: playerId })
      .eq('away_player_id', inheritFromPlayerId);

    // Transfer standings: update player_id and keep results
    const { data: oldStandings } = await supabase
      .from('standings')
      .select('*')
      .eq('player_id', inheritFromPlayerId)
      .single();

    if (oldStandings) {
      await supabase
        .from('standings')
        .update({
          player_id: playerId,
          team_name: teamName,
        })
        .eq('player_id', inheritFromPlayerId);
    }
  }
}

// Retire player - move to Trial division
export async function retirePlayer(playerId) {
  const { error } = await supabase
    .from('profiles')
    .update({
      division_name: 'Trial',
      status: 'retired',
    })
    .eq('id', playerId);

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

export async function generateClubFixtures(leagueName, division, startDate, endDate, stopDate) {
  const { data, error } = await supabase.rpc('admin_generate_club_fixtures', {
    p_league_name: leagueName,
    p_division: division,
    p_start_date: startDate,
    p_end_date: endDate,
    p_stop_date: stopDate,
  });
  if (error) throw error;
  return data;
}

export async function rescheduleFixture(fixtureId, newDate) {
  const { error } = await supabase.rpc('admin_reschedule_fixture', {
    fixture_id_input: fixtureId,
    new_date_input: newDate,
  });
  if (error) throw error;
}

export async function permanentBanPlayer(playerId, banReason, notes) {
  const { error } = await supabase.rpc('admin_permanent_ban_player', {
    player_id_input: playerId,
    ban_reason_input: banReason,
    notes_input: notes,
  });
  if (error) throw error;
}

export async function liftBan(playerId, newDivision) {
  const { error } = await supabase.rpc('admin_lift_ban', {
    player_id_input: playerId,
    new_division_input: newDivision,
  });
  if (error) throw error;
}

export async function fetchBannedUsers() {
  const { data, error } = await supabase
    .from('banned_users')
    .select('*')
    .order('banned_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchUserSquad(userId) {
  const { data, error } = await supabase
    .from('squad_rosters')
    .select('*')
    .eq('user_id', userId)
    .order('player_rating', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function submitSquad(userId, squadData) {
  const { error } = await supabase
    .from('squad_rosters')
    .insert(squadData.map(player => ({
      user_id: userId,
      player_name: player.player_name.trim(),
      player_rating: parseInt(player.player_rating),
      is_initial: true,
      added_via: 'initial'
    })));
  if (error) throw error;
}

export async function lockUserSquad(userId) {
  const { error } = await supabase
    .from('profiles')
    .update({
      squad_locked: true,
      initial_squad_submitted_at: new Date().toISOString()
    })
    .eq('id', userId);
  if (error) throw error;
}
