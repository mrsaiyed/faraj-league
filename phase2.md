# Phase 2 — Public site uses API

Execute these steps in order. **Agent** = tasks the Cursor agent does. **You** = manual steps you perform.

**Prerequisite:** Phase 1 complete (Supabase has data; `lib/api.js` and `docs/API.md` exist). Data in Supabase may come from the seed script or the one-time import script (when available). If migrating from Google Sheets, run the import script once before or during Phase 2.

---

## Principles

- **Static deployment** — No build step, no bundler. Single HTML + scripts. Use `fetch()` or load Supabase from CDN.
- **Transform at boundary** — Map Supabase response → DB shape once; existing render functions stay unchanged.
- **Single config source** — One place for API URL and anon key; easy to switch dev vs prod.
- **Progressive enhancement** — API failure shows clear error; optionally keep `DEFAULT_TEAMS` fallback.
- **Phase 3 readiness** — Same tables and shapes that the admin will edit later.
- **No secrets in client** — Only use `SUPABASE_ANON_KEY` in the frontend. Never use `SUPABASE_SERVICE_ROLE_KEY` in client code.

---

## Alignment with all_phases & business goal

- **all_phases.md Phase 2:** Data layer (API config, fetchSeasonData, fetchSeasons), season dropdown, fallback, config for dev/prod — all covered. *API_BASE* in all_phases = *SUPABASE_URL* here; Phase 2 uses SUPABASE_URL + SUPABASE_ANON_KEY for Supabase alignment.
- **Business goal:** farajleague.org remains a static site (project.md). Phase 2 migrates data source from Sheets to Supabase with no build step; deploy flow (dev repo → fork → farajleague.org) unchanged.
- **Phase 3 readiness:** Same DB shape and tables that admin will edit; sponsors wired so Phase 3 admin changes appear on the public site.

---

## Step 1 — Agent: Add API config and data fetcher

**Who:** Agent

**What:**

1. **Add API config block** (replace or augment existing SHEET config in `index.html`):
   - `SUPABASE_URL` — e.g. `https://<project-ref>.supabase.co` (no trailing slash). *All_phases calls this "API_BASE"; Phase 2 uses SUPABASE_URL for alignment with Phase 1.*
   - `SUPABASE_ANON_KEY` — public anon key from Supabase Dashboard (safe in client code; RLS restricts access)
   - Place near top of script; use single constants so you can switch for dev vs prod later.

2. **Add `fetchSeasons()` function:**
   - Calls `GET /rest/v1/seasons` with headers `apikey` and `Authorization: Bearer <anon_key>`
   - Returns array of `{ id, slug, label, is_current, created_at }`
   - **Prefer** loading `@supabase/supabase-js` from CDN and using `getSeasons()` from `lib/api.js`; fallback to raw `fetch()` if needed for static setup.

3. **Add `fetchSeasonData(slug)` function:**
   - Fetches full season data for given slug (e.g. `spring2026`)
   - **Prefer** using `getSeasonData()` from `lib/api.js`; fallback to raw REST calls if needed.
   - **Transforms** response into the shape expected by existing render functions:
     - **teams:** `{ id, name, conf, captain, players: string[] }` — map `conference` → `conf`; build `players` from rosters + players tables
     - **scores:** `{ week, game, t1, s1, t2, s2 }` — map games; `t1`/`t2` = team names (lookup by `home_team_id`/`away_team_id`); `game` = `game_index`; `s1`/`s2` = `home_score`/`away_score` (string or number)
     - **awards:** `{ week, akhlaq, motm1, motm2, motm3, champ, mvp, scoring }` — direct mapping from `awards` table
     - **stats:** `{ name, team, gp, total }` — from `players` + `rosters` + `player_stat_values` + `stat_definitions`; for "points" stat aggregate value; team name from roster; gp can be 0 or derive from games if needed
     - **sponsors:** map `sponsors` table to `DB.sponsors` or to UI constants (SP1, SP1_LOGO, SP2A, SP2B). Map `type=title` → SP1/SP1_LOGO; `type=conference_mecca` → SP2A; `type=conference_medina` → SP2B. If sponsors are null/empty, keep existing placeholder behavior.

4. **Handle IDs:** `DB.teams` currently uses numeric `id` (1–6). Supabase uses UUIDs. Ensure `id` in transformed teams is usable for `calcStandings()`, `goToTeam()`, `toggleRoster()` — use Supabase `id` (string) or a numeric index; update any code that assumes numeric `id` if necessary.

**How:** In Agent mode:

> Implement Phase 2 Step 1 from phase2.md: Add SUPABASE_URL and SUPABASE_ANON_KEY config. Add fetchSeasons() and fetchSeasonData(slug) that return data in DB shape (teams, scores, awards, stats, sponsors). Prefer lib/api.js with Supabase from CDN; fallback to raw fetch(). Transform Supabase response to match DB.teams, DB.scores, DB.awards, DB.stats, DB.sponsors. See phase2.md Data shape reference.

---

## Step 2 — Agent: Replace loadAll with API-based load

**Who:** Agent

**What:**

1. **Rewrite `loadAll()`:**
   - Call `fetchSeasons()` first
   - Determine default season: use first with `is_current === true`, else first in list
   - Call `fetchSeasonData(defaultSlug)` with that slug
   - Assign result to `DB.teams`, `DB.scores`, `DB.awards`, `DB.stats` (and `DB.sponsors` if used)
   - On success: call `renderAll()`
   - On error: log to console, optionally keep `DEFAULT_TEAMS` and empty scores/awards/stats as fallback; show user-visible error (e.g. "Unable to load data. Please refresh or try again.")
   - Always call `renderAll()` so UI updates (either with data or fallback/error state)

2. **Remove or comment out** (do not delete—keep for reference):
   - `SHEET_ID`, `BASE`, `TABS`
   - `fetchCSV()`, `parseCSV()`
   - `parseRosters()`, `parseScores()`, `parseAwards()`, `parseStats()`
   - The CSV fetch logic inside the old `loadAll()`

3. **`TOTAL_WEEKS` and `CURRENT_WEEK`:**
   - Derive `TOTAL_WEEKS` from max `week` in games, or keep as config constant (e.g. 8)
   - Derive `CURRENT_WEEK` from games (e.g. latest week with at least one played game) or keep as constant (e.g. 1)

**How:** In Agent mode:

> Implement Phase 2 Step 2 from phase2.md: Replace loadAll to use fetchSeasons and fetchSeasonData. Remove CSV fetch and parsers (parseRosters, parseScores, etc.). Add error handling and optional DEFAULT_TEAMS fallback. Derive or configure TOTAL_WEEKS and CURRENT_WEEK.

---

## Step 3 — Agent: Wire season dropdown

**Who:** Agent

**What:**

1. **Populate season dropdown** (`nav-season-select`):
   - After `fetchSeasons()` returns: clear existing options, add one `<option value="{slug}">{label} · Current</option>` per season (append " · Current" only when `is_current === true`)
   - Set `selected` on the default season (is_current or first)
   - Call this during initial load (inside `loadAll` or after first successful fetch)

2. **Update `changeSeason(val)`:**
   - When user selects a different slug: call `fetchSeasonData(val)`
   - On success: update `DB` with new data, call `renderAll()`
   - On error: show error message, optionally keep current data
   - Toggle `historic-banner`: show when selected season has `champ` or is not current; hide when it’s the current season with no champ yet

3. **Dynamic labels:**
   - Replace hardcoded "Spring 2026" in section headers (e.g. `home-standings-sub`, standings page) with the selected season’s `label` from the fetched season object
   - Store current season’s `label` in a variable (e.g. `currentSeasonLabel`) and use it when rendering

**How:** In Agent mode:

> Implement Phase 2 Step 3 from phase2.md: Populate nav-season-select from fetchSeasons. Update changeSeason to fetch new season data and re-render. Show/hide historic-banner based on season. Use season label in section headers.

---

## Step 4 — Agent: Fallback and error handling

**Who:** Agent

**What:**

1. **API failure handling:**
   - If `fetchSeasons()` fails: show message (e.g. "Could not load seasons") and optionally keep `DEFAULT_TEAMS` + empty scores/awards/stats
   - If `fetchSeasonData(slug)` fails: show message (e.g. "Could not load season data") and keep previous data or `DEFAULT_TEAMS`
   - Display error in a visible place: e.g. replace "Loading..." with error text, or add a small banner above main content

2. **Loading state:**
   - While fetching: show "Loading..." in home matchups, standings, etc. (or retain existing loading UI)
   - When data arrives: clear loading; when error: replace with error message

3. **No empty-state regression:**
   - Ensure "No results yet" / "No stats yet" still appear when data is empty (e.g. new season with no games played)

**How:** In Agent mode:

> Implement Phase 2 Step 4 from phase2.md: Add clear error messages when API fails. Optional DEFAULT_TEAMS fallback. Improve loading and error states.

---

## Step 5 — You: Set API config for your environment

**Who:** You

**What:**

1. Open `index.html` (or the config file the agent created)
2. Set `SUPABASE_URL` to your project URL, e.g. `https://ruwihsxedobbxqavrjhl.supabase.co`
3. Set `SUPABASE_ANON_KEY` to your anon key from Supabase Dashboard → Settings → API
4. If using a separate config file or build step, follow the agent’s instructions

**Verify:** Values match your `.env` or Dashboard. Use the **anon** (public) key only—never `SUPABASE_SERVICE_ROLE_KEY` in client code.

---

## Step 6 — You: Test locally

**Who:** You

**What:**

1. Open the site:
   - Double-click `index.html`, or
   - Run `npx serve .` and open `http://localhost:3000` (or similar)
2. Open DevTools (F12) → **Network** tab
3. Reload the page
4. Confirm:
   - Requests to `*.supabase.co/rest/v1/seasons` and `.../teams`, `.../games`, etc. return 200
   - No CORS errors in Console
5. Confirm UI:
   - Home: standings, matchups, awards render with data
   - Standings: Mecca/Medina tables and scores by week
   - Teams: team cards; clicking shows roster
   - Stats: player stats table (or "No stats yet" if empty)
   - Awards: weekly and season awards
   - Sponsors: sponsor cards render (from DB or placeholder)
   - Season dropdown shows "Spring 2026 · Current" (and any other seasons)
6. If multiple seasons exist: change season and confirm data updates

**Verify:** Data matches Supabase Table Editor.

---

## Step 7 — You: Test on GitHub Pages (if applicable)

**Who:** You

**What:**

1. Push changes to your dev repo
2. If you use GitHub Pages: wait for deploy, then open the preview URL
3. Confirm:
   - Site loads data from Supabase
   - No CORS errors
   - Season dropdown and all pages work as locally
4. If CORS errors appear: share the exact error with the agent; Supabase REST API usually allows browser origins by default

**Verify:** Production URL behaves like local.

---

## Step 8 — You: Verify Phase 2 complete

**Who:** You

**What:** Confirm:

1. Public site loads all data from Supabase (no Google Sheets)
2. Season dropdown is populated; default is current season
3. Changing season fetches and displays new data
4. No CORS or network errors in Console
5. Error and loading states work when API fails or is slow
6. All pages (Home, Standings, Teams, Stats, Awards, Scores, Sponsors) render correctly

---

## Summary

| Order | Who   | Step                                                              |
|-------|-------|-------------------------------------------------------------------|
| 1     | Agent | Add API config + fetchSeasons + fetchSeasonData + DB-shape transform (incl. sponsors) |
| 2     | Agent | Replace loadAll with API load; remove CSV                         |
| 3     | Agent | Wire season dropdown; update changeSeason                         |
| 4     | Agent | Fallback and error handling                                       |
| 5     | You   | Set API config (URL, anon key)                                    |
| 6     | You   | Test locally                                                      |
| 7     | You   | Test on GitHub Pages (if used)                                    |
| 8     | You   | Verify Phase 2 complete                                           |

---

## Data shape reference (for Agent)

**Current `DB` (expected by render functions):**

| Key      | Shape                                                                 |
|----------|-----------------------------------------------------------------------|
| teams    | `[{ id, name, conf, captain, players: string[] }]`                    |
| scores   | `[{ week, game, t1, s1, t2, s2 }]` — t1/t2 = team names; s1/s2 = scores |
| awards   | `[{ week, akhlaq, motm1, motm2, motm3, champ, mvp, scoring }]`        |
| stats    | `[{ name, team, gp, total }]`                                         |
| sponsors | `[{ type, name, logo_url, label }]` — or map to SP1, SP2A, SP2B constants |

**Supabase tables:** `seasons`, `teams`, `players`, `rosters`, `games`, `awards`, `stat_definitions`, `player_stat_values`, `sponsors`

**Key mappings:**

- `teams.conference` → `conf`
- `teams` + `rosters` + `players` → team `players[]` (player names per team)
- `games` + teams lookup → `scores` with `t1`, `t2` (team names), `game` = `game_index`, `s1`/`s2` = scores
- `awards` → direct field mapping
- `player_stat_values` (for "points") + `players` + `rosters` + `teams` → `stats` with `name`, `team`, `gp` (0 or derived), `total`
- `sponsors` → map by `type` (title, conference_mecca, conference_medina) to SP1/SP2A/SP2B or `DB.sponsors`
