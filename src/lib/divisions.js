// Multi-League Structure: 10 Custom Leagues, each with 5 Tiers (20 players per tier)
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

// Division names retained by the existing database division catalog.
export const TIERS = [
  { name: 'Elite', tier: 1, slots: 20 },
  { name: 'Premier', tier: 2, slots: 100 },
  { name: 'Championship', tier: 3, slots: 100 },
  { name: 'Challenger', tier: 4, slots: 100 },
  { name: 'Contender', tier: 5, slots: 100 },
  { name: 'Advanced', tier: 6, slots: 100 },
  { name: 'Intermediate', tier: 7, slots: 100 },
  { name: 'Foundation', tier: 8, slots: 100 },
  { name: 'Development', tier: 9, slots: 100 },
  { name: 'Rookie', tier: 10, slots: 80 },
  { name: 'Trial', tier: 11, slots: null },
];

export const DIVISIONS = TIERS;

export const DIVISION_NAMES = DIVISIONS.map((division) => division.name);

export const LEAGUE_NAMES = LEAGUES.map((league) => league.name);
