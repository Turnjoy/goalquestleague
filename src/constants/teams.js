/**
 * Centralized team configuration for GoalQuest League
 * Maps valid teams by division for validation and assignment
 */

export const TEAMS_BY_DIVISION = {
  'Elite': [
    'Sovereign Hill Athletic FC',
    'Diamond Coast FC',
    'Crystalwood Rovers FC',
    'Kingsley Wanderers FC',
    'Crownpoint Town FC',
    'Fairfield Albion FC',
    'Belmont Wanderers FC',
    'Gilded Valley Town FC',
    'Kensington Athletic FC',
    'Mayfair Borough FC',
    'Royal Oak City FC',
    'Highbury Athletic FC',
    'Sterling City FC',
    'Belgrave City FC',
    'Richmond United FC',
    'Victoria Park FC',
    'Golden Gate Albion FC',
    'Silverton Town FC',
    'Grandview Borough FC',
    'Monarch Hill Rangers FC',
  ],
  'Premier': [
    'Blackwood Athletic FC',
    'Oldcastle City FC',
    'Kingsport Borough FC',
    'Riverside Borough FC',
    'Ironclad City FC',
    'Southwood Athletic FC',
    'Oakridge Rangers FC',
    'Crestview Town FC',
    'Silverstream Rovers FC',
    'Millwall Heights FC',
    'Redford Wanderers FC',
    'Ashford United FC',
    'Highland Albion FC',
    'Greensborough Albion FC',
    'Northgate Town FC',
    'Stonefield Rovers FC',
    'Portside Victoria FC',
    'Westvale Rangers FC',
    'St. Jude\'s Athletic FC',
    'Eastbridge City FC',
  ],
  'Championship': [
    // Add Championship teams as needed
  ],
  'Challenger': [
    // Add Challenger teams as needed
  ],
  'Contender': [
    // Add Contender teams as needed
  ],
  'Trial': [
    // For unassigned players
  ],
};

/**
 * Get all valid team names for a specific division
 * @param {string} division - The division name
 * @returns {string[]} Array of valid team names
 */
export function getTeamsForDivision(division) {
  return TEAMS_BY_DIVISION[division] || [];
}

/**
 * Validate if a team name exists in a specific division
 * @param {string} teamName - The team name to validate
 * @param {string} division - The division to check against
 * @returns {boolean} True if valid, false otherwise
 */
export function isValidTeamForDivision(teamName, division) {
  const teams = getTeamsForDivision(division);
  return teams.includes(teamName);
}

/**
 * Get all divisions that have a specific team
 * @param {string} teamName - The team name to search for
 * @returns {string[]} Array of division names containing this team
 */
export function getDivisionsForTeam(teamName) {
  const divisions = [];
  for (const [division, teams] of Object.entries(TEAMS_BY_DIVISION)) {
    if (teams.includes(teamName)) {
      divisions.push(division);
    }
  }
  return divisions;
}

/**
 * Check if a team name exists in any division
 * @param {string} teamName - The team name to check
 * @returns {boolean} True if team exists in any division
 */
export function isValidTeam(teamName) {
  return getDivisionsForTeam(teamName).length > 0;
}
