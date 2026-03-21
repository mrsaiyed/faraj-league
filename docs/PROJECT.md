## Faraj League – Project Overview

This repository contains the code for the Faraj League public site (`farajleague.org`). It is a **static, single-page web app** that runs entirely in the browser and uses **Google Sheets as its data source** (a “Sheets-as-backend” architecture). There is **no traditional server or database** in this repo.

---

## Tech Stack

- **Frontend**: Vanilla HTML, CSS, and JavaScript in `index.html`
- **Backend**: None in this repo (no Node/Express, Django, etc.)
- **Data source**: Google Sheets published as CSV
- **Hosting**: Any static host (e.g. GitHub Pages, Netlify, Vercel)
- **Fonts & assets**: Google Fonts + local logo images

---

## Repository Structure

- `index.html`  
  - Contains:
    - All HTML for the single-page layout (Home, Standings, Teams, Stats, Awards, Draft, Media, About, Sponsors)
    - Embedded CSS styling for the full site
    - Embedded JavaScript for data loading, parsing, and UI rendering
- `faraj-logo.png` / `faraj-logo.jpeg`  
  - Brand/logo assets used on the homepage
- `README.md`  
  - Minimal, currently just the project name
- `PROJECT.md` (this file)  
  - High-level documentation and architecture overview

---

## Data & “Backend” Architecture

### Google Sheets as Data Source

All dynamic data (rosters, scores, awards, stats) lives in a Google Sheet that is **published as CSV**. The app uses a single sheet ID plus per-tab `gid` values:

- `SHEET_ID`: the public Google Sheet identifier
- `BASE`: `https://docs.google.com/spreadsheets/d/e/${SHEET_ID}/pub?output=csv`
- `TABS`:
  - `rosters`: team and player data
  - `scores`: weekly game results
  - `awards`: weekly and season awards
  - `stats`: per-player stats (GP, total points, etc.)

On page load, the frontend issues `fetch` requests directly from the browser to these URLs, parses the CSV responses, and stores them in an in-memory object.

### In-memory Data Model

The core data structure is `DB`:

- `DB.teams`: array of team objects (`{ id, name, conf, captain, players[] }`)
- `DB.scores`: array of game objects (`{ week, game, t1, s1, t2, s2 }`)
- `DB.awards`: array of weekly award objects (`{ week, akhlaq, motm1, motm2, motm3, champ, mvp, scoring }`)
- `DB.stats`: array of player stats (`{ name, team, gp, total }`)

There is also a `DEFAULT_TEAMS` fallback used when the sheet is empty or fails to load, so the UI still renders with placeholder teams.

---

## Application Flow

### Page Load

1. Browser loads `index.html` and static assets (logo, fonts).
2. The script at the bottom of `index.html` runs `loadAll()`.
3. `loadAll()`:
   - Fetches all four CSV tabs in parallel (`rosters`, `scores`, `awards`, `stats`).
   - Parses each CSV into arrays of rows.
   - Transforms the rows into typed objects via `parseRosters`, `parseScores`, `parseAwards`, `parseStats`.
   - Populates the global `DB` object.
   - Calls `renderAll()` to update the UI.

### Rendering

`renderAll()` orchestrates the main render passes:

- `renderHome()` – hero, quick stats, mini standings, recent matchups, and recent awards
- `renderStandings()` – full Mecca/Medina conference standings and weekly scores section
- `renderTeams()` – team cards by conference and roster drawer
- `renderStats()` – player stats table (sorted by total points)
- `renderAwards(week)` – weekly award cards and season awards summary
- `renderScores(week)` – scores by week or for all weeks
- `renderMedia(week)` – media placeholders and Instagram call-to-action
- `renderAbout()` – league story and conference breakdown

The nav bar buttons call `showPage(id)` to toggle which `div.page` is visible. There is no routing or backend navigation; everything is client-side.

---

## Configuration

Key configuration values live at the bottom of `index.html`:

- **Sponsor configuration**:
  - `SP1`, `SP1_LOGO`: title sponsor name and logo
  - `SP2A`, `SP2B`: conference sponsor names
  - `SP3A`, `SP3B`, `SP3C`: Man of the Match sponsors by game
  - Helper functions (`confLabel`, `motmLabel`, `akhlaqLabel`, `statsTitle`) compute display text
- **Sheet configuration**:
  - `SHEET_ID`: Google Sheet ID
  - `TABS`: per-tab CSV URLs with `gid`
  - `TOTAL_WEEKS`, `CURRENT_WEEK`: season configuration

Changing these values lets you:

- Swap out the data source (new Google Sheet) without changing rendering logic.
- Update sponsor branding and labels in one place.

---

## Request / Data Flow Summary

1. **HTTP**: User hits `farajleague.org` → static host serves `index.html` and assets.
2. **Client data fetch**: JavaScript calls `fetchCSV(TABS.rosters | scores | awards | stats)` → Google publishes CSV.
3. **Parsing & state**: CSV is parsed and stored into `DB` (`teams`, `scores`, `awards`, `stats`).
4. **Rendering**: UI functions read from `DB` to:
   - Compute standings, records, and weeks played.
   - Render tables, cards, and dropdowns per page.
5. **Interaction**: All user interactions (tab switches, week dropdowns, team roster toggles) operate purely in the browser, with no additional backend requests.

---

## Future Improvements / Next Steps

If you want to evolve this into a more “traditional” engineered stack, common next steps include:

- Extracting JS into separate modules (data layer vs UI layer)
- Adding TypeScript for typed `DB` structures and safer refactors
- Introducing a real backend + database (e.g. Node/Express or Next.js API routes with Postgres) and gradually moving data off Google Sheets
- Adding basic tests around standings/awards/stat calculations

This file is meant as an onboarding guide and architectural snapshot of the current state.

