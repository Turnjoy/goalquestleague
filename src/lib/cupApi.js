import { supabase } from './supabase.js';

// Competition Management Functions

export async function seedSystemCupCompetitions() {
  const { error } = await supabase.rpc('seed_system_cup_competitions');
  if (error) throw error;
}

export async function getAllCupCompetitions() {
  const { data, error } = await supabase
    .from('cup_competitions')
    .select('*')
    .order('is_system_competition', { ascending: false })
    .order('name');
  if (error) throw error;
  return data;
}

export async function getCupCompetition(cupId) {
  const { data, error } = await supabase
    .from('cup_competitions')
    .select('*')
    .eq('id', cupId)
    .single();
  if (error) throw error;
  return data;
}

export async function getCupCompetitionByName(cupName) {
  const { data, error } = await supabase
    .from('cup_competitions')
    .select('*')
    .eq('name', cupName)
    .single();
  if (error) throw error;
  return data;
}

// Configuration Functions

export async function createCupConfiguration(cupName, seasonYear, configData) {
  const { data, error } = await supabase.rpc('create_cup_configuration', {
    cup_name: cupName,
    season_year: seasonYear,
    config_data: configData
  });
  if (error) throw error;
  return data;
}

export async function getCupConfiguration(configId) {
  const { data, error } = await supabase
    .from('cup_configurations')
    .select(`
      *,
      cup_competitions (*)
    `)
    .eq('id', configId)
    .single();
  if (error) throw error;
  return data;
}

export async function getCupConfigurations(cupId, seasonYear) {
  const { data, error } = await supabase
    .from('cup_configurations')
    .select('*')
    .eq('cup_id', cupId)
    .eq('season_year', seasonYear)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function updateCupConfiguration(configId, updates) {
  const { error } = await supabase
    .from('cup_configurations')
    .update(updates)
    .eq('id', configId);
  if (error) throw error;
}

// Qualification Functions

export async function getQualifiedClubsForCup(cupName, seasonYear) {
  const { data, error } = await supabase.rpc('get_qualified_clubs_for_cup', {
    cup_name: cupName,
    season_year: seasonYear
  });
  if (error) throw error;
  return data;
}

export async function autoQualifyClubsForCup(configId) {
  const { data, error } = await supabase.rpc('auto_qualify_clubs_for_cup', {
    config_id: configId
  });
  if (error) throw error;
  return data;
}

export async function getCupParticipants(configId) {
  const { data, error } = await supabase
    .from('cup_participants')
    .select(`
      *,
      league_clubs (*)
    `)
    .eq('cup_config_id', configId)
    .order('group_assignment')
    .order('qualification_rank');
  if (error) throw error;
  return data;
}

export async function assignParticipantGroups(configId, groupAssignments) {
  // groupAssignments: { clubId: groupLetter }
  const updates = Object.entries(groupAssignments).map(([clubId, groupLetter]) =>
    supabase
      .from('cup_participants')
      .update({ group_assignment: groupLetter })
      .eq('cup_config_id', configId)
      .eq('club_id', clubId)
  );

  const results = await Promise.all(updates);
  const errors = results.filter(r => r.error);
  if (errors.length > 0) throw errors[0].error;
}

// Fixture Generation Functions

export async function generateCupGroupFixtures(configId) {
  const { data, error } = await supabase.rpc('generate_cup_group_fixtures', {
    config_id: configId
  });
  if (error) throw error;
  return data;
}

export async function getCupFixtures(configId, filters = {}) {
  let query = supabase
    .from('cup_fixtures')
    .select(`
      *,
      home_club:league_clubs!home_club_id (
        club_name,
        league_name,
        division,
        club_number
      ),
      away_club:league_clubs!away_club_id (
        club_name,
        league_name,
        division,
        club_number
      )
    `)
    .eq('cup_config_id', configId);

  if (filters.roundName) {
    query = query.eq('round_name', filters.roundName);
  }
  if (filters.groupLetter) {
    query = query.eq('group_letter', filters.groupLetter);
  }
  if (filters.status) {
    query = query.eq('status', filters.status);
  }

  const { data, error } = await query.order('match_number', { ascending: true });
  if (error) throw error;
  return data;
}

export async function updateCupFixtureDate(fixtureId, fixtureDate) {
  const { error } = await supabase
    .from('cup_fixtures')
    .update({ fixture_date: fixtureDate })
    .eq('id', fixtureId);
  if (error) throw error;
}

export async function updateCupFixtureDeadline(fixtureId, deadline) {
  const { error } = await supabase
    .from('cup_fixtures')
    .update({ deadline })
    .eq('id', fixtureId);
  if (error) throw error;
}

export async function submitCupFixtureResult(fixtureId, homeScore, awayScore, extraTimeScores = null, penaltyScores = null) {
  const updateData = {
    home_score: homeScore,
    away_score: awayScore,
    status: 'completed',
    played_at: new Date().toISOString(),
    submitted_by: (await supabase.auth.getUser()).data.user?.id,
    submitted_at: new Date().toISOString()
  };

  if (extraTimeScores) {
    updateData.home_extra_time_score = extraTimeScores.home;
    updateData.away_extra_time_score = extraTimeScores.away;
  }

  if (penaltyScores) {
    updateData.home_penalty_shootout = penaltyScores.home;
    updateData.away_penalty_shootout = penaltyScores.away;
  }

  const { error } = await supabase
    .from('cup_fixtures')
    .update(updateData)
    .eq('id', fixtureId);
  if (error) throw error;
}

// Standings Functions

export async function getCupStandings(configId, groupLetter = null) {
  let query = supabase
    .from('cup_standings')
    .select(`
      *,
      league_clubs (*)
    `)
    .eq('cup_config_id', configId);

  if (groupLetter) {
    query = query.eq('group_letter', groupLetter);
  }

  const { data, error } = await query.order('group_letter').order('position');
  if (error) throw error;
  return data;
}

export async function calculateCupGroupStandings(configId, groupLetter) {
  // Custom calculation logic for cup standings
  const fixtures = await getCupFixtures(configId, { groupLetter });
  const participants = await getCupParticipants(configId);
  
  const groupParticipants = participants.filter(p => p.group_assignment === groupLetter);
  const standings = {};

  // Initialize standings
  groupParticipants.forEach(p => {
    standings[p.club_id] = {
      club_id: p.club_id,
      club_name: p.league_clubs?.club_name,
      played: 0,
      won: 0,
      draw: 0,
      lost: 0,
      goals_for: 0,
      goals_against: 0,
      points: 0
    };
  });

  // Calculate from fixtures
  fixtures.forEach(fixture => {
    if (fixture.status !== 'completed' || !fixture.home_score || !fixture.away_score) return;

    const homeClub = standings[fixture.home_club_id];
    const awayClub = standings[fixture.away_club_id];

    if (homeClub && awayClub) {
      homeClub.played++;
      awayClub.played++;
      homeClub.goals_for += fixture.home_score;
      homeClub.goals_against += fixture.away_score;
      awayClub.goals_for += fixture.away_score;
      awayClub.goals_against += fixture.home_score;

      if (fixture.home_score > fixture.away_score) {
        homeClub.won++;
        homeClub.points += 3;
        awayClub.lost++;
      } else if (fixture.home_score < fixture.away_score) {
        awayClub.won++;
        awayClub.points += 3;
        homeClub.lost++;
      } else {
        homeClub.draw++;
        awayClub.draw++;
        homeClub.points += 1;
        awayClub.points += 1;
      }
    }
  });

  // Convert to array and sort
  const standingsArray = Object.values(standings).map(s => ({
    ...s,
    goal_difference: s.goals_for - s.goals_against
  })).sort((a, b) => 
    b.points - a.points ||
    b.goal_difference - a.goal_difference ||
    b.goals_for - a.goals_for
  );

  // Update positions
  standingsArray.forEach((s, index) => {
    s.position = index + 1;
  });

  return standingsArray;
}

// Activation Functions

export async function activateCupConfiguration(configId) {
  const { error } = await supabase.rpc('activate_cup_configuration', {
    config_id: configId
  });
  if (error) throw error;
}

export async function updateCupStatus(cupId, status) {
  const { error } = await supabase
    .from('cup_competitions')
    .update({ status })
    .eq('id', cupId);
  if (error) throw error;
}

// Utility Functions

export async function getCupSummary(cupId, seasonYear) {
  const cup = await getCupCompetition(cupId);
  const [config, participants] = await Promise.all([
    getCupConfigurations(cupId, seasonYear),
    getQualifiedClubsForCup(cup.name, seasonYear)
  ]);

  return {
    cup,
    config: config[0] || null,
    qualifiedTeams: participants?.length || 0,
    totalFixtures: 0, // Will be calculated when fixtures exist
    completedFixtures: 0
  };
}

export async function generateDraftPreview(configId) {
  const config = await getCupConfiguration(configId);
  const participants = await getCupParticipants(configId);
  
  let fixturePreview = [];
  let bracketPreview = [];

  if (config.has_group_stage) {
    // Generate group stage preview
    const groups = {};
    participants.forEach(p => {
      if (!groups[p.group_assignment]) {
        groups[p.group_assignment] = [];
      }
      groups[p.group_assignment].push(p);
    });

    Object.entries(groups).forEach(([groupLetter, teams]) => {
      const groupFixtures = generateGroupFixturePreview(teams, config.group_format);
      fixturePreview.push(...groupFixtures);
    });
  } else {
    // Generate knockout preview
    bracketPreview = generateKnockoutBracketPreview(participants, config.knockout_format);
    fixturePreview = generateKnockoutFixturePreview(participants, config.knockout_format);
  }

  return {
    fixturePreview,
    bracketPreview,
    totalFixtures: fixturePreview.length,
    timeline: {
      start_date: config.start_date,
      end_date: config.end_date,
      match_deadlines: config.match_deadlines
    }
  };
}

function generateGroupFixturePreview(teams, format) {
  const fixtures = [];
  const teamIds = teams.map(t => t.club_id);

  if (format === 'single_round_robin') {
    for (let i = 0; i < teamIds.length; i++) {
      for (let j = i + 1; j < teamIds.length; j++) {
        fixtures.push({
          type: 'group',
          home: teamIds[i],
          away: teamIds[j],
          format: 'single'
        });
      }
    }
  } else {
    for (let i = 0; i < teamIds.length; i++) {
      for (let j = 0; j < teamIds.length; j++) {
        if (i !== j) {
          fixtures.push({
            type: 'group',
            home: teamIds[i],
            away: teamIds[j],
            format: 'home_away'
          });
        }
      }
    }
  }

  return fixtures;
}

function generateKnockoutBracketPreview(participants, format) {
  const teams = participants.map(p => p.club_id);
  const bracket = [];
  
  // Simple bracket structure - can be enhanced
  const rounds = ['Round of 16', 'Quarter-Finals', 'Semi-Finals', 'Final'];
  let teamsInRound = teams;
  
  rounds.forEach((round, roundIndex) => {
    const matchesInRound = Math.ceil(teamsInRound.length / 2);
    for (let i = 0; i < matchesInRound; i++) {
      bracket.push({
        round,
        match: i + 1,
        teams: teamsInRound.slice(i * 2, (i + 1) * 2),
        format
      });
    }
    teamsInRound = teamsInRound.slice(0, matchesInRound);
  });

  return bracket;
}

function generateKnockoutFixturePreview(participants, format) {
  const fixtures = [];
  const teams = participants.map(p => p.club_id);
  
  // Generate sequential knockout fixtures
  let currentRound = teams;
  let roundNumber = 1;
  
  while (currentRound.length > 1) {
    const matchesInRound = Math.ceil(currentRound.length / 2);
    for (let i = 0; i < matchesInRound; i++) {
      const homeTeam = currentRound[i * 2];
      const awayTeam = currentRound[i * 2 + 1];
      
      if (homeTeam && awayTeam) {
        fixtures.push({
          type: 'knockout',
          round: roundNumber,
          home: homeTeam,
          away: awayTeam,
          format
        });
      }
    }
    
    currentRound = currentRound.slice(0, matchesInRound);
    roundNumber++;
  }

  return fixtures;
}