import { supabase } from './supabase.js';

// Tournament Management Functions

export async function initializeTournament() {
  const { data, error } = await supabase.rpc('initialize_elite_world_cup');
  if (error) throw error;
  return data;
}

export async function getTournament() {
  const { data, error } = await supabase
    .from('world_cup_tournaments')
    .select('*')
    .eq('name', 'Elite World Cup')
    .eq('edition', '2031/2032')
    .single();
  if (error) throw error;
  return data;
}

export async function getAllTournaments() {
  const { data, error } = await supabase
    .from('world_cup_tournaments')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

// Country Management Functions

export async function getCountries(tournamentId) {
  const { data, error } = await supabase
    .from('world_cup_countries')
    .select('*')
    .eq('tournament_id', tournamentId)
    .order('country_name');
  if (error) throw error;
  return data;
}

export async function getCountryById(countryId) {
  const { data, error } = await supabase
    .from('world_cup_countries')
    .select('*')
    .eq('id', countryId)
    .single();
  if (error) throw error;
  return data;
}

export async function assignCountryToGroup(tournamentId, countryId, groupLetter) {
  const { error } = await supabase.rpc('assign_country_to_group', {
    tournament_id_input: tournamentId,
    country_id_input: countryId,
    group_letter_input: groupLetter
  });
  if (error) throw error;
}

export async function getGroupAssignments(tournamentId) {
  const { data, error } = await supabase
    .from('world_cup_groups')
    .select(`
      *,
      countries (*)
    `)
    .eq('tournament_id', tournamentId)
    .order('group_letter');
  if (error) throw error;
  return data;
}

export async function getCountriesByGroup(tournamentId, groupLetter) {
  const { data, error } = await supabase
    .from('world_cup_groups')
    .select(`
      *,
      countries (*)
    `)
    .eq('tournament_id', tournamentId)
    .eq('group_letter', groupLetter);
  if (error) throw error;
  return data;
}

// Manager Appointment Functions

export async function getAvailableManagers() {
  const currentYear = new Date().getFullYear();
  
  const { data, error } = await supabase
    .from('profiles')
    .select(`
      id,
      gamertag,
      manager_handle,
      full_name,
      season_club_assignments (
        club_id,
        season_year,
        league_clubs (
          club_name,
          league_name
        )
      )
    `)
    .eq('is_approved', true)
    .eq('status', 'active')
    .eq('is_admin', false);
  
  if (error) throw error;
  
  // Filter managers with current season assignments
  return data.filter(profile => 
    profile.season_club_assignments && 
    profile.season_club_assignments.some(
      assignment => assignment.season_year === currentYear
    )
  );
}

export async function appointCountryManager(tournamentId, countryId, managerId) {
  const { error } = await supabase.rpc('appoint_country_manager', {
    tournament_id_input: tournamentId,
    country_id_input: countryId,
    manager_id_input: managerId
  });
  if (error) throw error;
}

export async function getCountryManager(tournamentId, countryId) {
  const { data, error } = await supabase
    .from('world_cup_manager_appointments')
    .select(`
      *,
      profiles (
        id,
        gamertag,
        manager_handle,
        full_name
      )
    `)
    .eq('tournament_id', tournamentId)
    .eq('country_id', countryId)
    .eq('is_current', true)
    .single();
  if (error) throw error;
  return data;
}

export async function getCountryManagerHistory(tournamentId, countryId) {
  const { data, error } = await supabase
    .from('world_cup_manager_appointments')
    .select(`
      *,
      profiles (
        id,
        gamertag,
        manager_handle,
        full_name
      ),
      admin_profiles:appointed_by (
        gamertag,
        manager_handle,
        full_name
      )
    `)
    .eq('tournament_id', tournamentId)
    .eq('country_id', countryId)
    .order('appointment_date', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getAllManagerAppointments(tournamentId) {
  const { data, error } = await supabase
    .from('world_cup_manager_appointments')
    .select(`
      *,
      countries (*),
      profiles (
        id,
        gamertag,
        manager_handle,
        full_name
      )
    `)
    .eq('tournament_id', tournamentId)
    .eq('is_current', true);
  if (error) throw error;
  return data;
}

// Fixture Management Functions

export async function generateGroupFixtures(tournamentId) {
  const { data, error } = await supabase.rpc('generate_world_cup_group_fixtures', {
    tournament_id_input: tournamentId
  });
  if (error) throw error;
  return data;
}

export async function getFixtures(tournamentId, filters = {}) {
  let query = supabase
    .from('world_cup_fixtures')
    .select(`
      *,
      home_country:home_country_id (*),
      away_country:away_country_id (*)
    `)
    .eq('tournament_id', tournamentId);

  if (filters.matchType) {
    query = query.eq('match_type', filters.matchType);
  }
  if (filters.groupLetter) {
    query = query.eq('group_letter', filters.groupLetter);
  }
  if (filters.knockoutRound) {
    query = query.eq('knockout_round', filters.knockoutRound);
  }
  if (filters.status) {
    query = query.eq('status', filters.status);
  }

  const { data, error } = await query.order('match_number', { ascending: true });
  if (error) throw error;
  return data;
}

export async function getFixtureById(fixtureId) {
  const { data, error } = await supabase
    .from('world_cup_fixtures')
    .select(`
      *,
      home_country:home_country_id (*),
      away_country:away_country_id (*)
    `)
    .eq('id', fixtureId)
    .single();
  if (error) throw error;
  return data;
}

export async function submitFixtureResult(fixtureId, homeScore, awayScore) {
  const { error } = await supabase.rpc('submit_world_cup_fixture_result', {
    fixture_id_input: fixtureId,
    home_score_input: homeScore,
    away_score_input: awayScore
  });
  if (error) throw error;
}

export async function updateFixtureDate(fixtureId, fixtureDate) {
  const { error } = await supabase
    .from('world_cup_fixtures')
    .update({ fixture_date: fixtureDate })
    .eq('id', fixtureId);
  if (error) throw error;
}

export async function updateFixtureVenue(fixtureId, venue) {
  const { error } = await supabase
    .from('world_cup_fixtures')
    .update({ venue })
    .eq('id', fixtureId);
  if (error) throw error;
}

// Standings Functions

export async function getGroupStandings(tournamentId, groupLetter = null) {
  let query = supabase
    .from('world_cup_standings')
    .select(`
      *,
      countries (*)
    `)
    .eq('tournament_id', tournamentId);

  if (groupLetter) {
    query = query.eq('group_letter', groupLetter);
  }

  const { data, error } = await query.order('group_letter').order('position');
  if (error) throw error;
  return data;
}

export async function calculateGroupStandings(tournamentId, groupLetter) {
  const { error } = await supabase.rpc('calculate_world_cup_group_standings', {
    tournament_id_input: tournamentId,
    group_letter_input: groupLetter
  });
  if (error) throw error;
}

export async function getAllGroupStandings(tournamentId) {
  const { data, error } = await supabase
    .from('world_cup_standings')
    .select(`
      *,
      countries (*)
    `)
    .eq('tournament_id', tournamentId)
    .order('group_letter')
    .order('position');
  if (error) throw error;
  return data;
}

// Knockout Progression Functions

export async function getKnockoutProgression(tournamentId) {
  const { data, error } = await supabase
    .from('world_cup_knockout_progression')
    .select(`
      *,
      countries (*)
    `)
    .eq('tournament_id', tournamentId)
    .order('round')
    .order('position_in_bracket');
  if (error) throw error;
  return data;
}

// Tournament Status Functions

export async function updateTournamentStatus(tournamentId, status) {
  const { error } = await supabase
    .from('world_cup_tournaments')
    .update({ status })
    .eq('id', tournamentId);
  if (error) throw error;
}

export async function updateTournamentDates(tournamentId, dates) {
  const { error } = await supabase
    .from('world_cup_tournaments')
    .update(dates)
    .eq('id', tournamentId);
  if (error) throw error;
}

// Utility Functions

export async function getTournamentSummary(tournamentId) {
  const [tournament, countries, fixtures, standings, appointments] = await Promise.all([
    getTournament(),
    getCountries(tournamentId),
    getFixtures(tournamentId),
    getAllGroupStandings(tournamentId),
    getAllManagerAppointments(tournamentId)
  ]);

  return {
    tournament,
    countries: countries.length,
    totalFixtures: fixtures.length,
    completedFixtures: fixtures.filter(f => f.status === 'completed').length,
    groupStandings: standings,
    managerAppointments: appointments.length
  };
}

export async function getGroupFixtures(tournamentId, groupLetter) {
  return getFixtures(tournamentId, { matchType: 'group_stage', groupLetter });
}

export async function getKnockoutFixtures(tournamentId, round = null) {
  return getFixtures(tournamentId, { matchType: 'knockout', knockoutRound: round });
}

// Knockout Stage Generation Functions

export async function generateKnockoutFixtures(tournamentId) {
  const { data, error } = await supabase.rpc('generate_world_cup_knockout_fixtures', {
    tournament_id_input: tournamentId
  });
  if (error) throw error;
  return data;
}

export async function generateRoundOf16(tournamentId) {
  const { data, error } = await supabase.rpc('generate_world_cup_round_of_16', {
    tournament_id_input: tournamentId
  });
  if (error) throw error;
  return data;
}

export async function generateQuarterFinals(tournamentId) {
  const { data, error } = await supabase.rpc('generate_world_cup_quarter_finals', {
    tournament_id_input: tournamentId
  });
  if (error) throw error;
  return data;
}

export async function generateSemiFinals(tournamentId) {
  const { data, error } = await supabase.rpc('generate_world_cup_semi_finals', {
    tournament_id_input: tournamentId
  });
  if (error) throw error;
  return data;
}

export async function generateFinal(tournamentId) {
  const { data, error } = await supabase.rpc('generate_world_cup_final', {
    tournament_id_input: tournamentId
  });
  if (error) throw error;
  return data;
}