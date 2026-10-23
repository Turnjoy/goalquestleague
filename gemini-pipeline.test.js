import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { runSquadPipeline, classifyGeminiError, normalizeScreenshotPayload, parseJson } from './gemini-pipeline.js';

function client(onCall) {
  const calls = [];
  return { calls, ai: { models: { async generateContent(request) {
    calls.push(request);
    return { text: JSON.stringify(await onCall(request, calls.length)) };
  } } } };
}
const images = count => Array.from({ length: count }, (_, i) => Buffer.from(`image-${i}`));
const pitch = Buffer.from('pitch');

test('JSON parser accepts fenced output and rejects malformed data', () => {
  assert.deepEqual(parseJson('```json\n{"cards":[]}\n```'), { cards: [] });
  assert.equal(parseJson('{bad'), null);
});

test('combined image payload keeps the last image as the tactical screenshot and supports 30 inventory images', () => {
  const images = Array.from({ length: 31 }, (_, index) => `image-${index}`);
  const result = normalizeScreenshotPayload({ images });
  assert.equal(result.inventoryImages.length, 30);
  assert.equal(result.inventoryImages[0], 'image-0');
  assert.equal(result.pitchImage, 'image-30');
  assert.throws(() => normalizeScreenshotPayload({ images: ['only-one'] }), { code: 'INVALID_IMAGE_COUNT' });
  assert.deepEqual(normalizeScreenshotPayload({ inventoryImages: ['inventory'], pitchImage: 'pitch' }), {
    inventoryImages: ['inventory'], pitchImage: 'pitch',
  });
});

test('14 inventory screenshots use two batches and matching is a separate request', async () => {
  const { ai, calls } = client(request => request.contents[0].parts[0].text.includes('Identify every visible player card')
    ? { cards: [{ name: 'Player', screenshot: 1, location: 'top-left', confidence: 0.9, bounding_box: [0, 0, 1, 1] }] }
    : { players: [{ candidate_id: 'c1', status: 'confirmed', confidence: 0.9, rating: 101, position: 'CF', area: 'starter' }] });
  const validImage = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#4488aa' } }).jpeg().toBuffer();
  const result = await runSquadPipeline({ ai, primaryModel: 'primary', fallbackModel: '', inventoryBuffers: Array.from({ length: 14 }, () => validImage), pitchBuffer: pitch });
  assert.equal(calls.length, 3);
  assert.deepEqual(calls.slice(0, 2).map(c => c.contents[0].parts.filter(p => p.text?.startsWith('Inventory screenshot ')).length), [7, 7]);
  assert.equal(result.players[0].name, 'Player');
  assert.equal(result.players[0].rating, 101);
});

test('30 screenshots use two initial batches, with 15 images maximum per batch', async () => {
  const { ai, calls } = client(request => request.contents[0].parts[0].text.includes('Identify every visible player card')
    ? { cards: [{ name: 'Player', screenshot: 1, location: 'top-left', confidence: 0.9 }] } : { players: [{ status: 'unmatched', area: 'starter', position: 'GK' }] });
  await runSquadPipeline({ ai, primaryModel: 'primary', inventoryBuffers: images(30), pitchBuffer: pitch });
  assert.deepEqual(calls.slice(0, 2).map(c => c.contents[0].parts.filter(p => p.text?.startsWith('Inventory screenshot ')).length), [15, 15]);
});

test('a failed inventory batch is split without rerunning successful work', async () => {
  let failedLarge = false;
  let failedSmallCalls = 0;
  const { ai, calls } = client((request) => {
    const prompt = request.contents[0].parts[0].text;
    const labels = request.contents[0].parts.filter(p => p.text?.startsWith('Inventory screenshot ')).map(p => Number(p.text.match(/(\d+)$/)?.[1]));
    if (prompt.includes('Identify every visible player card')) {
      if (labels.length === 15 && labels.includes(1) && !failedLarge) { failedLarge = true; throw Object.assign(new Error('payload too large'), { status: 413 }); }
      if (labels.length <= 8 && labels.includes(1) && failedSmallCalls++ < 2) throw Object.assign(new Error('temporarily unavailable'), { status: 503 });
      return { cards: [{ name: 'Name', screenshot: labels[0], location: `card-${calls.length}`, confidence: 0.9 }] };
    }
    return { players: [{ status: 'ambiguous', area: 'unknown' }] };
  });
  await runSquadPipeline({ ai, primaryModel: 'primary', fallbackModel: 'backup', inventoryBuffers: images(30), pitchBuffer: pitch });
  const extraction = calls.filter(c => c.contents[0].parts[0].text.includes('Identify every visible player card'));
  assert.equal(extraction.filter(c => c.contents[0].parts.some(p => p.text === 'Inventory screenshot 16')).length, 1); // successful second batch is retained
  assert.equal(extraction.some(c => c.contents[0].parts.filter(p => p.text?.startsWith('Inventory screenshot ')).length === 8), true);
});

test('tactical matching switches to the configured fallback after temporary failure', async () => {
  let primaryAttempts = 0;
  const { ai, calls } = client(request => {
    if (request.contents[0].parts[0].text.includes('Identify every visible player card')) return { cards: [{ name: 'Player', screenshot: 1, location: 'card-1', confidence: 0.9 }] };
    if (request.model === 'primary' && primaryAttempts++ < 2) throw Object.assign(new Error('temporarily unavailable'), { status: 503 });
    return { players: [{ candidate_id: 'c1', status: 'confirmed', confidence: 0.9, area: 'starter', rating: 99, position: 'CF' }] };
  });
  const result = await runSquadPipeline({ ai, primaryModel: 'primary', fallbackModel: 'backup', inventoryBuffers: images(2), pitchBuffer: pitch });
  assert.equal(result.modelUsed, 'backup');
  assert.equal(calls.some(call => call.model === 'backup'), true);
});

test('failure classification separates credentials, quota and temporary errors', () => {
  assert.equal(classifyGeminiError({ status: 401 }), 'authentication');
  assert.equal(classifyGeminiError({ status: 429, message: 'quota exhausted' }), 'quota');
  assert.equal(classifyGeminiError({ status: 503 }), 'transient');
  assert.equal(classifyGeminiError({ status: 413 }), 'payload_too_large');
  assert.equal(classifyGeminiError({ status: 408 }), 'transient');
  assert.equal(classifyGeminiError({ status: 429, message: 'rate limit' }), 'rate_limit');
});
