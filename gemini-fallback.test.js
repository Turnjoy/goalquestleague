import test from 'node:test';
import assert from 'node:assert/strict';
import { askGeminiToCompare, askGeminiToExtractSquad, isNonRetryableGeminiError, parseGeminiCandidateResponse, parseGeminiSquadResponse } from './gemini-fallback.js';

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

test('Gemini can correct an OCR spelling only when it selects a supplied candidate', () => {
  const roster = [{ id: 'inv-1-1', name: 'Achat Hakimi', screenshot: 1 }];
  const corrected = parseGeminiSquadResponse(JSON.stringify({ players: [
    { candidate_id: 'inv-1-1', name: 'Achraf Hakimi', name_confidence: 0.94, rating: 103, rating_confidence: 0.9, position: 'RB', position_confidence: 0.9, area: 'starter', match_confidence: 0.9 },
  ] }), roster);
  assert.equal(corrected.players[0].name, 'Achraf Hakimi');
  assert.equal(corrected.players[0].inventoryCardId, 'inv-1-1');
  assert.equal(corrected.players[0].matchStatus, 'matched');

  const invented = parseGeminiSquadResponse(JSON.stringify({ players: [
    { candidate_id: 'not-in-roster', name: 'Achraf Hakimi', name_confidence: 0.99, rating: 103, rating_confidence: 0.9, position: 'RB', position_confidence: 0.9, area: 'starter', match_confidence: 0.99 },
  ] }), roster);
  assert.equal(invented.players[0].name, null);
  assert.equal(invented.players[0].matchStatus, 'manual_review');
});

test('Gemini full-squad request includes the pitch and every inventory screenshot', async () => {
  let request;
  const ai = { models: { generateContent: async input => {
    request = input;
    return { text: '{"players":[{"name":"Rúben Neves","name_confidence":0.9,"rating":103,"rating_confidence":0.9,"position":"DMF","position_confidence":0.9,"area":"starter","match_confidence":0.9,"inventory_screenshot":1}]}' };
  } } };
  const result = await askGeminiToExtractSquad(ai, 'mock-model', Buffer.from('pitch'), [Buffer.from('inventory-1'), Buffer.from('inventory-2')]);
  assert.equal(result.accepted, true);
  assert.equal(result.players[0].name, 'Rúben Neves');
  assert.equal(result.players[0].rating, 103);
  assert.equal(request.model, 'mock-model');
  const parts = request.contents[0].parts;
  assert.equal(parts.filter(part => part.inlineData).length, 3);
  assert.match(parts[0].text, /Read each overall rating from the pitch screenshot/);
  assert.match(parts.find(part => part.text === 'Inventory screenshot 2').text, /Inventory screenshot 2/);
});
