// Ten leagues each use the same five 20-player divisions.
export const LEAGUES = [
  { name: 'Apex Football League', tiers: 5, playersPerTier: 20, maxPlayers: 100 },
  { name: 'Crown Super League', tiers: 5, playersPerTier: 20, maxPlayers: 100 },
  { name: 'Diamond Elite League', tiers: 5, playersPerTier: 20, maxPlayers: 100 },
  { name: 'Platinum Champions League', tiers: 5, playersPerTier: 20, maxPlayers: 100 },
  { name: 'Gold Masters League', tiers: 5, playersPerTier: 20, maxPlayers: 100 },
  { name: 'Silver Stars League', tiers: 5, playersPerTier: 20, maxPlayers: 100 },
  { name: 'Bronze Victory League', tiers: 5, playersPerTier: 20, maxPlayers: 100 },
  { name: 'Copper Legends League', tiers: 5, playersPerTier: 20, maxPlayers: 100 },
  { name: 'Iron Warriors League', tiers: 5, playersPerTier: 20, maxPlayers: 100 },
  { name: 'Steel Titans League', tiers: 5, playersPerTier: 20, maxPlayers: 100 },
];

// The five competitive divisions, ordered from highest to lowest.
export const TIERS = [
  { name: 'Elite', tier: 1, slots: 20 },
  { name: 'Premier', tier: 2, slots: 20 },
  { name: 'Championship', tier: 3, slots: 20 },
  { name: 'Challenger', tier: 4, slots: 20 },
  { name: 'Contender', tier: 5, slots: 20 },
];

export const DIVISIONS = TIERS;

export const DIVISION_NAMES = DIVISIONS.map((division) => division.name);
export const UNASSIGNED_DIVISION = 'Trial';

export const LEAGUE_NAMES = LEAGUES.map((league) => league.name);

export const CLUB_LEAGUE_DIVISIONS = {
  'Apex Football League': ['Premier'],
  'Diamond Elite League': ['Elite'],
};

export const CLUB_LEAGUE_NAMES = Object.keys(CLUB_LEAGUE_DIVISIONS);
