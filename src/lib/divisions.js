const leagueDivisionNames = {
  'Apex Football League': ['Premier', 'Apex Vanguard', 'Apex Arena', 'Apex Circuit', 'Apex Outpost'],
  'Crown Super League': ['Royal Division', 'Crown Sovereign', 'Crown Throne', 'Crown Regency', 'Crown Manor'],
  'Diamond Elite League': ['Elite', 'Diamond Prism', 'Diamond Facet', 'Diamond Vault', 'Diamond Core'],
  'Platinum Champions League': ['Championship', 'Platinum Masters', 'Platinum Citadel', 'Platinum Forge', 'Platinum Crucible'],
  'Gold Masters League': ['Grandmaster', 'Gold Aurum', 'Gold Bullion', 'Gold Reserve', 'Gold Ingot'],
  'Silver Stars League': ['Supernova', 'Silver Sterling', 'Silver Comet', 'Silver Orbit', 'Silver Horizon'],
  'Bronze Victory League': ['Triumph Division', 'Bronze Valor', 'Bronze Conquest', 'Bronze Legion', 'Bronze Garrison'],
  'Copper Legends League': ['Mythic Division', 'Copper Odyssey', 'Copper Saga', 'Copper Relic', 'Copper Roots'],
  'Iron Warriors League': ['Iron Fortress', 'Vanguard Bastion', 'Steel Bulwark', 'Armor Citadel', 'Siege Ground'],
  'Steel Titans League': ['Titan Core', 'Colossus Ring', 'Alloy Arena', 'Forge Circuit', 'Metal Vanguard'],
};

export const LEAGUES = Object.entries(leagueDivisionNames).map(([name, divisions]) => ({
  name,
  tiers: divisions.length,
  playersPerTier: 20,
  maxPlayers: 100,
  divisions: divisions.map((divisionName, index) => ({
    name: divisionName,
    tier: index + 1,
    slots: 20,
  })),
}));

LEAGUES.push({
  name: 'Trial',
  tiers: 1,
  playersPerTier: null,
  maxPlayers: null,
  divisions: [{ name: 'Trial Division', tier: 1, slots: null }],
});

export const TIERS = LEAGUES[0].divisions;
export const DIVISIONS = [...LEAGUES.slice(0, 10).flatMap(league => league.divisions), ...LEAGUES[10].divisions];
export const DIVISION_NAMES = [...new Set([...DIVISIONS.map(division => division.name), 'Trial'])];
export const UNASSIGNED_DIVISION = 'Trial';
export const LEAGUE_NAMES = LEAGUES.map(league => league.name);

// Club screens show the ten competitive leagues. Trial is an unassigned player pool.
export const CLUB_LEAGUE_DIVISIONS = Object.fromEntries(
  LEAGUES.slice(0, 10).map(league => [league.name, league.divisions.map(division => division.name)]),
);
export const CLUB_LEAGUE_NAMES = Object.keys(CLUB_LEAGUE_DIVISIONS);
