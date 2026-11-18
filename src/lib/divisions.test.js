import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CLUB_LEAGUE_DIVISIONS,
  DIVISIONS,
  LEAGUES,
} from './divisions.js';

test('defines the requested 10 competitive leagues and 51 divisions', () => {
  assert.equal(LEAGUES.length, 11);
  assert.equal(DIVISIONS.length, 51);
  assert.equal(new Set(DIVISIONS.map(division => division.name)).size, 51);
  assert.ok(LEAGUES.slice(0, 10).every(league => league.divisions.length === 5));
  assert.deepEqual(LEAGUES[10].divisions, [{ name: 'Trial Division', tier: 1, slots: null }]);
});

test('keeps the existing Tier 1 division names and exposes all competitive divisions to club admin', () => {
  assert.equal(LEAGUES[0].divisions[0].name, 'Premier');
  assert.equal(LEAGUES[2].divisions[0].name, 'Elite');
  assert.equal(LEAGUES[3].divisions[0].name, 'Championship');
  assert.equal(Object.keys(CLUB_LEAGUE_DIVISIONS).length, 10);
  assert.deepEqual(CLUB_LEAGUE_DIVISIONS['Apex Football League'], [
    'Premier', 'Apex Vanguard', 'Apex Arena', 'Apex Circuit', 'Apex Outpost',
  ]);
});
