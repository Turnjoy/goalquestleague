/** Parse and constrain Gemini's identity choice to the supplied candidate set. */
export function parseGeminiCandidateResponse(text, candidates, minimumConfidence = 0.65) {
  let result;
  try { result = JSON.parse(String(text || '').replace(/^```(?:json)?\s*|\s*```$/g, '')); }
  catch { return { accepted: false, reason: 'invalid_json' }; }
  if (!result || typeof result !== 'object' || Array.isArray(result)) return { accepted: false, reason: 'invalid_shape' };
  const ratings = Number(result.rating_confidence) >= 0.75 ? Number(result.tactical_rating) : null;
  const positions = new Set(['GK', 'CB', 'LB', 'RB', 'DMF', 'CMF', 'AMF', 'LMF', 'RMF', 'LWF', 'RWF', 'SS', 'CF']);
  const tacticalRating = Number.isInteger(ratings) && ratings >= 40 && ratings <= 150 ? ratings : null;
  const tacticalPosition = Number(result.position_confidence) >= 0.75 && positions.has(String(result.tactical_position).toUpperCase())
    ? String(result.tactical_position).toUpperCase() : null;
  if (result.candidate_id === null || result.candidate_id === 'uncertain') return {
    accepted: false, reason: 'uncertain', tacticalRating, tacticalPosition,
  };
  const candidate = candidates.find(item => item.id === result.candidate_id);
  if (!candidate) return { accepted: false, reason: 'unknown_candidate' };
  const confidence = Number(result.confidence);
  if (!Number.isFinite(confidence) || confidence < minimumConfidence || confidence > 1) return { accepted: false, reason: 'low_confidence' };
  return { accepted: true, candidate, confidence, reason: String(result.reason || '').slice(0, 240), tacticalRating, tacticalPosition };
}

function normalizeNameToken(value) {
  return String(value || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/0/g, 'o').replace(/[^a-z]/g, '');
}

function editSimilarity(left, right) {
  if (!left || !right) return 0;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row++) {
    const current = [row];
    for (let column = 1; column <= right.length; column++) {
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return 1 - previous[right.length] / Math.max(left.length, right.length);
}

function isPlausibleOcrCorrection(ocrName, correctedName) {
  const ocrTokens = String(ocrName || '').split(/\s+/).map(normalizeNameToken).filter(Boolean);
  const correctedTokens = String(correctedName || '').split(/\s+/).map(normalizeNameToken).filter(Boolean);
  if (!ocrTokens.length || !correctedTokens.length) return false;
  let exactTokenMatches = 0;
  const allOcrTokensAccountedFor = ocrTokens.every(ocrToken => {
    const best = Math.max(...correctedTokens.map(correctedToken => editSimilarity(ocrToken, correctedToken)));
    if (best === 1) exactTokenMatches++;
    return best >= (ocrTokens.length === 1 ? 0.8 : 0.5);
  });
  return allOcrTokensAccountedFor && (exactTokenMatches > 0 || ocrTokens.length === 1);
}

/** SDK client is injected to keep quota/error and response behavior mockable. */
export async function askGeminiToCompare(ai, model, pitchBuffer, candidates) {
  const prompt = [
    'Compare the pitch player card with the supplied inventory portrait cards.',
    'Each candidate image is immediately preceded by its candidate ID and OCR name.',
    'Choose only an ID shown below if the face/card portrait is a reliable visual match.',
    'Do not infer a player name. If uncertain, return candidate_id "uncertain".',
    'Read rating and tactical position from the pitch crop only. Return null when unclear; never guess.',
    'Return JSON with candidate_id, confidence, reason, tactical_rating, rating_confidence, tactical_position, and position_confidence.',
    ...candidates.map(candidate => `Candidate ID: ${candidate.id}; OCR name: ${candidate.playerName || 'unreadable'}`),
  ].join('\n');
  const parts = [{ text: prompt }, { inlineData: { mimeType: 'image/jpeg', data: pitchBuffer.toString('base64') } }];
  for (const candidate of candidates) parts.push(
    { text: `Inventory candidate ${candidate.id}; OCR name: ${candidate.playerName || 'unreadable'}` },
    { inlineData: { mimeType: 'image/jpeg', data: candidate.imageBuffer.toString('base64') } },
  );
  const response = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts }],
    config: { responseMimeType: 'application/json' },
  });
  return parseGeminiCandidateResponse(response.text, candidates);
}

/** Read a complete squad image and compare every player with the uploaded inventory screens. */
export function parseGeminiSquadResponse(text, inventoryCandidates = null) {
  let result;
  try { result = JSON.parse(String(text || '').replace(/^```(?:json)?\s*|\s*```$/g, '')); }
  catch { return { accepted: false, reason: 'invalid_json' }; }
  if (!result || typeof result !== 'object' || !Array.isArray(result.players)) return { accepted: false, reason: 'invalid_shape' };
  const positions = new Set(['GK', 'CB', 'LB', 'RB', 'DMF', 'CMF', 'AMF', 'LMF', 'RMF', 'LWF', 'RWF', 'SS', 'CF']);
  const players = result.players.slice(0, 40).map((row, index) => {
    if (!row || typeof row !== 'object') return null;
    const inventoryCandidate = Array.isArray(inventoryCandidates)
      ? inventoryCandidates.find(candidate => candidate.id === row.candidate_id)
      : null;
    const responseName = typeof row.name === 'string' && row.name.trim().length <= 80 ? row.name.trim() : null;
    const nameConfidence = Number(row.name_confidence);
    const validName = responseName && responseName.length >= 2
      && responseName.split(/\s+/u).length <= 4
      && /^[\p{L}\p{M}'’.-]+(?:\s+[\p{L}\p{M}'’.-]+){0,3}$/u.test(responseName);
    // Gemini may repair noisy OCR, but only for an ID supplied by local OCR
    // and only when it is confident in the corrected spelling.
    const name = validName && Number.isFinite(nameConfidence) && nameConfidence >= 0.7
      && (!Array.isArray(inventoryCandidates) || Boolean(inventoryCandidate))
      && (!inventoryCandidate || isPlausibleOcrCorrection(inventoryCandidate.name, responseName)) ? responseName : null;
    const ratingConfidence = Number(row.rating_confidence);
    const matchConfidence = Number(row.match_confidence);
    const rawRating = Number(row.rating);
    const rating = Number.isInteger(rawRating) && rawRating >= 40 && rawRating <= 150 && ratingConfidence >= 0.65 ? rawRating : null;
    const rawPosition = String(row.position || '').toUpperCase();
    const position = Number(row.position_confidence) >= 0.65 && positions.has(rawPosition) ? rawPosition : 'Unknown';
    const isStarter = row.area === 'starter' ? true : row.area === 'substitute' ? false : null;
    const screenshotNumber = Number(row.inventory_screenshot);
    const confidentName = name;
    if (!confidentName && rating === null && position === 'Unknown') return null;
    const matched = Boolean(confidentName && Number.isFinite(matchConfidence) && matchConfidence >= 0.7);
    return {
      id: `gemini_${index + 1}`,
      name: confidentName,
      rating,
      position,
      tacticalPosition: position,
      registeredPosition: null,
      isStarter,
      area: isStarter === null ? 'unknown' : isStarter ? 'formation' : 'bench',
      matchMethod: 'gemini',
      matchStatus: matched ? 'matched' : 'manual_review',
      matchConfidence: matched ? matchConfidence : 0,
      reviewStatus: matched ? 'matched' : 'needs_review',
      reviewReason: matched ? null : 'gemini_uncertain',
      inventoryCardId: inventoryCandidate?.id || null,
      inventoryScreenshot: inventoryCandidate?.screenshot || (Number.isInteger(screenshotNumber) && screenshotNumber >= 1 && screenshotNumber <= 30 ? screenshotNumber : null),
      cardVersion: null,
      region: null,
    };
  }).filter(Boolean);
  if (!players.length) return { accepted: false, reason: 'no_confident_players' };
  const collectiveStrengthValue = Number(result.collective_strength);
  const collectiveStrength = Number.isInteger(collectiveStrengthValue)
    && collectiveStrengthValue >= 1000
    && collectiveStrengthValue <= 5000
    && Number(result.collective_strength_confidence) >= 0.7
    ? collectiveStrengthValue
    : null;
  return { accepted: true, players, collectiveStrength };
}

/** Send one tactical screenshot plus locally OCR'd inventory names; no inventory image leaves the server. */
export async function askGeminiToExtractSquadFromNames(ai, model, pitchBuffer, inventoryCandidates) {
  const roster = inventoryCandidates.map(candidate => ({ id: candidate.id, name: candidate.name, ocr_confidence: candidate.confidence ?? null }));
  const prompt = [
    'The only image in this request is the tactical squad screenshot. The roster below was extracted locally from the user’s inventory screenshots; those inventory images are not included.',
    'For each pitch card, identify the footballer from the visible card portrait first. Then match that identity to the most likely inventory roster candidate. The roster list is only a set of possible candidates; a name being present in it is not evidence that the pictured player is that person.',
    'OCR names may contain typos, missing first or last names, or character recognition errors. When the pitch image identifies a well-known footballer and a supplied OCR candidate is a clear spelling variant of that same identity, return the correctly spelled canonical player name in name while preserving that candidate ID. Never change the identity to a different player just to make a name look familiar.',
    'Examples of spelling repair only: "Achat Hakimi" can be "Achraf Hakimi"; "Vinicius Janior" can be "Vinícius Júnior"; "B0Jan Krkic" can be "Bojan Krkić". Apply a repair only when the pitch image and roster make that identity clear.',
    'Use only candidate IDs from the supplied roster. Do not invent a roster candidate or reuse a candidate ID. Do not use rating or position alone to decide identity. Never substitute one roster player for another because the roster contains a familiar name. If portrait identity is uncertain or the OCR text does not plausibly support your spelling correction, return candidate_id null or name null with low confidence. Read tactical rating, position, and starter/substitute area from the pitch screenshot only.',
    'Return JSON only in this schema: {"collective_strength":null,"collective_strength_confidence":0,"players":[{"candidate_id":"inv-1-1","name":"canonical corrected player name or null","name_confidence":0,"rating":null,"rating_confidence":0,"position":"CF","position_confidence":0,"area":"starter or substitute","match_confidence":0}]}.',
    `OCR roster candidates (confidence is Tesseract's estimate; low confidence may mean the spelling needs correction): ${JSON.stringify(roster)}`,
  ].join('\n');
  const response = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts: [
      { text: prompt },
      { inlineData: { mimeType: 'image/jpeg', data: pitchBuffer.toString('base64') } },
    ] }],
    config: { responseMimeType: 'application/json' },
  });
  return parseGeminiSquadResponse(response.text, inventoryCandidates);
}

/** Use only free-tier model IDs and make at most one request per model per submission. */
export async function askGeminiToExtractSquadFromNamesWithFallback(ai, models, pitchBuffer, inventoryCandidates) {
  let lastError = null;
  let calls = 0;
  for (const model of [...new Set(models.filter(Boolean))]) {
    try {
      calls++;
      const result = await askGeminiToExtractSquadFromNames(ai, model, pitchBuffer, inventoryCandidates);
      if (result.accepted) return { ...result, modelUsed: model, calls };
      console.warn(`Gemini ${model} returned an uncertain roster; trying the next free-tier model.`);
    } catch (error) {
      lastError = error;
      if (isNonRetryableGeminiError(error) && !/quota|billing|daily limit|monthly limit|exhausted|rate.?limit/.test(String(error.message || '').toLowerCase())) throw error;
      console.warn(`Gemini ${model} unavailable for this request; trying the next free-tier model.`);
    }
  }
  if (lastError) throw lastError;
  return { accepted: false, reason: 'no_confident_players', calls };
}

/** Send the pitch and all uploaded inventory screenshots together in one memory-only request. */
export async function askGeminiToExtractSquad(ai, model, pitchBuffer, inventoryBuffers) {
  const prompt = [
    'Identify the full football squad shown on the pitch screenshot, including the starting formation and the substitutes displayed along the right side.',
    'The first image is the pitch screenshot. The remaining images are numbered inventory screenshots from the same game account.',
    'Use the inventory screenshots only to read player names and visually match card portraits. Ignore ratings, positions, and other numbers shown in inventory screenshots. Match by card portrait and identity, not by name alone. The same footballer may appear more than once in the inventory or squad; preserve each distinct squad slot.',
    'Read each overall rating from the pitch screenshot. Read every player card rating and position from that screenshot. Also read the squad Collective Strength/total squad rating displayed on the pitch screen if visible. Mark each entry area as starter or substitute.',
    'Return only players clearly visible on the pitch or substitute bench. Do not include inventory-only players or cards cut off so severely that they cannot be identified.',
    'Never invent a name, rating, position, or match. Use null for uncertain name or rating and use confidence values from 0 to 1. inventory_screenshot is the 1-based image number where the matching card was found, or null.',
    'Return JSON only: {"collective_strength":3186,"collective_strength_confidence":0.0,"players":[{"name":"... or null","name_confidence":0.0,"rating":104,"rating_confidence":0.0,"position":"CF","position_confidence":0.0,"area":"starter or substitute","match_confidence":0.0,"inventory_screenshot":1}]}',
  ].join('\n');
  const parts = [{ text: prompt }, { inlineData: { mimeType: 'image/jpeg', data: pitchBuffer.toString('base64') } }];
  inventoryBuffers.forEach((buffer, index) => parts.push(
    { text: `Inventory screenshot ${index + 1}` },
    { inlineData: { mimeType: 'image/jpeg', data: buffer.toString('base64') } },
  ));
  const response = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts }],
    config: { responseMimeType: 'application/json' },
  });
  return parseGeminiSquadResponse(response.text);
}

/** Retry transient overloads, then route to a second stable Flash model. */
export async function askGeminiToExtractSquadWithFallback(ai, primaryModel, fallbackModel, pitchBuffer, inventoryBuffers) {
  const models = [...new Set([primaryModel, fallbackModel].filter(Boolean))];
  let lastResult = null;
  let lastError = null;

  for (let modelIndex = 0; modelIndex < models.length; modelIndex++) {
    const model = models[modelIndex];
    // Both models can be affected by a shared service demand spike, so retry
    // the fallback too, but cap the total attempts to avoid an endless spinner.
    const attempts = modelIndex === 0 ? 2 : 3;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const result = await askGeminiToExtractSquad(ai, model, pitchBuffer, inventoryBuffers);
        lastResult = { ...result, modelUsed: model };
        if (result.accepted) return lastResult;
        // A backup model gets one chance to recover from malformed/uncertain output.
        break;
      } catch (error) {
        lastError = error;
        if (!isRetryableGeminiError(error)) throw error;
        if (attempt + 1 < attempts) {
          const delayMs = 1000 * (2 ** attempt) + Math.floor(Math.random() * 400);
          console.warn(`Gemini model ${model} returned a temporary error; retry ${attempt + 1}/${attempts - 1} in ${delayMs}ms`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          continue;
        }
        if (modelIndex + 1 < models.length) {
          console.warn(`Gemini model ${model} is unavailable; switching to ${models[modelIndex + 1]}`);
        } else {
          console.error(`Gemini fallback model ${model} also failed after ${attempts} attempts`);
        }
      }
    }
  }

  if (lastResult) return lastResult;
  throw lastError || new Error('Gemini extraction failed without a response');
}

export function isRetryableGeminiError(error) {
  const code = Number(error?.status || error?.code || error?.cause?.status);
  const message = `${error?.message || ''} ${error?.statusText || ''} ${error?.cause?.message || ''}`.toLowerCase();
  if (code === 429) return !/quota|billing|prepay|daily limit|monthly limit/.test(message);
  return [408, 500, 502, 503, 504].includes(code)
    || /\b(unavailable|service unavailable|high demand|overloaded|temporarily unavailable|econnreset|etimedout|fetch failed)\b/.test(message);
}

export function isNonRetryableGeminiError(error) {
  const code = Number(error?.status || error?.code);
  const message = `${error?.message || ''} ${error?.statusText || ''}`.toLowerCase();
  return [400, 401, 403, 404, 429].includes(code) || /quota|rate.?limit|api key|unauthori[sz]ed|permission denied|model not found/.test(message);
}
