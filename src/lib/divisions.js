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

// Tier names within each league
export const TIERS = [
  { name: 'Premier Division', tier: 1, slots: 20 },
  { name: 'Championship', tier: 2, slots: 20 },
  { name: 'Division 1', tier: 3, slots: 20 },
  { name: 'Division 2', tier: 4, slots: 20 },
  { name: 'Division 3', tier: 5, slots: 20 },
];

// Legacy divisions array for backward compatibility
export const DIVISIONS = TIERS;

export const DIVISION_NAMES = DIVISIONS.map((division) => division.name);

export const LEAGUE_NAMES = LEAGUES.map((league) => league.name);
