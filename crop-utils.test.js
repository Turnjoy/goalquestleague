import test from 'node:test';
import assert from 'node:assert/strict';
import { compareCardHashes, detectInventoryRegions, detectPitchRegionsFromPixels, detectPitchRegionsFromWords, hammingDistance, validateCrop } from './crop-utils.js';

test('clamps an edge crop while retaining its in-bounds card area', () => {
  const result = validateCrop({ left: 90, top: 70, width: 20, height: 40 }, 100, 100);
  assert.equal(result.ok, true);
  assert.equal(result.clamped, true);
  assert.deepEqual(result.region, { left: 90, top: 70, width: 10, height: 30 });
});

test('rejects non-integer and non-finite coordinates', () => {
  for (const region of [
    { left: 0.5, top: 0, width: 10, height: 10 },
    { left: NaN, top: 0, width: 10, height: 10 },
    { left: 0, top: 0, width: Infinity, height: 10 },
    { left: -1, top: 0, width: 10, height: 10 },
  ]) assert.equal(validateCrop(region, 100, 100).ok, false);
});

test('rejects zero-size crops and crops that begin beyond the image', () => {
  assert.match(validateCrop({ left: 0, top: 0, width: 0, height: 5 }, 100, 100).reason, /positive/);
  assert.equal(validateCrop({ left: 100, top: 0, width: 10, height: 10 }, 100, 100).ok, false);
});

test('produces valid crop grids for unexpected screenshot dimensions', () => {
  for (const [width, height] of [[1080, 482], [1307, 768], [320, 240], [2048, 1536]]) {
    const regions = detectInventoryRegions(width, height);
    assert.ok(regions.length > 0);
    for (const region of regions) assert.equal(validateCrop(region, width, height).ok, true);
  }
  assert.deepEqual(detectInventoryRegions(0, 480), []);
});

test('inventory list crops the portrait and retains the wider OCR tile', () => {
  const regions = detectInventoryRegions(1080, 482);
  assert.equal(regions.length, 8);
  assert.ok(regions.every(region => region.tile && region.width < region.tile.width / 3));
  assert.ok(regions[0].left > 130 && regions[0].left < 180);
  assert.ok(regions[1].tile.left > 520 && regions[1].tile.left < 560);
  assert.ok(regions[0].top > 80, 'header is excluded from the first list row');
  for (const region of regions) assert.equal(validateCrop(region, 1080, 482).ok, true);
});

test('pitch candidates come from OCR anchors and classify bench by actual screen area', () => {
  const words = [
    { text: 'CF', confidence: 90, bbox: { x0: 515, y0: 20, x1: 535, y1: 38 } },
    { text: '104', confidence: 90, bbox: { x0: 515, y0: 39, x1: 540, y1: 57 } },
    { text: 'CB', confidence: 90, bbox: { x0: 840, y0: 30, x1: 860, y1: 48 } },
    { text: 'Capacity', confidence: 90, bbox: { x0: 900, y0: 10, x1: 970, y1: 25 } },
  ];
  const regions = detectPitchRegionsFromWords(words, 1080, 482);
  assert.equal(regions.length, 2);
  assert.ok(regions.some(region => region.area === 'formation'));
  assert.ok(regions.some(region => region.area === 'bench'));
  for (const region of regions) assert.equal(validateCrop(region, 1080, 482).ok, true);
});

test('local color-frame detection finds a visible card when OCR cannot read its label', () => {
  const width = 200, height = 150;
  const pixels = new Uint8Array(width * height * 3);
  for (let y = 35; y < 82; y++) for (let x = 80; x < 122; x++) {
    if (x < 84 || x >= 118 || y < 39 || y >= 78) {
      const offset = (y * width + x) * 3;
      pixels[offset] = 20; pixels[offset + 1] = 220; pixels[offset + 2] = 240;
    }
  }
  const regions = detectPitchRegionsFromPixels(pixels, width, height);
  assert.equal(regions.length, 1);
  assert.equal(regions[0].detection, 'color_frame');
  assert.equal(regions[0].area, 'formation');
});

test('hash distance counts changed bits and rejects malformed hashes', () => {
  assert.equal(hammingDistance('00ff', '0f0f'), 8);
  assert.equal(hammingDistance('00', '0'), Infinity);
  assert.equal(hammingDistance('zz', '00'), Infinity);
});

test('card matcher reports uncertain and accepted matches without reusing a card', () => {
  const pitch = [{ hash: '0'.repeat(64) }, { hash: 'f'.repeat(64) }];
  const inventory = [{ id: 'same', hash: '0'.repeat(64), playerName: 'Known' }];
  const results = compareCardHashes(pitch, inventory, 0);
  assert.equal(results[0].accepted, true);
  assert.equal(results[1].accepted, false);
});
