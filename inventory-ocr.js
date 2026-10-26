import { createWorker } from 'tesseract.js';
import sharp from 'sharp';
import { detectInventoryRegions } from './crop-utils.js';

const POSITIONS = new Set(['GK', 'CF', 'CB', 'LB', 'RB', 'DMF', 'CMF', 'AMF', 'LMF', 'RMF', 'LWF', 'RWF', 'SS']);
const IGNORED = new Set(['level', 'players', 'capacity', 'selection', 'action', 'back', 'view', 'home', 'coins', 'gp']);

function cleanOcrPlayerName(words) {
  if (!words?.length) return null;
  const rawText = words.map(word => word.text).join(' ').trim();
  if (!rawText || /\b(level|players|capacity|selection|action|back|view|home|coins?)\b/i.test(rawText)) return null;
  const tokens = words
    .filter(word => Number(word.confidence || 0) >= 15)
    .map(word => String(word.text || '').replace(/^[^\p{L}]+|[^\p{L}'’\-]+$/gu, ''))
    .filter(token => token.length > 1 && /\p{L}/u.test(token) && !IGNORED.has(token.toLowerCase()) && !POSITIONS.has(token.toUpperCase()));
  if (!tokens.length || tokens.length > 4) return null;
  return tokens.join(' ');
}

/** OCR inventory locally. The image bytes are never passed to an AI provider. */
export async function extractInventoryNames(inventoryBuffers, { workerFactory = () => createWorker('eng', 1, { langPath: process.cwd(), gzip: false }) } = {}) {
  const worker = await workerFactory();
  const candidates = [];
  try {
    for (let imageIndex = 0; imageIndex < inventoryBuffers.length; imageIndex++) {
      const buffer = inventoryBuffers[imageIndex];
      const metadata = await sharp(buffer).metadata();
      const tiles = detectInventoryRegions(metadata.width, metadata.height);
      const result = await worker.recognize(buffer, {}, { blocks: true });
      const lines = [];
      for (const block of result.data?.blocks || []) {
        for (const paragraph of block.paragraphs || []) {
          for (const line of paragraph.lines || []) {
            const words = (line.words || []).filter(word => word.text && word.bbox);
            if (!words.length) continue;
            lines.push({
              words,
              bbox: {
                x0: Math.min(...words.map(word => word.bbox.x0)),
                x1: Math.max(...words.map(word => word.bbox.x1)),
                y0: Math.min(...words.map(word => word.bbox.y0)),
                y1: Math.max(...words.map(word => word.bbox.y1)),
              },
            });
          }
        }
      }

      for (let tileIndex = 0; tileIndex < tiles.length; tileIndex++) {
        const tile = tiles[tileIndex].tile;
        // The bottom inventory row is commonly obscured by the fixed Back/Action
        // toolbar. Do not turn its clipped text into roster candidates.
        if (tile.top + tile.height > metadata.height * 0.82) continue;
        const nameStart = tile.left + tile.width * 0.22;
        // Tesseract can combine text from both cards into one line. Split each
        // line by individual word centers so the left card doesn't swallow the right.
        const matchingLines = lines.map(line => {
          const words = line.words.filter(word => {
            const centerX = (word.bbox.x0 + word.bbox.x1) / 2;
            const centerY = (word.bbox.y0 + word.bbox.y1) / 2;
            return centerX >= nameStart && centerX <= tile.left + tile.width
              && centerY >= tile.top && centerY <= tile.top + tile.height;
          });
          return words.length ? { ...line, words, bbox: {
            x0: Math.min(...words.map(word => word.bbox.x0)),
            x1: Math.max(...words.map(word => word.bbox.x1)),
            y0: Math.min(...words.map(word => word.bbox.y0)),
            y1: Math.max(...words.map(word => word.bbox.y1)),
          } } : null;
        }).filter(Boolean).sort((a, b) => a.bbox.y0 - b.bbox.y0);
        for (const line of matchingLines) {
          const name = cleanOcrPlayerName(line.words);
          if (!name) continue;
          candidates.push({
            id: `inv-${imageIndex + 1}-${tileIndex + 1}`,
            name,
            screenshot: imageIndex + 1,
            confidence: Math.round(line.words.reduce((sum, word) => sum + Number(word.confidence || 0), 0) / line.words.length),
          });
          break;
        }
      }
      console.log(`Inventory screenshot ${imageIndex + 1}: OCR candidate names found: ${candidates.filter(candidate => candidate.screenshot === imageIndex + 1).length}`);
    }
  } finally {
    await worker.terminate();
  }
  return candidates;
}
