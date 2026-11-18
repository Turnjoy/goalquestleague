import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CLUB_LEAGUE_DIVISIONS,
  DIVISIONS,
  getClubDivisionDisplayName,
  getClubDivisionStorageNames,
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

test('uses the tier names from the supplied 960-club list', () => {
  assert.deepEqual(CLUB_LEAGUE_DIVISIONS['Crown Super League'], [
    'Royal', 'Sovereign', 'Throne', 'Regency', 'Manor',
  ]);
  assert.deepEqual(CLUB_LEAGUE_DIVISIONS['Diamond Elite League'], [
    'Elite', 'Prism', 'Facet', 'Vault', 'Core',
  ]);
  assert.deepEqual(CLUB_LEAGUE_DIVISIONS['Platinum Champions League'], [
    'Championship', 'Masters', 'Citadel', 'Forge', 'Crucible',
  ]);
  assert.deepEqual(CLUB_LEAGUE_DIVISIONS['Gold Masters League'], [
    'Grandmaster', 'Aurum', 'Bullion', 'Reserve', 'Ingot',
  ]);
  assert.deepEqual(CLUB_LEAGUE_DIVISIONS['Silver Stars League'], [
    'Supernova', 'Sterling', 'Comet', 'Orbit', 'Horizon',
  ]);
  assert.deepEqual(CLUB_LEAGUE_DIVISIONS['Bronze Victory League'], [
    'Triumph', 'Valor', 'Conquest', 'Legion', 'Garrison',
  ]);
  assert.deepEqual(CLUB_LEAGUE_DIVISIONS['Copper Legends League'], [
    'Mythic', 'Odyssey', 'Saga', 'Relic', 'Roots',
  ]);
});

test('reads existing club rows through old tier labels while displaying requested labels', () => {
  assert.deepEqual(getClubDivisionStorageNames('Crown Super League', 'Sovereign'), [
    'Sovereign', 'Crown Sovereign',
  ]);
  assert.deepEqual(getClubDivisionStorageNames('Crown Super League', 'Crown Sovereign'), [
    'Crown Sovereign', 'Sovereign',
  ]);
  assert.equal(getClubDivisionDisplayName('Crown Super League', 'Crown Sovereign'), 'Sovereign');
  assert.equal(getClubDivisionDisplayName('Apex Football League', 'Premier'), 'Premier');
});
