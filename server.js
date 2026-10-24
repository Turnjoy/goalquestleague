import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import sharp from 'sharp';
import { createWorker } from 'tesseract.js';
import { imageHash } from 'image-hash';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import { compareCardHashes, detectInventoryRegions, detectPitchRegionsFromPixels, detectPitchRegionsFromWords, validateCrop } from './crop-utils.js';
import { askGeminiToCompare, askGeminiToExtractSquadWithFallback, isRetryableGeminiError } from './gemini-fallback.js';
import { runSquadPipeline, classifyGeminiError, normalizeScreenshotPayload } from './gemini-pipeline.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 10000;

const allowedOrigins = new Set([
  'https://goalquestleague.com.ng',
  'https://0e39606a.goalquestleague.pages.dev',
  'https://goalquestleague.pages.dev',
  ...String(process.env.FRONTEND_ORIGIN || '').split(',').map(value => value.trim()).filter(Boolean),
]);
for (const origin of ['http://localhost:5173', 'http://127.0.0.1:5173']) allowedOrigins.add(origin);
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(null, false);
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.use(express.json({ limit: '180mb' }));
app.use(express.urlencoded({ limit: '180mb', extended: true }));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024, files: 31 } });
const supabaseAuth = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL) && (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY)
  ? createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } }) : null;

async function requireUser(req, res, next) {
  if (!supabaseAuth) return res.status(503).json({ error: 'Screenshot processing is not configured.', code: 'AUTH_NOT_CONFIGURED' });
  const token = /^Bearer\s+(.+)$/i.exec(req.get('authorization') || '')?.[1];
  if (!token) return res.status(401).json({ error: 'Please sign in before processing screenshots.', code: 'AUTH_REQUIRED' });
  try {
    const { data, error } = await supabaseAuth.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ error: 'Your session has expired. Please sign in again.', code: 'INVALID_SESSION' });
    req.user = data.user;
    return next();
  } catch {
    return res.status(503).json({ error: 'We could not verify your session right now.', code: 'AUTH_UNAVAILABLE' });
  }
}

// Helper: Compute perceptual hash for image comparison
async function computeImageHash(buffer) {
  return new Promise((resolve, reject) => {
    imageHash({ data: buffer, ext: 'image/jpeg' }, 16, true, (error, hash) => {
      if (error) reject(error);
      else resolve(hash);
    });
  });
}

async function computePortraitHash(buffer) {
  const { width, height } = await sharp(buffer).metadata();
  const portrait = await sharp(buffer)
    .extract({ left: Math.floor(width * 0.18), top: Math.floor(height * 0.16), width: Math.floor(width * 0.64), height: Math.floor(height * 0.52) })
    .resize(120, 100, { fit: 'fill' })
    .jpeg()
    .toBuffer();
  return computeImageHash(portrait);
}

// Helper: Calculate Hamming distance between two hashes
// Helper: Convert base64 to buffer
function base64ToBuffer(base64String) {
  const base64Data = base64String.replace(/^data:image\/\w+;base64,/, '');
  return Buffer.from(base64Data, 'base64');
}

// Reduce screenshot payloads before sending them inline to Gemini; buffers stay in memory.
async function prepareGeminiImage(buffer) {
  return sharp(buffer)
    .rotate()
    .resize({ width: 1440, withoutEnlargement: true })
    .jpeg({ quality: 78, mozjpeg: true })
    .toBuffer();
}

// Stage A: Process inventory screenshots
async function processInventoryScreenshots(inventoryImages) {
  console.log(`Processing ${inventoryImages.length} inventory screenshots...`);
  
  const worker = await createWorker('eng');
  const inventoryCards = [];

  try {
  for (let imgIndex = 0; imgIndex < inventoryImages.length; imgIndex++) {
    let buffer;
    try {
      buffer = base64ToBuffer(inventoryImages[imgIndex]);
    } catch (error) {
      console.error(`Image ${imgIndex + 1}: Failed to convert base64 to buffer:`, error.message);
      continue;
    }
    
    // Get image metadata
    let metadata;
    try {
      metadata = await sharp(buffer).metadata();
      console.log(`Image ${imgIndex + 1}: ${metadata.width}x${metadata.height}, format: ${metadata.format}`);
    } catch (error) {
      console.error(`Image ${imgIndex + 1}: Failed to read image metadata:`, error.message);
      continue;
    }

    // Perform OCR on the full image
    // Request blocks output to get word-level information with bbox
    let ocrResult;
    try {
      ocrResult = await worker.recognize(buffer, {}, { blocks: true });
    } catch (error) {
      console.error(`Image ${imgIndex + 1}: OCR failed:`, error.message);
      continue;
    }
    
    const text = ocrResult.data?.text || '';
    
    // Extract words from blocks structure (blocks → paragraphs → lines → words)
    const words = [];
    if (ocrResult.data?.blocks) {
      for (const block of ocrResult.data.blocks) {
        if (block.paragraphs) {
          for (const paragraph of block.paragraphs) {
            if (paragraph.lines) {
              for (const line of paragraph.lines) {
                if (line.words) {
                  words.push(...line.words);
                }
              }
            }
          }
        }
      }
    }
    
    console.log(`Image ${imgIndex + 1}: OCR text length: ${text.length}, words: ${words.length}`);
    
    // Extract player names from OCR results
    // Filter for likely player names (proper case, reasonable length)
    const ignoredInventoryWords = new Set(['level', 'players', 'capacity', 'collective', 'strength', 'free', 'view', 'selection', 'action', 'back']);
    const playerNames = words.filter(w => w && w.confidence > 10 && w.text && w.text.length > 2 && w.text.length < 30)
      .map(w => w.text).filter(text => !ignoredInventoryWords.has(text.toLowerCase())
        && /^[\p{Lu}][\p{L}]+(?:['’\-][\p{Lu}]?[\p{L}]+)*$/u.test(text));

    console.log(`Image ${imgIndex + 1}: Found ${playerNames.length} potential player names`);

    // For inventory screenshots, assume grid layout (common in eFootball)
    // Detect card regions by analyzing the image structure
    const cardRegions = await detectCardRegions(buffer, 'inventory');
    let validCrops = 0;
    let rejectedCrops = 0;
    
    // Associate names with card regions based on spatial proximity
    for (let cardIdx = 0; cardIdx < cardRegions.length; cardIdx++) {
      const region = cardRegions[cardIdx];
      const crop = validateCrop({ left: region.left, top: region.top, width: region.width, height: region.height }, metadata.width, metadata.height);
      if (!crop.ok) {
        rejectedCrops++;
        console.warn(`Image ${imgIndex + 1}: Rejected card crop ${cardIdx + 1}: ${crop.reason}; region=${JSON.stringify(region)}`);
        continue;
      }
      if (crop.clamped) console.warn(`Image ${imgIndex + 1}: Clamped card crop ${cardIdx + 1} to image bounds`);
      let cardBuffer;
      try {
        cardBuffer = await sharp(buffer)
          .extract(crop.region)
          .resize(128, 128, { fit: 'contain', background: '#222222' })
          .jpeg()
          .toBuffer();
      } catch (error) {
        rejectedCrops++;
        console.warn(`Image ${imgIndex + 1}: Rejected card crop ${cardIdx + 1}: Sharp extraction failed: ${error.message}`);
        continue;
      }
      
      const cardHash = await computeImageHash(cardBuffer);
      const portraitHash = await computePortraitHash(cardBuffer);
      
      // Find the closest player name to this card region
      validCrops++;
      const tile = region.tile || crop.region;
      let cropWords = [];
      try {
        const nameCrop = await sharp(buffer).extract({
          left: tile.left + Math.floor(tile.width * 0.20),
          top: tile.top + Math.floor(tile.height * 0.05),
          width: Math.floor(tile.width * 0.78),
          height: Math.max(1, Math.floor(tile.height * 0.40)),
        }).resize({ width: Math.floor(tile.width * 2.34) }).grayscale().normalize().png().toBuffer();
        cropWords = flattenWords((await worker.recognize(nameCrop, {}, { blocks: true })).data);
      } catch (error) { console.warn(`Inventory image ${imgIndex + 1} tile ${cardIdx + 1}: name crop OCR failed: ${error.message}`); }
      const nameEvidence = mergeInventoryName(tile, words, playerNames, cropWords);
      const closestName = nameEvidence.name;
      if (!closestName) console.warn(`Inventory image ${imgIndex + 1} tile ${cardIdx + 1}: no confident name associated; tile=${JSON.stringify(tile)}`);
      else console.info(`Inventory image ${imgIndex + 1} tile ${cardIdx + 1}: associated OCR name "${closestName}"`);
      
      inventoryCards.push({
        id: `inv_${imgIndex}_${cardIdx}`,
        imageBuffer: cardBuffer,
        hash: cardHash,
        portraitHash,
        playerName: closestName || 'Unknown',
        nameConfidence: nameEvidence.confidence,
        rating: findReadableRating(words, tile),
        position: findReadablePosition(words, tile),
        matchStatus: closestName ? 'associated' : 'manual_review',
        region: tile,
        cardVersion: null,
        sourceImage: imgIndex
      });
    }
    console.log(`Image ${imgIndex + 1}: Created ${validCrops} valid card crops; rejected ${rejectedCrops}`);
  }

  } finally {
    await worker.terminate();
  }
  console.log(`Extracted ${inventoryCards.length} inventory cards`);
  if (inventoryCards.length === 0) {
    throw new Error('No valid inventory card crops could be created; check screenshot dimensions and card layout');
  }
  return inventoryCards;
}

function mergeInventoryName(tile, fullImageWords, playerNames, cropWords) {
  const fullName = findClosestName(tile, fullImageWords, playerNames);
  const fullTokens = String(fullName || '').split(/\s+/).filter(Boolean);
  const cropTokens = (cropWords || []).filter(word => word && word.text && word.confidence > 5
    && /^[\p{Lu}][\p{L}]+(?:['’\-][\p{Lu}]?[\p{L}]+)*$/u.test(word.text));
  const merged = [];
  for (let index = 0; index < Math.max(fullTokens.length, cropTokens.length); index++) {
    const full = fullTokens[index];
    const cropped = cropTokens[index];
    if (full && cropped) {
      const fullConfidence = (fullImageWords || []).find(word => word.text === full)?.confidence || 0;
      merged.push(cropped.confidence > fullConfidence ? cropped.text : full);
    } else if (cropped) merged.push(cropped.text);
    else if (full) merged.push(full);
  }
  const name = merged.length ? merged.join(' ') : fullName;
  const confidence = merged.length ? merged.reduce((sum, token) => {
    const crop = cropTokens.find(word => word.text === token);
    const full = (fullImageWords || []).find(word => word.text === token);
    return sum + Math.max(crop?.confidence || 0, full?.confidence || 0);
  }, 0) / merged.length : 0;
  return { name: name || null, confidence: Math.round(confidence) };
}

// Detect card regions in an image
async function detectCardRegions(buffer, type) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    console.error('Invalid buffer provided to detectCardRegions');
    return [];
  }
  
  const metadata = await sharp(buffer).metadata();
  if (!metadata || !metadata.width || !metadata.height) {
    console.error('Failed to get image metadata');
    return [];
  }
  
  const regions = [];

  if (type === 'inventory') {
    return detectInventoryRegions(metadata.width, metadata.height);
  }

  return regions;
}

// Find the closest player name to a card region
function findClosestName(region, words, playerNames) {
  if (!words || !Array.isArray(words) || words.length === 0) {
    return null;
  }
  
  if (!playerNames || !Array.isArray(playerNames) || playerNames.length === 0) {
    return null;
  }
  
  const cardCenterX = region.left + region.width / 2;
  const cardCenterY = region.top + region.height * 0.32;
  
  const candidates = [];
  
  for (const word of words) {
    if (!word || !word.text || !playerNames.includes(word.text)) continue;
    if (!word.bbox || word.bbox.x0 === undefined || word.bbox.x1 === undefined || word.bbox.y0 === undefined || word.bbox.y1 === undefined) continue;
    
    const wordCenterX = word.bbox.x0 + (word.bbox.x1 - word.bbox.x0) / 2;
    const wordCenterY = word.bbox.y0 + (word.bbox.y1 - word.bbox.y0) / 2;
    
    const inside = wordCenterX >= region.left + region.width * 0.20 && wordCenterX < region.left + region.width && wordCenterY >= region.top && wordCenterY < region.top + region.height * 0.54;
    const distance = Math.sqrt(
      Math.pow(cardCenterX - wordCenterX, 2) + 
      Math.pow(cardCenterY - wordCenterY, 2)
    );
    
    if (inside) candidates.push({ word, wordCenterX, wordCenterY, distance });
  }
  candidates.sort((a, b) => a.distance - b.distance);
  const anchor = candidates[0];
  if (!anchor) return null;
  const line = candidates.filter(item => Math.abs(item.wordCenterY - anchor.wordCenterY) <= Math.max(12, (anchor.word.bbox.y1 - anchor.word.bbox.y0) * 1.6))
    .sort((a, b) => a.wordCenterX - b.wordCenterX)
    .map(item => item.word.text);
  return line.join(' ');
}

function findReadableRating(words, region) {
  const text = words.filter(word => word.bbox && word.bbox.x0 >= region.left && word.bbox.x1 <= region.left + region.width && word.bbox.y0 >= region.top && word.bbox.y1 <= region.top + region.height).map(word => word.text).join(' ');
  const rating = text.match(/\b(4\d|[5-9]\d|1[0-4]\d|150)\b/);
  return rating ? Number(rating[1]) : null;
}

function flattenWords(data) {
  const words = [];
  for (const block of data?.blocks || []) for (const paragraph of block.paragraphs || [])
    for (const line of paragraph.lines || []) words.push(...(line.words || []));
  return words;
}

function findReadablePosition(words, region) {
  const positions = new Set(['GK', 'CB', 'LB', 'RB', 'DMF', 'CMF', 'AMF', 'LMF', 'RMF', 'LWF', 'RWF', 'SS', 'CF']);
  return words.find(word => word.bbox && word.bbox.x0 >= region.left && word.bbox.x1 <= region.left + region.width && word.bbox.y0 >= region.top && word.bbox.y1 <= region.top + region.height && positions.has(word.text.toUpperCase()))?.text.toUpperCase() || 'Unknown';
}

// Stage B: OCR the full pitch and crop around actual position/rating text anchors.
async function processPitchScreenshot(pitchImage) {
  console.log('Processing pitch screenshot...');
  const buffer = base64ToBuffer(pitchImage);
  const metadata = await sharp(buffer).metadata();
  if (!metadata.width || !metadata.height) throw new Error('Invalid pitch screenshot');
  const ocrBuffer = await sharp(buffer).resize({ width: metadata.width * 2 }).grayscale().normalize().png().toBuffer();
  const worker = await createWorker('eng');
  let pitchCards = [];
  let candidateCount = 0;
  try {
    const result = await worker.recognize(ocrBuffer, {}, { blocks: true });
    const words = flattenWords(result.data).map(word => ({...word, bbox: Object.fromEntries(Object.entries(word.bbox || {}).map(([key, value]) => [key, Math.round(value / 2)]))}));
    const { data: pixels, info } = await sharp(buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const visualRegions = detectPitchRegionsFromPixels(pixels, info.width, info.height, info.channels);
    const textRegions = detectPitchRegionsFromWords(words, metadata.width, metadata.height);
    const regions = [...visualRegions];
    for (const proposal of textRegions) if (!regions.some(region => overlapsRegions(region, proposal) > 0.35)) regions.push(proposal);
    regions.sort((a, b) => a.top - b.top || a.left - b.left);
    candidateCount = regions.length;
    console.log(`Pitch OCR found ${words.length} words and ${regions.length} card candidates`);
    for (let index = 0; index < regions.length; index++) {
      const region = regions[index];
      const crop = validateCrop({ left: region.left, top: region.top, width: region.width, height: region.height }, metadata.width, metadata.height);
      if (!crop.ok) { console.warn(`Pitch: rejected candidate ${index + 1}: ${crop.reason}; region=${JSON.stringify(region)}`); continue; }
      if (crop.clamped) console.warn(`Pitch: clamped candidate ${index + 1} to image bounds`);
      const cardBuffer = await sharp(buffer).extract(crop.region).resize(160, 176, { fit: 'contain', background: '#101010' }).jpeg().toBuffer();
      let cardOcr = '';
      try {
        const textCrop = await sharp(cardBuffer).extract({ left: 0, top: 0, width: 82, height: 96 }).resize(492, 576).grayscale().normalize().png().toBuffer();
        cardOcr = `${(await worker.recognize(textCrop)).data?.text || ''}\n${(await worker.recognize(cardBuffer)).data?.text || ''}`;
      }
      catch (error) { console.warn(`Pitch: OCR failed for candidate ${index + 1}: ${error.message}`); }
      const anchorWords = region.anchors.map(word => word.text).join(' ');
      const rating = extractRating(`${anchorWords}\n${cardOcr}`);
      const position = (anchorWords.match(/\b(GK|CB|LB|RB|DMF|CMF|AMF|LMF|RMF|LWF|RWF|SS|CF)\b/i)?.[1] || cardOcr.match(/\b(GK|CB|LB|RB|DMF|CMF|AMF|LMF|RMF|LWF|RWF|SS|CF)\b/i)?.[1] || 'Unknown').toUpperCase();
      if (rating === 0 && position === 'Unknown' && region.detection !== 'color_frame') { console.warn(`Pitch: rejected candidate ${index + 1}: no rating or tactical position; region=${JSON.stringify(crop.region)}`); continue; }
      const hash = await computeImageHash(cardBuffer);
      const portraitHash = await computePortraitHash(cardBuffer);
      pitchCards.push({ id: `pitch_${index}`, imageBuffer: cardBuffer, hash, portraitHash, name: null, rating: rating || null, position, isStarter: region.area !== 'bench', area: region.area, region: crop.region });
    }
  } finally { await worker.terminate(); }
  console.log(`Pitch: returned ${pitchCards.length} evidence-backed cards; rejected ${candidateCount - pitchCards.length}`);
  return { cards: pitchCards, detectedRegionCount: candidateCount, rejectedCrops: candidateCount - pitchCards.length };
}

function overlapsRegions(a, b) {
  const width = Math.max(0, Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left));
  const height = Math.max(0, Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top));
  return width * height / Math.max(1, Math.min(a.width * a.height, b.width * b.height));
}
// Extract rating from OCR text
function extractRating(text) {
  // Look for 2-3 digit numbers in the range 1-150
  const ratingMatch = text.match(/\b([4-9]\d|1[0-4]\d|150)\b/);
  if (ratingMatch) {
    const rating = parseInt(ratingMatch[1]);
    if (rating >= 1 && rating <= 150) {
      return rating;
    }
  }
  return 0; // Default if no rating found
}

// Stage C: local portrait match first; Gemini sees only unresolved cards and top candidates.
async function matchCards(pitchCards, inventoryCards) {
  if (!pitchCards?.length) return [];
  const availableInventory = Array.isArray(inventoryCards) ? inventoryCards : [];
  const comparisons = compareCardHashes(pitchCards, availableInventory);
  const used = new Set();
  const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;
  const model = process.env.GEMINI_PRIMARY_MODEL || process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  let geminiCalls = 0;
  let disableGemini = !ai;
  if (!ai) console.info('Gemini fallback unavailable: GEMINI_API_KEY is not configured; uncertain identities require review');
  else console.log(`Gemini fallback model configured: ${model}`);

  const records = [];
  for (let index = 0; index < pitchCards.length; index++) {
    const pitch = pitchCards[index];
    const comparison = comparisons[index];
    const best = comparison?.best;
    const confidence = best ? Math.max(0, Math.min(1, 1 - best.distance / 256)) : 0;
    let candidate = comparison?.accepted && best?.candidate?.playerName !== 'Unknown' ? best.candidate : null;
    let method = candidate ? 'local' : 'manual_review';
    let reviewStatus = candidate ? 'matched' : 'needs_review';
    let reason = null;
    let geminiConfidence = null;

    if (candidate && used.has(candidate.id)) {
      candidate = null;
      method = 'manual_review';
      reviewStatus = 'needs_review';
      reason = 'duplicate_inventory_assignment';
    }

    if (!candidate && ai && !disableGemini && geminiCalls < 8 && availableInventory.length) {
      const ranked = availableInventory
        .filter(item => !used.has(item.id) && item.playerName && item.playerName !== 'Unknown')
        .map(item => ({ candidate: item, distance: Math.min(
          hammingDistanceSafe(pitch.hash, item.hash),
          hammingDistanceSafe(pitch.portraitHash, item.portraitHash),
        ) }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 3)
        .map(item => item.candidate);
      if (ranked.length) {
        try {
          if (geminiCalls > 0) await new Promise(resolve => setTimeout(resolve, 750));
          geminiCalls++;
          const choice = await askGeminiToCompare(ai, model, pitch.imageBuffer, ranked);
          if (!pitch.rating && choice.tacticalRating) pitch.rating = choice.tacticalRating;
          if ((!pitch.position || pitch.position === 'Unknown') && choice.tacticalPosition) {
            pitch.position = choice.tacticalPosition;
            pitch.tacticalPosition = choice.tacticalPosition;
          }
          if (choice.accepted && !used.has(choice.candidate.id)) {
            candidate = choice.candidate;
            method = 'gemini';
            reviewStatus = 'matched';
            reason = choice.reason;
            geminiConfidence = choice.confidence;
          } else {
            reason = choice.reason || 'gemini_uncertain';
          }
        } catch (error) {
          console.warn(`Gemini fallback failed for ${pitch.id}: ${error.message}`);
          reason = 'gemini_unavailable';
          // A failed request disables fallback for the rest of this extraction.
          // This prevents repeated quota, authentication, and network failures.
          disableGemini = true;
        }
      }
    } else if (!candidate && ai && geminiCalls >= 8) {
      reason = 'gemini_request_limit';
    }

    if (candidate) used.add(candidate.id);
    const record = {
      id: pitch.id,
      name: candidate?.playerName || pitch.name || null,
      rating: pitch.rating,
      position: pitch.position,
      tacticalPosition: pitch.position,
      registeredPosition: candidate?.position || null,
      isStarter: pitch.isStarter,
      area: pitch.area,
      matchMethod: method,
      matchStatus: method === 'manual_review' ? 'manual_review' : 'matched',
      matchConfidence: method === 'gemini' ? geminiConfidence : candidate ? confidence : 0,
      reviewStatus,
      reviewReason: reason,
      inventoryCardId: candidate?.id || null,
      cardVersion: candidate?.cardVersion || null,
      region: pitch.region,
    };
    records.push(record);
    console.log(`Pitch ${pitch.id}: method=${method}, candidate=${record.inventoryCardId || 'none'}, local distance=${best?.distance ?? 'n/a'}; ${reason || 'no review reason'}`);
  }
  console.log(`Match summary: local=${records.filter(row => row.matchMethod === 'local').length}, gemini=${records.filter(row => row.matchMethod === 'gemini').length}, review=${records.filter(row => row.matchMethod === 'manual_review').length}`);
  return records;
}

function hammingDistanceSafe(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return Infinity;
  let distance = 0;
  for (let i = 0; i < a.length; i++) distance += ((parseInt(a[i], 16) ^ parseInt(b[i], 16)).toString(2).match(/1/g) || []).length;
  return distance;
}
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'squad-registration' });
});

async function handleExtractSquad(req, res) {
  console.log('📥 Incoming /api/extract-squad request received from frontend!');
  try {
    let payload;
    try { payload = normalizeScreenshotPayload(req.body || {}); }
    catch (error) { return res.status(400).json({ error: error.message, code: error.code }); }
    const { inventoryImages = [], pitchImage } = payload;
    if (!Array.isArray(inventoryImages) || inventoryImages.length < 1 || inventoryImages.length > 30) {
      return res.status(400).json({ error: 'Upload between 1 and 30 inventory screenshots before continuing' });
    }

    if (!pitchImage || typeof pitchImage !== 'string') return res.status(400).json({ error: 'Please upload one tactical squad screenshot.', code: 'MISSING_TACTICAL_IMAGE' });
    const allImages = [...inventoryImages, pitchImage];
    console.log(`Incoming base64 payload size: ${Buffer.byteLength(JSON.stringify(allImages))} bytes (${(Buffer.byteLength(JSON.stringify(allImages)) / 1024 / 1024).toFixed(2)} MB)`);
    let totalBytes = 0;
    const buffers = [];
    for (let i = 0; i < allImages.length; i++) {
      const value = allImages[i];
      if (typeof value !== 'string' || !/^data:image\/(jpeg|png|webp);base64,/i.test(value)) {
        return res.status(400).json({ error: `Screenshot ${i + 1} must be a JPEG, PNG, or WebP image.`, code: 'INVALID_IMAGE_TYPE' });
      }
      const buffer = base64ToBuffer(value);
      totalBytes += buffer.length;
      if (!buffer.length || buffer.length > 4 * 1024 * 1024) return res.status(413).json({ error: `Screenshot ${i + 1} exceeds the 4 MB limit.`, code: 'IMAGE_TOO_LARGE' });
      try {
        const metadata = await sharp(buffer, { limitInputPixels: 40_000_000 }).metadata();
        if (!metadata.width || !metadata.height || !['jpeg', 'png', 'webp'].includes(metadata.format) || metadata.width < 160 || metadata.height < 160 || metadata.width > 8000 || metadata.height > 8000) {
          return res.status(400).json({ error: `Screenshot ${i + 1} has unsupported dimensions or format.`, code: 'INVALID_IMAGE' });
        }
      } catch {
        return res.status(400).json({ error: `Screenshot ${i + 1} is not a readable image.`, code: 'INVALID_IMAGE' });
      }
      buffers.push(buffer);
    }
    if (totalBytes > 120 * 1024 * 1024) return res.status(413).json({ error: 'The screenshots exceed the total upload limit. Please use smaller images.', code: 'UPLOAD_TOO_LARGE' });

    // Validate each inventory image is a valid base64 string
    for (let i = 0; i < inventoryImages.length; i++) {
      if (!inventoryImages[i] || typeof inventoryImages[i] !== 'string' || Buffer.byteLength(inventoryImages[i], 'utf8') > 5.5 * 1024 * 1024) {
        return res.status(400).json({ error: `Invalid inventory image at index ${i}` });
      }
    }

    console.log('=== Starting Squad Extraction Pipeline ===');
    console.log(`Received ${inventoryImages.length} inventory images and 1 pitch image`);
    console.log('Gemini API Key loaded:', !!process.env.GEMINI_API_KEY);

    const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: { timeout: 60000, retryOptions: { attempts: 1 } },
    }) : null;
    const model = process.env.GEMINI_PRIMARY_MODEL || process.env.GEMINI_MODEL || 'gemini-3.8-flash';
    const fallbackModel = process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.5-flash';
    console.log(`Gemini models configured - Primary: ${model}, Fallback: ${fallbackModel}`);
    if (!model) return res.status(503).json({ error: 'Screenshot processing is not configured.', code: 'SERVICE_NOT_CONFIGURED' });
    if (!ai) {
      console.error('Screenshot extraction is unavailable: GEMINI_API_KEY is not configured.');
      return res.status(503).json({ error: 'Gemini API key is missing on the server environment variables.' });
    }

    // Require Gemini for registration extraction. Local OCR fallback produced slow,
    // unreliable name matches when Gemini could not be reached.
    let squad;
    let squadCollectiveStrength = null;
    let squadModelUsed = model;
    let pipelineCalls = 0;
    let inventoryCandidates = [];
    try {
      const pitchBuffer = await prepareGeminiImage(buffers[buffers.length - 1]);
      const inventoryBuffers = await Promise.all(buffers.slice(0, -1).map(image => prepareGeminiImage(image)));
      const extracted = await runSquadPipeline({ ai, primaryModel: model, fallbackModel, inventoryBuffers, pitchBuffer });
      squad = extracted.players;
      squadCollectiveStrength = extracted.collectiveStrength;
      squadModelUsed = extracted.modelUsed;
      pipelineCalls = extracted.calls;
      inventoryCandidates = extracted.candidates;
    } catch (error) {
      console.error(`Squad recognition failed (${error.pipelineCode || classifyGeminiError(error)})`);
      const retryable = ['transient', 'rate_limit', 'payload_too_large'].includes(classifyGeminiError(error));
      return res.status(retryable ? 503 : 422).json({ error: retryable ? 'We could not process the screenshots right now. Please try again shortly.' : 'We could not read the screenshots completely. Check the images and try again.', code: error.pipelineCode || classifyGeminiError(error) });
    }

    if (squad) {
      squad.sort((a, b) => (b.isStarter === true) - (a.isStarter === true) || (b.rating || 0) - (a.rating || 0));
      const matchedPlayers = squad.filter(player => player.matchStatus === 'matched').length;
      const starters = squad.filter(player => player.isStarter === true).length;
      const substitutes = squad.filter(player => player.isStarter === false).length;
      return res.json({
        success: true,
        squad,
        inventoryCandidates,
        players: squad.map(player => ({
          player_name: player.name || '',
          player_rating: player.rating,
          tactical_position: player.tacticalPosition,
          is_starter: player.isStarter,
          match_method: player.matchMethod,
        })),
        stats: {
          totalInventoryScreenshots: inventoryImages.length,
          totalPitchCards: squad.length,
          collectiveStrength: squadCollectiveStrength,
          totalMatched: matchedPlayers,
          totalManualReview: squad.length - matchedPlayers,
          matchedPlayers,
          manualReviewPlayers: squad.length - matchedPlayers,
          starters,
          substitutes,
          geminiMatches: matchedPlayers,
          localMatches: 0,
          manualReview: squad.length - matchedPlayers,
          mode: 'gemini_full_squad',
          model: squadModelUsed,
          processingStatus: 'complete',
          geminiCalls: pipelineCalls,
        },
      });
    }

  } catch (error) {
    console.error('Squad pipeline failed unexpectedly');
    res.status(500).json({ 
      success: false, 
      error: 'We could not process the screenshots. Please try again.',
      code: 'PROCESSING_FAILED',
    });
  }
}

app.post('/api/extract-squad', requireUser, handleExtractSquad);

// Preserve the original multipart API contract; Multer keeps upload data in memory only.
app.post('/api/squad/extract-vision', upload.fields([
  { name: 'inventoryScreenshots', maxCount: 30 },
  { name: 'pitchScreenshot', maxCount: 1 },
]), requireUser, (req, res) => {
  const files = req.files || {};
  const inventoryImages = (files.inventoryScreenshots || []).map(file => `data:${file.mimetype};base64,${file.buffer.toString('base64')}`);
  const pitchFile = files.pitchScreenshot?.[0];
  req.body = {
    inventoryImages,
    pitchImage: pitchFile ? `data:${pitchFile.mimetype};base64,${pitchFile.buffer.toString('base64')}` : null,
  };
  return handleExtractSquad(req, res);
});

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Server listening on port ${port}`);
  console.log(`🔧 Health check: http://localhost:${port}/api/health`);
  console.log(`🔑 Mode: Gemini squad extraction with temporary in-memory image processing`);
});

server.keepAliveTimeout = 120000;
server.headersTimeout = 120000;
