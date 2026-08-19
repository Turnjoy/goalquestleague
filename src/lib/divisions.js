export const DIVISIONS = [
  { name: 'Elite', slots: 20 },
  { name: 'Premier', slots: 100 },
  { name: 'Championship', slots: 100 },
  { name: 'Challenger', slots: 100 },
  { name: 'Contender', slots: 100 },
  { name: 'Advanced', slots: 100 },
  { name: 'Intermediate', slots: 100 },
  { name: 'Foundation', slots: 100 },
  { name: 'Development', slots: 100 },
  { name: 'Rookie', slots: 80 },
  { name: 'Trial', slots: null },
];

export const DIVISION_NAMES = DIVISIONS.map((division) => division.name);
