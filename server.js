import express from 'express';
import cors from 'cors';
import multer from 'multer';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per file
  },
});

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Helper function to convert file to base64
const fileToBase64 = (buffer, mimeType) => {
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
};

// Vision API endpoint
app.post('/api/squad/extract-vision', upload.fields([
  { name: 'inventoryScreenshots', maxCount: 30 },
  { name: 'pitchScreenshot', maxCount: 1 }
]), async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
    }

    const inventoryScreenshots = req.files['inventoryScreenshots'] || [];
    const pitchScreenshot = req.files['pitchScreenshot']?.[0];

    if (!pitchScreenshot) {
      return res.status(400).json({ error: 'Pitch screenshot is required' });
    }

    if (inventoryScreenshots.length === 0) {
      return res.status(400).json({ error: 'At least one inventory screenshot is required' });
    }

    console.log(`Processing ${inventoryScreenshots.length} inventory screenshots + 1 pitch screenshot...`);

    // Prepare images for Gemini
    const inventoryImages = inventoryScreenshots.map(file => ({
      inlineData: {
        data: fileToBase64(file.buffer, file.mimetype),
        mimeType: file.mimetype,
      },
    }));

    const pitchImage = {
      inlineData: {
        data: fileToBase64(pitchScreenshot.buffer, pitchScreenshot.mimetype),
        mimeType: pitchScreenshot.mimetype,
      },
    };

    // Initialize Gemini model
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    // Create the prompt
    const prompt = `
You are an expert at extracting player data from eFootball game screenshots.

TASK: Extract exactly 23 active players from the tactical pitch/game plan screenshot.

INPUT:
1. Multiple inventory screenshots showing a pool of player names
2. One tactical pitch screenshot showing 23 player cards with boosted ratings (1-150)

INSTRUCTIONS:
1. First, extract ALL visible player names from the inventory screenshots. This is your name pool.
2. Then, examine the tactical pitch screenshot and identify the 23 player cards arranged in the formation.
3. For each player card on the pitch, extract:
   - The player name (match it from your name pool based on position/context)
   - The boosted rating displayed on the card (value between 1 and 150)
4. IGNORE all positional tags (CMF, DMF, SS, LW, RW, CF, etc.) - extract ONLY the player name and rating
5. Return exactly 23 players in the order they appear on the pitch (top-left to bottom-right, reading order)

OUTPUT FORMAT:
Return ONLY a valid JSON array with this exact structure:
[
  {"player_name": "Player Name", "player_rating": 99},
  {"player_name": "Player Name", "player_rating": 98},
  ...
]

IMPORTANT:
- Extract exactly 23 players (11 starters + 12 substitutes)
- Ensure ratings are between 1 and 150 (boosted ratings)
- Return ONLY the JSON array, no additional text
- Match player names from inventory to pitch cards based on context
- If you cannot find a match, use the name visible on the pitch card
`;

    // Generate content with vision
    const result = await model.generateContent([
      ...inventoryImages,
      pitchImage,
      prompt,
    ]);

    const responseText = result.response.text();
    console.log('Gemini response:', responseText);

    // Parse JSON response
    let players = [];
    try {
      // Try to extract JSON from the response
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        players = JSON.parse(jsonMatch[0]);
      } else {
        // Fallback: try parsing the entire response
        players = JSON.parse(responseText);
      }

      // Validate the result
      if (!Array.isArray(players)) {
        throw new Error('Response is not an array');
      }

      if (players.length !== 23) {
        console.warn(`Expected 23 players, got ${players.length}. Proceeding anyway.`);
      }

      // Validate each player object
      players = players.filter(p => {
        if (!p.player_name || typeof p.player_name !== 'string') return false;
        if (!p.player_rating || typeof p.player_rating !== 'number') return false;
        if (p.player_rating < 1 || p.player_rating > 150) return false;
        return true;
      });

      console.log(`Successfully extracted ${players.length} valid players`);

      res.json({
        success: true,
        players: players,
        message: `Extracted ${players.length} players from squad pitch`
      });

    } catch (parseError) {
      console.error('Failed to parse Gemini response:', parseError);
      res.status(500).json({
        error: 'Failed to parse AI response',
        details: parseError.message,
        rawResponse: responseText
      });
    }

  } catch (error) {
    console.error('Vision API error:', error);
    res.status(500).json({
      error: 'Failed to process images',
      details: error.message
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'GoalQuest League Vision API',
    gemini_configured: !!process.env.GEMINI_API_KEY
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Vision API server running on http://localhost:${PORT}`);
  console.log(`🔧 Health check: http://localhost:${PORT}/api/health`);
});
