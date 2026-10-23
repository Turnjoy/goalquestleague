import sharp from 'sharp';

const POSITIONS = new Set(['GK', 'CB', 'LB', 'RB', 'DMF', 'CMF', 'AMF', 'LMF', 'RMF', 'LWF', 'RWF', 'SS', 'CF']);

export function normalizeScreenshotPayload(body = {}) {
  if (Array.isArray(body.inventoryImages) && body.pitchImage) return { inventoryImages: body.inventoryImages, pitchImage: body.pitchImage };
  if (Array.isArray(body.images)) {
    if (body.images.length < 2 || body.images.length > 31) {
      const error = new Error('Upload 1–30 inventory screenshots followed by one tactical squad screenshot.');
      error.code = 'INVALID_IMAGE_COUNT';
      throw error;
    }
    return { inventoryImages: body.images.slice(0, -1), pitchImage: body.images[body.images.length - 1] };
  }
  return { inventoryImages: body.inventoryImages || [], pitchImage: body.pitchImage || null };
}

export function parseJson(text) {
  const source = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(source); } catch { return null; }
}

export function classifyGeminiError(error) {
  const status = Number(error?.status || error?.code || error?.cause?.status);
  const message = `${error?.message || ''} ${error?.statusText || ''} ${error?.cause?.message || ''}`.toLowerCase();
  if (status === 413 || /payload too large|request too large|token limit|too many images/.test(message)) return 'payload_too_large';
  if (status === 401 || /invalid api key|unauthorized|authentication/.test(message)) return 'authentication';
  if (status === 429 && /quota|billing|exhausted|daily limit/.test(message)) return 'quota';
  if (status === 429 || /rate.?limit/.test(message)) return 'rate_limit';
  if ([408, 500, 502, 503, 504].includes(status) || /timeout|timed out|econnreset|fetch failed|temporar|unavailable/.test(message)) return 'transient';
  if ([400, 404].includes(status) || /unsupported model|model not found|invalid argument/.test(message)) return 'invalid_request';
  return 'provider_error';
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const intEnv = (key, fallback, min, max) => Math.max(min, Math.min(max, Number.parseInt(process.env[key] || fallback, 10) || fallback));

async function invoke(ai, model, parts, maxAttempts, budget) {
  let last;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      if (budget.calls >= budget.max) throw Object.assign(new Error('call limit'), { pipelineCode: 'CALL_LIMIT' });
      budget.calls++;
      const response = await ai.models.generateContent({ model, contents: [{ role: 'user', parts }], config: { responseMimeType: 'application/json' } });
      const parsed = parseJson(response.text);
      if (!parsed) throw Object.assign(new Error('malformed response'), { pipelineCode: 'malformed_response' });
      return parsed;
    } catch (error) {
      last = error;
      const kind = error.pipelineCode || classifyGeminiError(error);
      if (kind === 'authentication' || kind === 'quota' || kind === 'invalid_request' || kind === 'provider_error' || kind === 'malformed_response') throw error;
      if (kind === 'payload_too_large') throw error;
      if (attempt + 1 < maxAttempts) {
        const headers = error?.headers || error?.response?.headers;
        const retryHeader = headers?.['retry-after'] || headers?.get?.('retry-after');
        const retrySeconds = Number(retryHeader);
        const retryDate = retryHeader && !Number.isFinite(retrySeconds) ? Date.parse(retryHeader) : NaN;
        const retryAfterMs = Number.isFinite(retrySeconds) && retrySeconds > 0 ? retrySeconds * 1000 : Number.isFinite(retryDate) ? Math.max(0, retryDate - Date.now()) : 0;
        const delay = retryAfterMs > 0 ? retryAfterMs : Math.min(10000, 500 * (2 ** attempt)) + Math.floor(Math.random() * 300);
        await sleep(delay);
      }
    }
  }
  throw last;
}

function inventoryPrompt(indices) {
  return `Identify every visible player card in these inventory screenshots. The image labels give 1-based source screenshot indexes. Extract only readable names, visible ratings/card details when present, location/card identifier, confidence, and normalized bounding_box [x,y,width,height] for each card (values 0 to 1 relative to the full screenshot). Do not invent missing values. Return JSON: {"cards":[{"name":string|null,"rating":number|null,"details":string|null,"location":string|null,"confidence":number,"screenshot":number,"bounding_box":[0.1,0.2,0.2,0.3]}]} Only use the supplied screenshot indexes: ${indices.join(', ')}. Keep separate card instances even when names repeat.`;
}

async function extractBatch(ai, model, images, indices, retryLimit, budget) {
  const parts = [{ text: inventoryPrompt(indices) }];
  images.forEach((buffer, i) => parts.push({ text: `Inventory screenshot ${indices[i]}` }, { inlineData: { mimeType: 'image/jpeg', data: buffer.toString('base64') } }));
  const result = await invoke(ai, model, parts, retryLimit, budget);
  if (!Array.isArray(result.cards)) throw Object.assign(new Error('incomplete response'), { pipelineCode: 'malformed_response' });
  return result.cards.filter(row => row && typeof row === 'object').map(row => ({
    name: typeof row.name === 'string' && row.name.trim().length <= 80 ? row.name.trim() : null,
    rating: Number.isInteger(row.rating) && row.rating >= 40 && row.rating <= 150 ? row.rating : null,
    details: typeof row.details === 'string' ? row.details.slice(0, 300) : null,
    location: typeof row.location === 'string' ? row.location.slice(0, 100) : null,
    confidence: Number.isFinite(Number(row.confidence)) ? Math.max(0, Math.min(1, Number(row.confidence))) : 0,
    screenshot: indices.includes(Number(row.screenshot)) ? Number(row.screenshot) : null,
    box: Array.isArray(row.bounding_box) && row.bounding_box.length === 4 && row.bounding_box.every(value => Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 1) ? row.bounding_box.map(Number) : null,
    provenance: { batch: `${model}:${indices.join('-')}`, model },
  }));
}

function chunks(items, maxSize) {
  const size = Math.max(1, Math.ceil(items.length / Math.ceil(items.length / maxSize)));
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
function initialBatches(items, maxSize) {
  const count = Math.max(2, Math.ceil(items.length / maxSize));
  const size = Math.ceil(items.length / count);
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function runSquadPipeline({ ai, primaryModel, fallbackModel, inventoryBuffers, pitchBuffer, progress = () => {} }) {
  const retryLimit = intEnv('GEMINI_RETRY_LIMIT', 2, 1, 4);
  const firstSize = intEnv('GEMINI_BATCH_SIZE', 15, 1, 15);
  const smallSize = intEnv('GEMINI_SMALL_BATCH_SIZE', 8, 1, 8);
  const indices = inventoryBuffers.map((_, i) => i + 1);
  const pending = initialBatches(indices, firstSize).map(indexes => ({ indexes, model: primaryModel }));
  const completed = [];
  const failed = [];
  const deadline = Date.now() + intEnv('GEMINI_PROCESSING_TIMEOUT_MS', 260000, 30000, 300000);
  const budget = { calls: 0, max: intEnv('GEMINI_MAX_CALLS', 24, 2, 40) };
  while (pending.length && budget.calls < budget.max && Date.now() < deadline) {
    const task = pending.shift();
    try {
      const cards = await extractBatch(ai, task.model, task.indexes.map(i => inventoryBuffers[i - 1]), task.indexes, retryLimit, budget);
      completed.push(...cards);
      progress({ stage: 'inventory', completedBatches: completed.length, failedBatches: failed.length, model: task.model });
    } catch (error) {
      const kind = error.pipelineCode || classifyGeminiError(error);
      if (task.indexes.length > smallSize && ['payload_too_large', 'transient', 'rate_limit', 'malformed_response'].includes(kind)) {
        pending.unshift(...chunks(task.indexes, smallSize).map(indexes => ({ indexes, model: task.model })));
      } else if (task.model === primaryModel && fallbackModel && ['payload_too_large', 'transient', 'rate_limit', 'malformed_response'].includes(kind)) {
        pending.unshift({ indexes: task.indexes, model: fallbackModel });
      } else failed.push({ indexes: task.indexes, code: kind });
    }
  }
  if (!completed.length || failed.length || pending.length) {
    const error = new Error('Inventory processing incomplete'); error.pipelineCode = 'INVENTORY_INCOMPLETE'; error.details = { successfulCards: completed.length, failedBatches: failed.length + pending.length }; throw error;
  }

  // Preserve repeat instances; only remove exact duplicate observations in the same source screenshot/location.
  const seen = new Set();
  const candidates = completed.filter(card => {
    const key = `${card.screenshot}|${card.location}|${card.name}|${card.rating}`;
    if (card.location && seen.has(key)) return false;
    if (card.location) seen.add(key);
    return true;
  });
  const candidateNames = candidates.map((card, id) => ({ id: `c${id + 1}`, name: card.name, rating: card.rating, details: card.details, screenshot: card.screenshot, location: card.location }));
  const candidateImages = await Promise.all(candidates.map(async (card, index) => {
    const source = inventoryBuffers[(card.screenshot || 0) - 1];
    if (!source || !card.box) return null;
    try {
      const meta = await sharp(source).metadata();
      const [x, y, w, h] = card.box;
      const left = Math.max(0, Math.min(meta.width - 1, Math.floor(x * meta.width)));
      const top = Math.max(0, Math.min(meta.height - 1, Math.floor(y * meta.height)));
      const width = Math.max(1, Math.min(meta.width - left, Math.floor(w * meta.width)));
      const height = Math.max(1, Math.min(meta.height - top, Math.floor(h * meta.height)));
      return await sharp(source).extract({ left, top, width, height }).resize(112, 144, { fit: 'contain', background: '#202020' }).jpeg({ quality: 55 }).toBuffer();
    } catch { return null; }
  }));
  const candidateGroups = [];
  for (let i = 0; i < candidates.length; i += 20) candidateGroups.push(candidates.slice(i, i + 20).map((card, j) => i + j));
  let matchedRows = [];
  let collectiveStrength = null;
  let modelUsed = primaryModel;
  for (const group of candidateGroups) {
    const groupNames = group.map(index => candidateNames[index]);
    const prompt = `Identify every visible starter and substitute on the tactical screenshot. Match against the supplied inventory candidates by visual identity, card image, and name; a player's listed position is not a constraint. Each candidate image follows its label. Return exact candidate ID and name or null, tactical boosted rating, displayed position, stable slot description, area, confidence and status confirmed/ambiguous/unmatched. Never force a match. JSON: {"collective_strength":null,"players":[{"candidate_id":null,"name":null,"rating":null,"position":null,"slot":"descriptive location","area":"starter","confidence":0,"status":"unmatched"}]}. Candidates: ${JSON.stringify(groupNames)}`;
    const makeParts = () => {
      const parts = [{ text: prompt }, { inlineData: { mimeType: 'image/jpeg', data: pitchBuffer.toString('base64') } }];
      group.forEach(index => {
        if (!candidateImages[index]) return;
        parts.push({ text: `Inventory candidate ${candidateNames[index].id}: ${candidateNames[index].name || 'unreadable'}, screenshot ${candidateNames[index].screenshot}` }, { inlineData: { mimeType: 'image/jpeg', data: candidateImages[index].toString('base64') } });
      });
      return parts;
    };
    try {
      const result = await invoke(ai, primaryModel, makeParts(), retryLimit, budget);
      if (!Array.isArray(result?.players)) throw Object.assign(new Error('Invalid match response'), { pipelineCode: 'malformed_response' });
      matchedRows.push(...result.players);
      if (Number.isInteger(result.collective_strength)) collectiveStrength = result.collective_strength;
    } catch (error) {
      const kind = classifyGeminiError(error);
      if (!fallbackModel || !['payload_too_large', 'transient', 'rate_limit', 'malformed_response'].includes(kind)) throw error;
      const result = await invoke(ai, fallbackModel, makeParts(), retryLimit, budget);
      if (!Array.isArray(result?.players)) throw Object.assign(new Error('Invalid match response'), { pipelineCode: 'malformed_response' });
      matchedRows.push(...result.players);
      if (Number.isInteger(result.collective_strength)) collectiveStrength = result.collective_strength;
      modelUsed = fallbackModel;
    }
  }
  const bySlot = new Map();
  for (const row of matchedRows) {
    if (!row || typeof row !== 'object') continue;
    const key = String(row.slot || `${row.area}|${row.position}|${row.rating}`);
    const prior = bySlot.get(key);
    if (!prior || (row.status === 'confirmed' && Number(row.confidence) > Number(prior.confidence))) bySlot.set(key, row);
  }
  const players = [...bySlot.values()].slice(0, 40).map((row, index) => {
    const candidate = candidateNames.find(item => item.id === row.candidate_id);
    const validName = candidate?.name || null;
    const candidateHasVisualEvidence = candidate ? Boolean(candidateImages[Number(candidate.id.slice(1)) - 1]) : false;
    const rating = Number.isInteger(row.rating) && row.rating >= 40 && row.rating <= 150 ? row.rating : null;
    const position = POSITIONS.has(String(row.position).toUpperCase()) ? String(row.position).toUpperCase() : 'Unknown';
    const isStarter = row.area === 'starter' ? true : row.area === 'substitute' ? false : null;
    const confirmed = Boolean(validName && candidateHasVisualEvidence && row.status === 'confirmed' && Number(row.confidence) >= 0.65);
    return { id: `gemini_${index + 1}`, name: confirmed ? validName : null, rating, position, tacticalPosition: position, registeredPosition: null, isStarter, area: isStarter === null ? 'unknown' : isStarter ? 'formation' : 'bench', matchMethod: 'gemini', matchStatus: confirmed ? 'matched' : 'manual_review', matchConfidence: confirmed ? Number(row.confidence) : 0, reviewStatus: confirmed ? 'matched' : 'needs_review', reviewReason: confirmed ? null : (row.status === 'unmatched' ? 'unmatched_candidate' : 'ambiguous_match'), inventoryCardId: candidate?.id || null, inventoryScreenshot: candidate?.screenshot || null, cardVersion: null, region: row.slot || null };
  });
  if (!players.length) throw Object.assign(new Error('No tactical players returned'), { pipelineCode: 'malformed_response' });
  return { players, candidates, collectiveStrength, modelUsed, calls: budget.calls };
}
