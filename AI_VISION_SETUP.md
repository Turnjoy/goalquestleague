# AI Vision Squad Registration Setup Guide

## Overview
This guide explains how to set up and use the Google Gemini 1.5 Flash AI Vision system for automated squad registration in GoalQuest League.

## Prerequisites

1. **Google AI Studio API Key**
   - Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
   - Create a new API key for Gemini 1.5 Flash
   - Copy the API key

2. **Supabase Database**
   - Run the complete migration script (`supabase-migrations/complete_migration.sql`)
   - This will update the `squad_rosters` table to support ratings 1-150

## Installation

1. **Install Dependencies** (already done):
   ```bash
   npm install @google/generative-ai express cors multer dotenv concurrently
   ```

2. **Environment Configuration**

   Create a `.env` file in the project root (copy from `.env.example`):
   ```env
   # Supabase Configuration
   VITE_SUPABASE_URL=your_supabase_project_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

   # Google Gemini AI Configuration
   GEMINI_API_KEY=your_gemini_api_key_here

   # Server Configuration
   PORT=3001
   ```

   **Important:** Replace `your_gemini_api_key_here` with your actual Google AI Studio API key.

## Running the Application

### Option 1: Run Both Servers Simultaneously (Recommended)
```bash
npm run dev:all
```
This will start:
- Vision API server on `http://localhost:3001`
- Vite dev server on `http://localhost:5173`

### Option 2: Run Separately
Terminal 1 (Vision API Server):
```bash
npm run server
```

Terminal 2 (Frontend):
```bash
npm run dev
```

## How It Works

### Two-Stage AI Vision Pipeline

**Stage 1: Inventory Screenshots (Name Pool)**
- Upload up to 30 screenshots of your player inventory
- AI extracts all visible player names
- Creates a comprehensive name pool for matching

**Stage 2: Pitch/Formation Screenshot (Active Squad)**
- Upload a single screenshot of your tactical pitch
- AI identifies the 23 active player cards (11 starters + 12 substitutes)
- Extracts boosted ratings (1-150) from each card
- Cross-matches names from the inventory pool
- Returns exactly 23 players with names and ratings

### Frontend Registration Wizard

**Step 1: Upload Inventory Screenshots**
- Select multiple inventory screenshots
- Max 30 images
- Supports PNG, JPG, JPEG

**Step 2: Upload Pitch Screenshot**
- Select the tactical pitch screenshot
- Max 10MB file size
- Shows 23 players with boosted ratings

**Step 3: Review & Submit**
- AI extracts 23 players automatically
- Editable table allows manual adjustments
- Add up to 2 reserve players (22-25 total)
- Validate and submit to lock squad

## API Endpoints

### POST `/api/squad/extract-vision`
Processes screenshots and extracts player data using Gemini 1.5 Flash.

**Request:**
- `inventoryScreenshots`: Array of inventory screenshot files (max 30)
- `pitchScreenshot`: Single pitch/formation screenshot file

**Response:**
```json
{
  "success": true,
  "players": [
    { "player_name": "Player Name", "player_rating": 99 },
    { "player_name": "Player Name", "player_rating": 98 },
    ...
  ],
  "message": "Extracted 23 players from squad pitch"
}
```

### GET `/api/health`
Health check endpoint to verify API status.

**Response:**
```json
{
  "status": "ok",
  "service": "GoalQuest League Vision API",
  "gemini_configured": true
}
```

## Database Changes

### Updated Constraint
The `squad_rosters` table now supports boosted ratings:
```sql
CHECK (player_rating >= 1 AND player_rating <= 150)
```

### Migration Files Updated
- `supabase-migrations/001_create_squad_system_tables.sql`
- `supabase-migrations/complete_migration.sql`

## Features

✅ **Automated Player Extraction**
- Uses Google Gemini 1.5 Flash vision AI
- Processes multiple screenshots simultaneously
- Extracts names and boosted ratings

✅ **Smart Name Matching**
- Cross-references inventory with pitch cards
- Context-aware matching based on position
- Falls back to visible names if no match

✅ **Boosted Rating Support**
- Supports ratings 1-150 (for boosted players)
- Validates rating ranges on input
- Displays total and average squad ratings

✅ **Editable Review**
- Full control over extracted data
- Manual adjustments before submission
- Add/remove players as needed

✅ **Reserve Player Support**
- Extracts 23 main players automatically
- Allows up to 2 additional reserve players
- Enforces 22-25 player minimum/maximum

## Troubleshooting

### Issue: "GEMINI_API_KEY not configured"
**Solution:** Ensure you've added your Google AI Studio API key to the `.env` file.

### Issue: Vision API returns error
**Solution:**
1. Check that the backend server is running on port 3001
2. Verify the API key is valid
3. Check browser console for network errors

### Issue: AI extracts fewer than 23 players
**Solution:** This is expected behavior - the AI may not detect all cards clearly. You can manually add reserve players to reach the minimum 22 players.

### Issue: CORS errors
**Solution:** The Vite proxy configuration handles CORS. Ensure both servers are running.

## Testing

1. **Test Health Endpoint**
   ```bash
   curl http://localhost:3001/api/health
   ```

2. **Test Vision API**
   - Navigate to `/squad-registration`
   - Upload inventory screenshots
   - Upload pitch screenshot
   - Click "Extract with AI"
   - Review extracted players

## Security Notes

- **API Key Security:** Never commit `.env` file to version control
- **File Size Limits:** Max 10MB per file to prevent abuse
- **Rate Limiting:** Consider implementing rate limiting for production
- **User Authentication:** Ensure squad registration requires authenticated users

## Production Deployment

For production deployment:

1. **Environment Variables:** Set environment variables in your hosting platform
2. **Server Hosting:** Deploy the Express server separately (e.g., Vercel, Railway, Render)
3. **CORS Configuration:** Update CORS origins to match your production domain
4. **Rate Limiting:** Add rate limiting middleware
5. **Error Monitoring:** Implement error tracking (e.g., Sentry)

## Cost Considerations

- Google Gemini 1.5 Flash pricing depends on usage
- Vision API calls consume tokens based on image size
- Monitor your Google AI Studio usage dashboard
- Consider caching extracted data to reduce API calls

## Support

For issues or questions:
1. Check the console logs for error messages
2. Verify environment variables are set correctly
3. Ensure all dependencies are installed
4. Review the Supabase migration was applied successfully
