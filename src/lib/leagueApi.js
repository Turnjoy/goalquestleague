import { supabase } from './supabase.js';
import { getClubDivisionDisplayName, getClubDivisionStorageNames } from './divisions.js';

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
    .order('season_year', { ascending: false })
    .order('matchweek', { ascending: true });
  if (error) throw error;

  return (data ?? []).map(fixture => {
    const seasonDate = fixture.played_at ?? fixture.fixture_date;
    const seasonYear = fixture.season_year
      ?? (seasonDate ? new Date(seasonDate).getUTCFullYear() : new Date().getUTCFullYear());
    return {
      ...fixture,
      assignedClubId: assignmentsBySeason.get(seasonYear) ?? null,
    };
  });
}

const STANDINGS_PAGE_SIZE = 1000;

function normalizeSeasonYear(value) {
  const seasonYear = Number(value);
  return Number.isInteger(seasonYear) && seasonYear >= 2000 && seasonYear <= 2200
    ? seasonYear
    : null;
}

function normalizeStandingsFilters(divisionOrFilters, league, seasonYear) {
  const filters = typeof divisionOrFilters === 'object' && divisionOrFilters !== null
    ? divisionOrFilters
    : { division: divisionOrFilters, league, season: seasonYear };

  return {
    league: filters.league || filters.competition || null,
    division: filters.division || null,
    season: normalizeSeasonYear(filters.season ?? filters.seasonYear ?? filters.season_year),
  };
}

async function fetchAllPages(buildQuery) {
  const rows = [];
  for (let from = 0; ; from += STANDINGS_PAGE_SIZE) {
    const { data, error } = await buildQuery().range(from, from + STANDINGS_PAGE_SIZE - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < STANDINGS_PAGE_SIZE) return rows;
  }
}

function numericValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function compareStandingsRows(left, right) {
  return numericValue(right.points) - numericValue(left.points)
    || numericValue(right.goal_difference) - numericValue(left.goal_difference)
    || numericValue(right.goals_for) - numericValue(left.goals_for)
    || numericValue(right.played) - numericValue(left.played)
    || Number(Boolean(right.has_standings)) - Number(Boolean(left.has_standings))
    || (numericValue(left.club_number) || Number.MAX_SAFE_INTEGER) - (numericValue(right.club_number) || Number.MAX_SAFE_INTEGER)
    || String(left.club_name ?? '').localeCompare(String(right.club_name ?? ''));
}

function dedupeStandingsRows(rows) {
  const rowsByClub = new Map();
  for (const row of rows) {
    const key = row.club_id ?? row.id ?? [
      row.league_name,
      row.division,
      row.season,
      row.club_name ?? row.team_name,
    ].join('|');
    const existing = rowsByClub.get(key);
    if (!existing || compareStandingsRows(row, existing) < 0) rowsByClub.set(key, row);
  }
  return [...rowsByClub.values()];
}

function mapStandingsDirectoryRow(row) {
  const division = getClubDivisionDisplayName(row.league_name, row.division);
  return {
    ...row,
    division,
    division_name: division,
    club_name: row.club_name ?? row.team_name ?? 'Unassigned',
    team_name: row.club_name ?? row.team_name ?? 'Unassigned',
    player_name: row.manager_name || row.player_name || 'Unassigned',
    played: numericValue(row.played),
    won: numericValue(row.won),
    draw: numericValue(row.draw),
    lost: numericValue(row.lost),
    goals_for: numericValue(row.goals_for),
    goals_against: numericValue(row.goals_against),
    goal_difference: numericValue(row.goal_difference),
    penalty_points: numericValue(row.penalty_points),
    points: numericValue(row.points),
  };
}

export async function fetchStandings(divisionOrFilters = {}, league, seasonYear) {
  const filters = normalizeStandingsFilters(divisionOrFilters, league, seasonYear);
  let scopes = [{ league: filters.league, division: filters.division }];
  if (filters.league && filters.division) {
    scopes = getClubDivisionStorageNames(filters.league, filters.division)
      .map(division => ({ league: filters.league, division }));
  } else if (!filters.league && filters.division) {
    const options = await fetchStandingsOptions();
    scopes = options
      .filter(option => option.division === filters.division)
      .flatMap(option => getClubDivisionStorageNames(option.league_name, option.division)
        .map(division => ({ league: option.league_name, division })));
  }
  const rows = [];
  for (const scope of scopes) {
    const params = {};
    if (scope.league) params.p_league_name = scope.league;
    if (scope.division) params.p_division = scope.division;
    if (filters.season) params.p_season = filters.season;
    rows.push(...await fetchAllPages(() =>
      supabase.rpc('get_standings_directory', params, { get: true }),
    ));
  }

  return dedupeStandingsRows(rows)
    .map(mapStandingsDirectoryRow)
    .sort(compareStandingsRows);
}

export async function fetchStandingsOptions() {
  const rows = await fetchAllPages(() =>
    supabase.rpc('get_standings_filter_options', {}, { get: true }),
  );
  return rows.map(row => ({
    ...row,
    division: getClubDivisionDisplayName(row.league_name, row.division),
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

export async function adminResetFixture(fixtureId) {
  const { error } = await supabase.rpc('admin_reset_fixture_result', { fixture_id_input: fixtureId });
  if (error) throw error;
}

// Fetch all fixtures for admin viewing
export async function fetchAllFixtures(division = '', league = '') {
  let query = supabase
    .from('fixtures')
    .select('*')
    .order('season_year', { ascending: false })
    .order('matchweek', { ascending: true });
  
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
  if (division) {
    const divisions = leagueName ? getClubDivisionStorageNames(leagueName, division) : [division];
    query = divisions.length > 1 ? query.in('division', divisions) : query.eq('division', division);
  }
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

export async function generateClubFixtures(leagueName, division, seasonYear) {
  const divisionNames = getClubDivisionStorageNames(leagueName, division);
  const { data: existingClubs, error: lookupError } = await supabase
    .from('league_clubs')
    .select('division')
    .eq('league_name', leagueName)
    .in('division', divisionNames)
    .limit(1);
  if (lookupError) throw lookupError;
  const storedDivision = existingClubs?.[0]?.division || division;
  const startDate = `${seasonYear}-01-01`;
  const endDate = `${seasonYear}-12-31`;
  const { data, error } = await supabase.rpc('admin_generate_club_fixtures', {
    p_league_name: leagueName,
    p_division: storedDivision,
    p_start_date: startDate,
    p_end_date: endDate,
    p_stop_date: endDate,
  });
  if (error) throw error;
  return data;
}

export async function fetchClubTrophies(clubId) {
  const { data, error } = await supabase.rpc('get_club_trophies', {
    club_id_input: clubId,
  }, { get: true });
  if (error) throw error;
  return data ?? [];
}

export async function fetchManagerTrophies(managerId) {
  const { data, error } = await supabase.rpc('get_manager_trophies', {
    manager_id_input: managerId,
  }, { get: true });
  if (error) throw error;
  return data ?? [];
}

export async function awardClubTrophy(clubId, trophyName, season) {
  const { data, error } = await supabase.rpc('admin_award_club_trophy', {
    club_id_input: clubId,
    trophy_name_input: trophyName,
    season_input: Number(season),
  });
  if (error) throw error;
  return data;
}

export async function getInternationalBreak(leagueName, division, seasonYear) {
  const divisionNames = getClubDivisionStorageNames(leagueName, division);
  const { data: existingClubs, error: lookupError } = await supabase
    .from('league_clubs')
    .select('division')
    .eq('league_name', leagueName)
    .in('division', divisionNames)
    .limit(1);
  if (lookupError) throw lookupError;
  const storedDivision = existingClubs?.[0]?.division || division;
  const { data, error } = await supabase
    .from('league_international_breaks')
    .select('*')
    .eq('league_name', leagueName)
    .eq('division', storedDivision)
    .eq('season_year', seasonYear)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function syncInternationalBreak(leagueName, division, seasonYear, active) {
  const divisionNames = getClubDivisionStorageNames(leagueName, division);
  const { data: existingClubs, error: lookupError } = await supabase
    .from('league_clubs')
    .select('division')
    .eq('league_name', leagueName)
    .in('division', divisionNames)
    .limit(1);
  if (lookupError) throw lookupError;
  const storedDivision = existingClubs?.[0]?.division || division;
  const { data, error } = await supabase.rpc('sync_international_break', {
    p_league_name: leagueName,
    p_division: storedDivision,
    p_season_year: seasonYear,
    p_active: active,
  });
  if (error) throw error;
  return data;
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
