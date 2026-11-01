import test from 'node:test';
import assert from 'node:assert/strict';
import { askGeminiToCompare, askGeminiToExtractSquad, askGeminiToExtractSquadFromNames, isNonRetryableGeminiError, parseGeminiCandidateResponse, parseGeminiSquadResponse } from './gemini-fallback.js';

const candidates = [{ id: 'candidate-1', playerName: 'Rúben Neves' }];

test('Gemini identity responses must select a supplied ID with confidence', () => {
  assert.equal(parseGeminiCandidateResponse('{"candidate_id":"candidate-1","confidence":0.9}', candidates).accepted, true);
  assert.equal(parseGeminiCandidateResponse('{"candidate_id":"invented","confidence":0.99}', candidates).reason, 'unknown_candidate');
  assert.equal(parseGeminiCandidateResponse('{"candidate_id":"candidate-1","confidence":0.2}', candidates).reason, 'low_confidence');
  assert.equal(parseGeminiCandidateResponse('not json', candidates).reason, 'invalid_json');
  assert.equal(parseGeminiCandidateResponse('{"candidate_id":"uncertain","confidence":0.4}', candidates).reason, 'uncertain');
});

test('Gemini receives only the relevant pitch and candidate crops and accepts a mock response', async () => {
  let request;
  const ai = { models: { generateContent: async input => {
    request = input;
    return { text: '{"candidate_id":"candidate-1","confidence":0.91,"reason":"portrait matches","tactical_rating":104,"rating_confidence":0.9,"tactical_position":"CF","position_confidence":0.95}' };
  } } };
  const result = await askGeminiToCompare(ai, 'mock-model', Buffer.from('pitch-image'), [
    { ...candidates[0], imageBuffer: Buffer.from('candidate-image') },
  ]);
  assert.equal(result.accepted, true);
  assert.equal(result.tacticalRating, 104);
  assert.equal(result.tacticalPosition, 'CF');
  assert.equal(request.model, 'mock-model');
  assert.equal(request.contents[0].parts.filter(part => part.inlineData).length, 2);
  assert.match(request.contents[0].parts[0].text, /Rúben Neves/);
});

test('authentication and quota failures are not retried', () => {
  assert.equal(isNonRetryableGeminiError({ status: 429 }), true);
  assert.equal(isNonRetryableGeminiError({ message: 'API key invalid' }), true);
  assert.equal(isNonRetryableGeminiError(new Error('socket hang up')), false);
});

test('Gemini squad response validates and returns names and ratings from the pitch', () => {
  const parsed = parseGeminiSquadResponse(JSON.stringify({ players: [
    { name: 'Lionel Messi', name_confidence: 0.95, rating: 104, rating_confidence: 0.98, position: 'CF', position_confidence: 0.91, area: 'starter', match_confidence: 0.93, inventory_screenshot: 2 },
    { name: 'Invented Name', name_confidence: 0.3, rating: 999, rating_confidence: 0.99, position: 'XYZ', position_confidence: 0.99, area: 'bench', match_confidence: 0.99 },
  ] }));
  assert.equal(parsed.accepted, true);
  assert.equal(parsed.players.length, 1);
  assert.equal(parsed.players[0].name, 'Lionel Messi');
  assert.equal(parsed.players[0].rating, 104);
  assert.equal(parsed.players[0].inventoryScreenshot, 2);
  assert.equal(parseGeminiSquadResponse('{"players":[]}').accepted, false);
  assert.equal(parseGeminiSquadResponse('not json').reason, 'invalid_json');
});

test('Gemini can return only the exact name attached to its selected inventory candidate', () => {
  const roster = [{ id: 'inv-1-1', name: 'Cantona', screenshot: 1 }];
  const exact = parseGeminiSquadResponse(JSON.stringify({ players: [
    { candidate_id: 'inv-1-1', name: 'Cantona', name_confidence: 0.94, rating: 97, rating_confidence: 0.9, position: 'CF', position_confidence: 0.9, area: 'starter', match_confidence: 0.9 },
  ] }), roster);
  assert.equal(exact.players[0].name, 'Cantona');
  assert.equal(exact.players[0].inventoryCardId, 'inv-1-1');
  assert.equal(exact.players[0].matchStatus, 'matched');

  const invented = parseGeminiSquadResponse(JSON.stringify({ players: [
    { candidate_id: 'not-in-roster', name: 'Fernando Torres', name_confidence: 0.99, rating: 97, rating_confidence: 0.9, position: 'CF', position_confidence: 0.9, area: 'starter', match_confidence: 0.99 },
  ] }), roster);
  assert.equal(invented.players[0].name, null);
  assert.equal(invented.players[0].matchStatus, 'manual_review');

  const mismatchedName = parseGeminiSquadResponse(JSON.stringify({ players: [
    { candidate_id: 'inv-1-1', name: 'Fernando Torres', name_confidence: 0.99, rating: 97, rating_confidence: 0.9, position: 'CF', position_confidence: 0.9, area: 'starter', match_confidence: 0.99 },
  ] }), roster);
  assert.equal(mismatchedName.players[0].name, 'Cantona');
  assert.equal(mismatchedName.players[0].matchStatus, 'manual_review');

  const repairedOcr = parseGeminiSquadResponse(JSON.stringify({ players: [
    { candidate_id: 'inv-2-1', name: 'Kylian Mbappé', name_confidence: 0.93, rating: 97, rating_confidence: 0.9, position: 'CF', position_confidence: 0.9, area: 'substitute', match_confidence: 0.91 },
  ] }), [{ id: 'inv-2-1', name: 'Mbpe', screenshot: 2 }]);
  assert.equal(repairedOcr.players[0].name, 'Kylian Mbappé');
  assert.equal(repairedOcr.players[0].matchStatus, 'matched');
});

test('Gemini corrects close OCR typos when matching a pitch player to the OCR roster', async () => {
  let request;
  const ai = { models: { generateContent: async input => {
    request = input;
    return { text: JSON.stringify({ players: [
      { candidate_id: 'inv-1-1', name: 'Kylian Mbappé', name_confidence: 0.95, rating: 98, rating_confidence: 0.9, position: 'CF', position_confidence: 0.9, area: 'starter', match_confidence: 0.93 },
    ] }) };
  } } };
  const result = await askGeminiToExtractSquadFromNames(ai, 'mock-model', Buffer.from('pitch-image'), [
    { id: 'inv-1-1', name: 'Mbpe', confidence: 41 },
  ]);
  assert.equal(result.accepted, true);
  assert.equal(result.players[0].name, 'Kylian Mbappé');
  assert.equal(request.model, 'mock-model');
  assert.equal(request.contents[0].parts.filter(part => part.inlineData).length, 1);
  assert.match(request.contents[0].parts[0].text, /Return the correctly spelled name for that selected candidate/);
  assert.doesNotMatch(request.contents[0].parts[0].text, /exact OCR roster candidate name/);
});

test('Gemini full-squad request includes the pitch and every inventory screenshot', async () => {
  let request;
  let generateContentCalls = 0;
  const players = Array.from({ length: 23 }, (_, index) => ({
    name: `Player ${String.fromCharCode(65 + index)}`,
    name_confidence: 0.95,
    rating: 90 + index,
    rating_confidence: 0.9,
    position: ['GK', 'CB', 'LB', 'RB', 'DMF', 'CMF', 'AMF', 'LMF', 'RMF', 'LWF', 'RWF', 'SS', 'CF'][index % 13],
    position_confidence: 0.9,
    area: index < 11 ? 'starter' : 'substitute',
    match_confidence: 0.9,
    inventory_screenshot: index % 2 + 1,
  }));
  const ai = { models: { generateContent: async input => {
    generateContentCalls++;
    request = input;
    return { text: JSON.stringify({ players }) };
  } } };
  const result = await askGeminiToExtractSquad(ai, 'mock-model', Buffer.from('pitch'), [Buffer.from('inventory-1'), Buffer.from('inventory-2')]);
  assert.equal(result.accepted, true);
  assert.equal(result.players.length, 23);
  assert.equal(result.players[0].name, 'Player A');
  assert.equal(result.players[0].rating, 90);
  assert.equal(request.model, 'mock-model');
  assert.equal(generateContentCalls, 1);
  const parts = request.contents[0].parts;
  assert.equal(parts.filter(part => part.inlineData).length, 3);
  assert.match(parts[0].text, /1 Squad Pitch Screenshot .* multiple Inventory Screenshots/);
  assert.match(parts[0].text, /Player Avatar\/Face/);
  assert.match(parts[0].text, /Card Background Color\/Theme/);
  assert.match(parts[0].text, /Output the full 23-player squad roster/);
  assert.match(parts.find(part => part.text === 'Inventory screenshot 2').text, /Inventory screenshot 2/);
});

test('Gemini incomplete 23-player response is rejected so the endpoint can use local fallback', async () => {
  const ai = { models: { generateContent: async () => ({
    text: JSON.stringify({ players: [{
      name: 'Rúben Neves',
      name_confidence: 0.9,
      rating: 103,
      rating_confidence: 0.9,
      position: 'DMF',
      position_confidence: 0.9,
      area: 'starter',
      match_confidence: 0.9,
    }] }),
  }) } };
  const result = await askGeminiToExtractSquad(ai, 'mock-model', Buffer.from('pitch'), [Buffer.from('inventory')]);
  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'incomplete_roster');
});
