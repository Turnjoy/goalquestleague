/** Safely constrain an intended crop to image bounds, or explain why it cannot be used. */
export function validateCrop(region, imageWidth, imageHeight, { clamp = true } = {}) {
  const values = [region?.left, region?.top, region?.width, region?.height, imageWidth, imageHeight];
  if (!values.every(Number.isFinite) || !Number.isInteger(imageWidth) || !Number.isInteger(imageHeight) || imageWidth <= 0 || imageHeight <= 0) {
    return { ok: false, reason: 'Crop or image dimensions contain invalid, non-finite, or non-integer values' };
  }
  if (![region.left, region.top, region.width, region.height].every(Number.isInteger)) {
    return { ok: false, reason: 'Crop coordinates and dimensions must be integers' };
  }
  if (region.width <= 0 || region.height <= 0) return { ok: false, reason: 'Crop width and height must be positive' };
  if (region.left < 0 || region.top < 0) return { ok: false, reason: 'Crop starts outside the image bounds' };
  const right = region.left + region.width;
  const bottom = region.top + region.height;
  if (right <= imageWidth && bottom <= imageHeight) return { ok: true, region };
  if (!clamp || region.left >= imageWidth || region.top >= imageHeight) return { ok: false, reason: 'Crop extends beyond image bounds and cannot be safely clamped' };
  const bounded = { left: region.left, top: region.top, width: Math.min(right, imageWidth) - region.left, height: Math.min(bottom, imageHeight) - region.top };
  if (bounded.width <= 0 || bounded.height <= 0) return { ok: false, reason: 'Crop has no area inside image bounds' };
  return { ok: true, region: bounded, clamped: true };
}

/** Build a responsive inventory grid within the actual screenshot dimensions. */
export function detectInventoryRegions(width, height, maxColumns = 2) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) return [];
  // eFootball's player list uses wide, two-column rows. Returning tile bounds
  // separately lets OCR use the whole row while vision matching uses its portrait.
  const sideInset = width / height > 1.8 ? Math.floor(width * 0.14) : Math.floor(width * 0.06);
  const usableWidth = width - sideInset * 2;
  const cols = Math.max(1, Math.min(maxColumns, Math.floor(usableWidth / Math.max(1, Math.floor(height * 0.75)))));
  const contentTop = Math.floor(height * 0.20);
  const rowHeight = Math.max(1, Math.floor(height * 0.205));
  const rows = Math.max(1, Math.ceil((height - contentTop) / rowHeight));
  const cellWidth = usableWidth / cols;
  const cellHeight = height / rows;
  const regions = [];
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    const left = sideInset + Math.floor(col * cellWidth);
    const top = contentTop + Math.floor(row * rowHeight);
    const right = sideInset + Math.floor((col + 1) * cellWidth);
    const bottom = Math.min(height, contentTop + Math.floor((row + 1) * rowHeight));
    const tileWidth = right - left;
    const tileHeight = bottom - top;
    const portraitSize = Math.floor(Math.min(tileWidth * 0.28, tileHeight * 0.92));
    regions.push({
      left: Math.floor(left + tileWidth * 0.015),
      top: Math.floor(top + (tileHeight - portraitSize) / 2),
      width: portraitSize,
      height: portraitSize,
      tile: { left, top, width: tileWidth, height: tileHeight },
    });
  }
  return regions;
}

/** Return card-sized pitch layout candidates wholly inside the screenshot. */
export function detectPitchRegions(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 240 || height < 180) return [];
  return [];
}

const PLAYER_POSITIONS = new Set(['GK', 'CB', 'LB', 'RB', 'DMF', 'CMF', 'AMF', 'LMF', 'RMF', 'LWF', 'RWF', 'SS', 'CF']);

/** Build card crops around OCR position/rating anchors instead of guessed pitch grids. */
export function detectPitchRegionsFromWords(words, width, height) {
  if (!Array.isArray(words) || !width || !height) return [];
  const cardWidth = Math.max(48, Math.round(width * 0.073));
  const cardHeight = Math.max(48, Math.round(height * 0.17));
  const anchors = words.filter(word => word?.bbox && Number(word.confidence ?? 0) >= 20 && (
    PLAYER_POSITIONS.has(String(word.text).toUpperCase()) || /^(?:[7-9]\d|1[0-4]\d|150)$/.test(String(word.text).replace(/[^\d]/g, ''))
  ));
  const regions = [];
  for (const word of anchors) {
    const cx = (word.bbox.x0 + word.bbox.x1) / 2;
    const cy = (word.bbox.y0 + word.bbox.y1) / 2;
    const isPosition = PLAYER_POSITIONS.has(String(word.text).toUpperCase());
    const proposal = {
      left: Math.round(word.bbox.x0 - 3),
      top: Math.round(word.bbox.y0 - (isPosition ? 3 : cardHeight * 0.30)),
      width: cardWidth,
      height: cardHeight,
      area: cx / width > 0.75 ? 'bench' : 'formation',
    };
    const existing = regions.find(region => overlaps(region, proposal) > 0.45);
    if (existing) {
      existing.anchors.push(word);
      continue;
    }
    regions.push({ ...proposal, anchors: [word] });
  }
  return regions.sort((a, b) => a.top - b.top || a.left - b.left);
}

/** Locate colorful card frames as a local vision fallback when OCR misses tiny labels. */
export function detectPitchRegionsFromPixels(data, width, height, channels = 3) {
  if (!data || !Number.isInteger(width) || !Number.isInteger(height) || channels < 3 || data.length < width * height * channels) return [];
  const size = width * height;
  const mask = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    const offset = i * channels;
    const red = data[offset], green = data[offset + 1], blue = data[offset + 2];
    const max = Math.max(red, green, blue), min = Math.min(red, green, blue);
    if (max > 125 && max - min > 50 && !(blue > red * 1.5 && blue > green * 1.2)) mask[i] = 1;
  }
  const dilated = new Uint8Array(size);
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const index = y * width + x;
    if (mask[index] || mask[index - 1] || mask[index + 1] || mask[index - width] || mask[index + width]
      || mask[index - width - 1] || mask[index - width + 1] || mask[index + width - 1] || mask[index + width + 1]) dilated[index] = 1;
  }
  const seen = new Uint8Array(size);
  const queue = new Int32Array(size);
  const cardWidth = Math.max(40, Math.round(width * 0.068));
  const cardHeight = Math.max(40, Math.round(height * 0.16));
  const candidates = [];
  for (let seed = 0; seed < size; seed++) {
    const sx = seed % width;
    if (!dilated[seed] || seen[seed] || sx < width * 0.20 || sx > width * 0.98) continue;
    let head = 0, tail = 0, minX = width, maxX = 0, minY = height, maxY = 0;
    queue[tail++] = seed;
    seen[seed] = 1;
    while (head < tail) {
      const index = queue[head++], x = index % width, y = Math.floor(index / width);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      const neighbors = [index - 1, index + 1, index - width, index + width];
      for (const next of neighbors) if (next >= 0 && next < size && !seen[next] && dilated[next]) {
        const nx = next % width;
        if (Math.abs(nx - x) > 1) continue;
        seen[next] = 1;
        if (tail < queue.length) queue[tail++] = next;
      }
    }
    const boxWidth = maxX - minX + 1, boxHeight = maxY - minY + 1;
    if (tail < 180 || boxWidth < cardWidth * 0.58 || boxWidth > cardWidth * 1.7 || boxHeight < cardHeight * 0.52 || boxHeight > cardHeight * 1.6) continue;
    const centerX = (minX + maxX) / 2, centerY = (minY + maxY) / 2;
    const proposal = {
      left: Math.round(centerX - cardWidth / 2), top: Math.round(centerY - cardHeight / 2),
      width: cardWidth, height: cardHeight, area: centerX / width > 0.75 ? 'bench' : 'formation',
      anchors: [], detection: 'color_frame',
    };
    const duplicate = candidates.find(item => overlaps(item, proposal) > 0.45);
    if (!duplicate) candidates.push(proposal);
  }
  return candidates.sort((a, b) => a.top - b.top || a.left - b.left);
}

function centeredRegion(cx, cy, width, height) {
  const left = Math.round(cx - width / 2);
  const top = Math.round(cy - height / 2);
  if (left < 0 || top < 0) return null;
  return { left, top, width: Math.floor(width), height: Math.floor(height) };
}

function overlaps(a, b) {
  const width = Math.max(0, Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left));
  const height = Math.max(0, Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top));
  const intersection = width * height;
  return intersection / Math.max(1, Math.min(a.width * a.height, b.width * b.height));
}

export function hammingDistance(hash1, hash2) {
  if (typeof hash1 !== 'string' || typeof hash2 !== 'string' || hash1.length !== hash2.length || !/^[0-9a-f]+$/i.test(hash1) || !/^[0-9a-f]+$/i.test(hash2)) return Infinity;
  let distance = 0;
  for (let i = 0; i < hash1.length; i++) {
    let bits = parseInt(hash1[i], 16) ^ parseInt(hash2[i], 16);
    while (bits) { distance += bits & 1; bits >>>= 1; }
  }
  return distance;
}

export function compareCardHashes(pitchCards, inventoryCards, threshold = 42, marginThreshold = 8) {
  const used = new Set();
  return pitchCards.map((card, index) => {
    let best = null;
    let secondBest = null;
    for (const candidate of inventoryCards) {
      if (used.has(candidate.id)) continue;
      const fullDistance = hammingDistance(card.hash, candidate.hash);
      const portraitDistance = hammingDistance(card.portraitHash, candidate.portraitHash);
      const distance = Number.isFinite(portraitDistance) ? Math.round(fullDistance * 0.35 + portraitDistance * 0.65) : fullDistance;
      if (distance < (best?.distance ?? Infinity)) {
        secondBest = best;
        best = { candidate, distance };
      } else if (distance < (secondBest?.distance ?? Infinity)) secondBest = { candidate, distance };
    }
    const margin = best && secondBest ? secondBest.distance - best.distance : Infinity;
    const accepted = Boolean(best && best.distance <= threshold && (margin >= marginThreshold || !secondBest));
    if (accepted) used.add(best.candidate.id);
    return { index, best, secondBest, margin, accepted };
  });
}
