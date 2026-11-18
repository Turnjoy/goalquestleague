const leagueDivisionNames = {
  'Apex Football League': ['Premier', 'Apex Vanguard', 'Apex Arena', 'Apex Circuit', 'Apex Outpost'],
  'Crown Super League': ['Royal', 'Sovereign', 'Throne', 'Regency', 'Manor'],
  'Diamond Elite League': ['Elite', 'Prism', 'Facet', 'Vault', 'Core'],
  'Platinum Champions League': ['Championship', 'Masters', 'Citadel', 'Forge', 'Crucible'],
  'Gold Masters League': ['Grandmaster', 'Aurum', 'Bullion', 'Reserve', 'Ingot'],
  'Silver Stars League': ['Supernova', 'Sterling', 'Comet', 'Orbit', 'Horizon'],
  'Bronze Victory League': ['Triumph', 'Valor', 'Conquest', 'Legion', 'Garrison'],
  'Copper Legends League': ['Mythic', 'Odyssey', 'Saga', 'Relic', 'Roots'],
  'Iron Warriors League': ['Iron Fortress', 'Vanguard Bastion', 'Steel Bulwark', 'Armor Citadel', 'Siege Ground'],
  'Steel Titans League': ['Titan Core', 'Colossus Ring', 'Alloy Arena', 'Forge Circuit', 'Metal Vanguard'],
};

// The live database may have the earlier tier labels until the matching SQL
// rename migration is applied. Read/write helpers keep club assignment usable
// during that transition while presenting the requested names in the UI.
const legacyClubDivisionNames = {
  'Crown Super League': {
    Royal: 'Royal Division', Sovereign: 'Crown Sovereign', Throne: 'Crown Throne',
    Regency: 'Crown Regency', Manor: 'Crown Manor',
  },
  'Diamond Elite League': {
    Prism: 'Diamond Prism', Facet: 'Diamond Facet', Vault: 'Diamond Vault', Core: 'Diamond Core',
  },
  'Platinum Champions League': {
    Masters: 'Platinum Masters', Citadel: 'Platinum Citadel', Forge: 'Platinum Forge',
    Crucible: 'Platinum Crucible',
  },
  'Gold Masters League': {
    Aurum: 'Gold Aurum', Bullion: 'Gold Bullion', Reserve: 'Gold Reserve', Ingot: 'Gold Ingot',
  },
  'Silver Stars League': {
    Sterling: 'Silver Sterling', Comet: 'Silver Comet', Orbit: 'Silver Orbit', Horizon: 'Silver Horizon',
  },
  'Bronze Victory League': {
    Triumph: 'Triumph Division', Valor: 'Bronze Valor', Conquest: 'Bronze Conquest',
    Legion: 'Bronze Legion', Garrison: 'Bronze Garrison',
  },
  'Copper Legends League': {
    Mythic: 'Mythic Division', Odyssey: 'Copper Odyssey', Saga: 'Copper Saga',
    Relic: 'Copper Relic', Roots: 'Copper Roots',
  },
};

export function getClubDivisionStorageNames(leagueName, divisionName) {
  const legacyNames = legacyClubDivisionNames[leagueName] || {};
  const currentName = Object.entries(legacyNames).find(([, legacyName]) => legacyName === divisionName)?.[0];
  return [...new Set([divisionName, legacyNames[divisionName], currentName].filter(Boolean))];
}

export function getClubDivisionDisplayName(leagueName, divisionName) {
  const legacyNames = legacyClubDivisionNames[leagueName] || {};
  return Object.entries(legacyNames).find(([, legacyName]) => legacyName === divisionName)?.[0] || divisionName;
}

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
