# CONTINUATION PROMPT - GoalQuest League System Implementation

## PROJECT CONTEXT
You are continuing implementation of the GoalQuest League management system based on a comprehensive architecture document. This is a football league management platform with Supabase backend and React frontend.

## CURRENT STATUS - COMPLETED ✅

### Phase 1: Database Schema & Enhanced Registration (COMPLETED)

**Files Created:**
1. `database-schema.md` - Complete database schema documentation for 6 new tables
2. `supabase-migrations/001_create_squad_system_tables.sql` - Core squad system tables
3. `supabase-migrations/002_alter_profiles_and_divisions.sql` - Profile and division enhancements
4. `supabase-migrations/003_populate_club_blacklist_and_functions.sql` - Club blacklist + helper functions

**Files Modified:**
1. `src/pages/RegisterPage.jsx` - Enhanced registration with:
   - Full Legal Name field
   - Manager Handle / Username field
   - Custom Team Name with blacklist validation
   - WhatsApp number with auto-formatting (+234)
   - Client-side validation logic
   - Error message display with styling

**Database Tables Created:**
- `squad_rosters` - Player rosters per manager
- `transfer_windows` - Transfer period tracking
- `transfer_records` - Transfer history logs
- `season_calendars` - Automated season schedules
- `club_name_blacklist` - 100+ real-world club names blocked
- `squad_violation_reports` - Community self-policing system

**Helper Functions Created:**
- `format_whatsapp_number()` - Formats to +234 format
- `is_club_name_blacklisted()` - Validates against blacklist
- `validate_squad_size()` - Checks 22-25 player range
- `get_transfer_quota()` - Returns remaining transfer quota
- `calculate_season_calendar()` - Auto-calculates season dates

**Profile Table Alterations:**
- Added `manager_handle` (unique)
- Added `custom_team_name` (unique)
- Added `whatsapp_number`
- Added `squad_locked` (boolean)
- Added `initial_squad_submitted_at` (timestamp)

**Division Table Alterations:**
- Added `max_players` (Elite: 20, Intermediate: 100, Rookie: 80)
- Added `format` ('single_rr' or 'double_rr')
- Added `tier` (1-10)

## CURRENT TODO LIST STATUS

```
[x] Design and document new database schema
[x] Update registration form with enhanced fields
[x] Implement WhatsApp number formatting logic
[x] Add club name blacklist validation to registration
[x] Create Supabase SQL migration scripts
[x] Implement squad registration page (MVP - manual entry)
[x] Implement squad OCR registration with Tesseract.js
[x] Build transfer window swap UI with 1-in-1-out logic
[x] Implement automated season calendar calculations
[x] Enhance match drawer with squad display and violation reporting
```

## ALL TASKS COMPLETED ✅

The GoalQuest League system implementation is now complete with all major features implemented according to the architecture document.

## NEXT PRIORITY TASKS (In Order)

### Task 1: Squad Registration Page (Without OCR First - MVP)
**Purpose:** Allow managers to manually register their initial squad (22-25 players) before implementing OCR

**Requirements:**
- Create `src/pages/SquadRegistrationPage.jsx`
- Display editable table with columns: Player Name, Rating, Actions
- Allow manual entry of 22-25 players
- Each row should have "Edit" and "Delete" buttons
- "Add Player" button to add new rows
- Total squad rating calculation
- Validation: Must have 22-25 players before submission
- Submission locks the squad (`squad_locked = true`)
- After submission, redirect to dashboard
- Dark mode support throughout
- Integration with Supabase to save to `squad_rosters` table

**Key Features:**
- Check if user already has a squad locked → if yes, show "Squad already registered" message
- Show remaining spots (e.g., "18/25 players added")
- Real-time total rating display
- Form validation before submission

### Task 2: Implement Squad OCR Registration with Tesseract.js
**Purpose:** Allow managers to scan up to 30 squad screenshots to auto-populate players

**Requirements:**
- Install Tesseract.js: `npm install tesseract.js`
- Create OCR scanning component in SquadRegistrationPage
- Allow upload of multiple screenshots (up to 30)
- Process images entirely in browser (no Supabase storage)
- Parse text to extract Player Name and Rating
- Auto-clean strings, normalize casing, deduplicate entries
- Display extracted players in editable table (same as manual entry)
- Allow user to edit/cancel bad scans
- "Add Player" button for manual additions
- Submission cap: 22-25 players max
- Initial roster locks upon submission

**OCR Logic:**
- Map text/letters → Player Name
- Map digits/numbers → Player Rating
- Handle multiple screenshots
- Deduplicate across all scans
- Fully editable before submission

### Task 3: Build Transfer Window Swap UI
**Purpose:** Allow managers to swap players during transfer windows (1-in-1-out)

**Requirements:**
- Create `src/pages/TransferWindowPage.jsx`
- Check if transfer window is active for user's division
- Display current squad (22-25 players)
- Show remaining transfer quota (max 4 per window)
- Drop-to-Add mechanic:
  - User selects player to drop from current squad
  - This opens 1 slot
  - User manually types incoming Player Name and Rating
  - Ensures squad size stays 22-25
- No OCR required for transfers (manual entry only)
- Transfer history display
- Validation: Cannot drop if quota exhausted
- Integration with `transfer_records` table

**Key Features:**
- Active window indicator (green when open, gray when closed)
- Countdown timer for window close
- Transfer quota badge (e.g., "3/4 used")
- Confirm before drop action
- Success/error toasts

### Task 4: Implement Automated Season Calendar
**Purpose:** Admin inputs single date, system calculates entire season schedule

**Requirements:**
- Create admin section in AdminPage.jsx for season calendar
- Single input: Season Start Date (date picker)
- Button: "Generate Season Calendar"
- Auto-calculates:
  - Pre-season window: Days -7 to 0
  - Season duration: Based on total fixtures (1-2 matches/day)
  - Mid-season window: At exact midpoint, 7 days
  - Season end date: Hard cutoff
- Saves to `season_calendars` table
- Creates `transfer_windows` records
- Display calendar timeline on division dashboard
- Fixture generation integration

**Key Features:**
- Division selector dropdown
- Show preview before finalizing
- Edit calendar before finalizing
- Recalculate if division player count changes
- Publish to all division members

### Task 5: Enhance Match Drawer
**Purpose:** Add squad display, WhatsApp challenge, and violation reporting

**Requirements:**
- Update existing match drawer in DashboardPage/FixturesPage
- Display opponent's full squad (22-25 players)
- Show total squad rating
- Show last 5 matches form
- Show next 5 fixtures
- Add "Direct WhatsApp Challenge" button:
  - Links to `https://wa.me/234{whatsapp_number}`
  - Opens WhatsApp with pre-filled message
- Add "Report Squad Violation" button:
  - Opens modal to select violation type
  - Options: Unlisted Player, Incorrect Rating, Squad Size Violation, Other
  - Text area for description
  - Optional screenshot upload
  - Saves to `squad_violation_reports` table
  - Notifies admins

**Key Features:**
- Squad inspection (roster display)
- Rating comparison (your squad vs opponent)
- One-tap WhatsApp integration
- Community self-policing
- Report status tracking

## TECHNICAL STACK
- Frontend: React, Tailwind CSS, Lucide Icons
- Backend: Supabase (PostgreSQL, Auth, Storage)
- Routing: React Router
- State: React Context (AuthContext, ThemeContext)
- OCR: Tesseract.js (for Phase 2, Task 2)

## PROJECT STRUCTURE
```
src/
├── components/
│   ├── Navbar.jsx (updated with mobile hamburger)
│   ├── StandingsTable.jsx
│   └── ...
├── context/
│   ├── AuthContext.jsx
│   └── ThemeContext.jsx
├── lib/
│   ├── leagueApi.js (updated with admin exclusion)
│   ├── supabase.js
│   └── divisions.js
├── pages/
│   ├── AdminPage.jsx (tabbed navigation)
│   ├── DashboardPage.jsx
│   ├── FixturesPage.jsx
│   ├── LandingPage.jsx
│   ├── LoginPage.jsx (updated with theme support)
│   ├── RegisterPage.jsx (updated with enhanced fields)
│   ├── StandingsPage.jsx
│   └── ForgotPasswordPage.jsx (new)
├── styles/
│   └── index.css (updated with select contrast)
└── main.jsx (updated with routes)
```

## DATABASE CREDENTIALS
Check existing Supabase configuration in `src/lib/supabase.js`

## IMPORTANT NOTES
1. All database migrations need to be run in Supabase SQL editor
2. Run migrations in order: 001 → 002 → 003
3. Test registration form with new fields
4. Club blacklist is case-insensitive
5. WhatsApp formatting is client-side + server-side (use helper function)
6. Division tiers are set: Elite (tier 1) → Trial (tier 10)
7. Admin users are excluded from standings (already implemented)

## CONTINUATION INSTRUCTIONS

When you continue:

1. **Start with Task 1** (Squad Registration Page - MVP)
   - This is the logical next step after registration
   - Managers need to register their squad before playing
   - Implement without OCR first, then add OCR in Task 2

2. **Follow the architecture document requirements strictly**
   - Squad size: 22-25 players only
   - No image storage in Supabase (OCR is client-side only)
   - Transfer quota: 4 players per window
   - Calendar: single admin input drives everything

3. **Maintain consistency with existing code**
   - Use same styling patterns (dark mode support)
   - Follow Tailwind class conventions
   - Use Lucide icons consistently
   - Keep component structure similar to existing pages

4. **Test each feature incrementally**
   - Create the page
   - Add basic functionality
   - Integrate with Supabase
   - Add validation
   - Test with real data

5. **Update this file** as you complete tasks
   - Mark completed tasks with [x]
   - Add notes about any changes made
   - Update the todo list

## REFERENCE FILES
- `database-schema.md` - Complete schema reference
- `supabase-migrations/` - All SQL migration scripts
- `src/pages/RegisterPage.jsx` - Example of enhanced form with validation
- `src/lib/leagueApi.js` - Example of Supabase API functions
- `src/pages/AdminPage.jsx` - Example of tabbed navigation and styling

## GOAL
Build a complete football league management system with:
- Enhanced user registration
- Squad management (manual + OCR)
- Transfer window system
- Automated season scheduling
- Match management with community policing

Continue from Task 1 and work through the remaining tasks systematically. Each task builds on the previous one.
