# Phase 5 — Hardening (rate limiting, CSV export, tests) ✅ Complete

Execute these steps in order. **Agent** = tasks the Cursor agent does. **You** = manual steps you perform.

**Prerequisite:** Phase 1 through Phase 4 complete. Admin app works; auth-login returns JWT; all CRUD and draft features are in place.

---

## Principles

- **Static deployment** — Public site and admin remain static (no build step). Tests run in development only; they do not change deployed assets.
- **Transform at boundary** — Export maps Supabase response → CSV at the Edge Function boundary. Standings and stat logic extracted to `lib/` for testability.
- **No secrets in client** — Rate limiting and export logic run in Edge Functions. Only `SUPABASE_ANON_KEY` in frontend. JWT verification and service_role usage stay server-side.
- **Admin = public + edit overlays** — Export button lives in the **floating admin drawer** alongside season switcher, settings, logout. No new layout or chrome.
- **Admin ease of use** — Export: one button, loading state, success (download), error feedback.
- **Scalability** — Rate limiting uses persistent storage (Supabase table) so it works across Edge Function instances.

---

## Alignment with all_phases & business goal

- **all_phases.md Phase 5:** Rate limit login (e.g. 5 attempts per IP per minute), Admin CSV export for current season, unit tests for standings and stat aggregation, document how to run tests, update README with env vars, deploy steps, fork sync workflow.
- **Business goal:** Hardening for security (rate limiting), backup (CSV export), and correctness (tests). farajleague.org remains static; admin workflow unchanged.

---

## Step 1 — Agent: Rate limiting on auth-login

**Who:** Agent

**What:**

1. **Add rate limiting to `auth-login` Edge Function:**
   - Limit: 5 attempts per IP per minute (sliding window).
   - Use **persistent storage** — a Supabase table (e.g. `login_attempts` with `ip`, `attempted_at`) — so rate limiting works across multiple Edge Function instances. Do not use in-memory storage.
   - **auth-login requires `SUPABASE_SERVICE_ROLE_KEY`** in Edge Function secrets to read/write the rate-limit table.
   - On exceeded limit: return 429 `{ "error": "Too many login attempts. Try again in X seconds." }`.

2. **IP detection:** Read from `req.headers.get('X-Forwarded-For')` (first IP in comma-separated list) or `req.headers.get('X-Real-IP')`; fallback to a placeholder if unavailable.

3. **Schema:** Create migration `006_phase5_login_attempts.sql` for `login_attempts (id UUID, ip TEXT, attempted_at TIMESTAMPTZ)` with index on `(ip, attempted_at)`. No RLS; only service_role writes. Run after migrations 001–005.

4. **Rate limit flow (strict order):**
   - Delete rows where `attempted_at < now() - interval '1 minute'` for this IP.
   - Count remaining rows for this IP.
   - If count ≥ 5 → return 429.
   - Insert new row for this IP.
   - Check password.
   - On success: delete rows for this IP, return token.
   - On failure: return 401 (row already inserted; counts toward limit).

**How:** In Agent mode:

> Implement Phase 5 Step 1 from phase5.md: Add rate limiting to auth-login (5 attempts per IP per minute). Use Supabase table for persistent storage. Follow flow: delete old → count → if ≥5 return 429 → insert → check password → on success delete rows. Return 429 when exceeded. Detect IP from X-Forwarded-For or X-Real-IP. auth-login needs SUPABASE_SERVICE_ROLE_KEY.

---

## Step 2 — Agent: admin-export-csv Edge Function

**Who:** Agent

**What:**

1. **Create `admin-export-csv` Edge Function:**
   - Verify JWT via `verifyAdminToken` from `_shared/auth.ts`.
   - Accept `POST` body `{ season_slug: string }`.
   - Fetch season data for that slug using service_role Supabase client.

2. **Export entities (full backup for restore):**
   - `seasons` — the season row
   - `teams` — for the season
   - `players` — for the season
   - `rosters` — player_id, team_id, sort_order; denormalize player_name, team_name for readability
   - `games` — week, game_index, home_team_id, away_team_id, home_score, away_score, scheduled_at; include home_team, away_team names
   - `awards` — week, akhlaq, motm1–3, champ, mvp, scoring
   - `game_stat_values` — for games in the season
   - `player_stat_values` — for players in the season
   - `stat_definitions` — all rows, all columns including `scope` (needed to interpret stat values)
   - `media_items` — week, title, url, type, sort_order
   - `media_slots` — week, slot_key, title, url
   - `content_blocks` — filter `season_id = <season> OR season_id IS NULL`; key, value, season_id (hero_badge, season_tag, about_text, about_conf_taglines, conferences_layout, media_layout, draft_team_order, draft_recap, draft_placeholder, sponsor tiers, etc.)
   - `sponsors` — per-season sponsor overrides (type, name, logo_url, label)

3. **Response format:** Return a ZIP file containing one CSV per entity (e.g. `seasons.csv`, `teams.csv`, `players.csv`, `rosters.csv`, `games.csv`, `awards.csv`, `game_stat_values.csv`, `player_stat_values.csv`, `stat_definitions.csv`, `media_items.csv`, `media_slots.csv`, `content_blocks.csv`, `sponsors.csv`). Filename: `faraj-league-export-{slug}-{date}.zip`.

4. **Error handling:** 400 if season_slug missing or season not found; 401 if invalid token; 500 on server error.

**How:** In Agent mode:

> Implement Phase 5 Step 2 from phase5.md: Create admin-export-csv Edge Function. Verify JWT. Fetch season data for season_slug. Return ZIP of CSVs for seasons, teams, players, rosters, games, awards, game_stat_values, player_stat_values, stat_definitions, media_items, media_slots, content_blocks, sponsors. Include denormalized names where helpful.

---

## Step 3 — Agent: Admin UI — Export CSV button

**Who:** Agent

**What:**

1. **Place Export button in the admin drawer:**
   - Add a new `admin-drawer-section` in `admin/index.html` inside the drawer content, between season settings and Log out.
   - Label: "Backup" or "Export CSV"; button: "Export CSV" or "Download backup".
   - Admin drawer structure: Season settings | **Export CSV** | Log out.

2. **On click:**
   - Call `adminFetch('admin-export-csv', { season_slug: config.currentSeasonSlug })` (or equivalent for fetching binary).
   - Handle binary response (ZIP); trigger browser download via blob URL or `Content-Disposition` filename.
   - Show loading state ("Exporting…") during request; disable button while loading.

3. **Feedback:**
   - Success: Download starts; brief "Export complete" message.
   - Error: Show error message (e.g. "Export failed: …") in the drawer.

4. **Binary response handling:** Add `adminFetchBlob` (or extend `adminFetch` with options) that uses `res.blob()` instead of `res.json()` for export. Do not call `res.json()` on ZIP response. On non-2xx: check `res.status`, optionally parse `res.json()` for error message, then throw.

**How:** In Agent mode:

> Implement Phase 5 Step 3 from phase5.md: Add Export CSV button in admin drawer (between season settings and Log out). Add adminFetchBlob or responseType support; use res.blob() for ZIP, not res.json(). Call admin-export-csv with current season_slug. Trigger ZIP download. Show loading and error feedback.

---

## Step 4 — Agent: Extract standings and stat logic for testing

**Who:** Agent

**What:**

1. **Extract `calcStandings` to `lib/standings.js`:**
   - Pure function: `calcStandings({ teams, scores })` → `{ [teamName]: { w, l, pf, pa, conf, id } }`.
   - Same logic as current `calcStandings()` in `js/render.js`; remove dependency on `config.DB` — pass data as arguments.
   - Update `js/render.js` to import and call `calcStandings(config.DB.teams, config.DB.scores)`.

2. **Extract stat aggregation to `lib/stats.js`:**
   - Pure function that builds `stats` array from raw data. Signature: `aggregateStats({ game_stat_values, player_stat_values, stat_definitions, rosters, games, players, rosterToTeam, playerToTeamId })` → `stats` (array of `{ name, team, gp, total }`).
   - Same logic as the block in `transformSeasonData` in `js/data.js`; extract without changing behavior.
   - Update `js/data.js` to import and call `aggregateStats(...)` with the appropriate arguments.

3. **Preserve behavior** — no functional change. Run public site and admin; confirm standings and Stats tab match prior behavior.

**How:** In Agent mode:

> Implement Phase 5 Step 4 from phase5.md: Extract calcStandings to lib/standings.js and stat aggregation to lib/stats.js. Update render.js and data.js to use them. Preserve behavior.

---

## Step 5 — Agent: Unit tests for standings and stat aggregation

**Who:** Agent

**What:**

1. **Add test runner:** Vitest (or Node built-in test runner). Use `type: "module"`; no build step for the app. Tests run in development only; static deployment is unchanged.

2. **Add `tests/standings.test.js`:**
   - Fixtures: minimal `teams` and `scores` arrays.
   - Assert: W/L/PA/PF for wins, losses, ties; correct team names and IDs.

3. **Add `tests/stats.test.js`:**
   - Fixtures: `game_stat_values`, `player_stat_values`, `stat_definitions`, rosters, games, players.
   - Assert: aggregation from `game_stat_values` (GP, total); fallback to `player_stat_values` when no game stats; correct team assignment.

4. **Add `"test": "vitest run"`** (or equivalent) to `package.json` scripts.

5. **Document:** In README (Step 6) and below: run tests with `npm test`.

**How:** In Agent mode:

> Implement Phase 5 Step 5 from phase5.md: Add Vitest and unit tests for standings and stat aggregation. Add npm test script. Tests are dev-only; static deployment unchanged.

---

## Step 6 — Agent: Update README

**Who:** Agent

**What:**

1. **Environment variables section:**
   - `SUPABASE_URL` — Supabase project URL
   - `SUPABASE_ANON_KEY` — anon/public key
   - `SUPABASE_SERVICE_ROLE_KEY` — for seed script and Edge Functions; **required for auth-login** (rate limiting uses `login_attempts` table)
   - `ADMIN_PASSWORD` — for admin login (set in Supabase Edge Function secrets; not in `.env` for production)

2. **Migrations:** Run in order 001 → 002 → 003 → 004 → 005 → 006. Phase 5 adds `006_phase5_login_attempts.sql`.

3. **Deploy steps:**
   - Static assets: push to fork; GitHub Pages serves from repo.
   - Edge Functions: deploy all; ensure secrets (`ADMIN_PASSWORD`, `SUPABASE_SERVICE_ROLE_KEY`) set before deploy:
     ```bash
     npx supabase functions deploy auth-login admin-export-csv admin-seasons admin-teams admin-players admin-games admin-awards admin-stats admin-sponsors admin-media admin-content admin-media-slots admin-game-stats
     ```

4. **Fork sync workflow:**
   - Develop and test in dev repo.
   - When ready: sync/pull from dev to fork (or open PR).
   - Merge so fork's main has changes; farajleague.org reflects after Pages rebuild.
   - Edge Functions deploy separately to Supabase.

5. **Run tests:**
   - `npm test` — runs unit tests for standings and stat aggregation.
   - Tests are development-only; they do not affect static deployment.

6. **Keep existing** setup, seed, and CORS instructions. Integrate new content without duplicating.

**How:** In Agent mode:

> Implement Phase 5 Step 6 from phase5.md: Update README with env vars, deploy steps, fork sync workflow, and npm test instructions.

---

## Step 7 — You: Deploy and add secrets

**Who:** You

**What:**

1. **Supabase Edge Function secrets:** Ensure `ADMIN_PASSWORD` and `SUPABASE_SERVICE_ROLE_KEY` are set. auth-login requires service_role for rate limiting.

2. **Run migration 006** (login_attempts table) before deploying auth-login.

3. **Deploy Edge Functions:**
   ```bash
   npx supabase functions deploy auth-login admin-export-csv admin-seasons admin-teams admin-players admin-games admin-awards admin-stats admin-sponsors admin-media admin-content admin-media-slots admin-game-stats
   ```

4. **GitHub Actions (if used):** Add `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ADMIN_PASSWORD` to repo secrets for CI.

---

## Step 8 — You: Test and verify Phase 5

**Who:** You

**What:**

1. **Rate limiting:** Make 6+ failed login attempts within one minute from same IP. Confirm 429 response and "Too many login attempts" message. Wait for window to reset; confirm login works again.

2. **Export CSV:** Open admin drawer → Export CSV. Confirm ZIP downloads; unzip and verify CSVs for seasons, teams, players, rosters, games, awards, game_stat_values, player_stat_values, stat_definitions, media_items, media_slots, content_blocks, sponsors. Spot-check data.

3. **Tests:** Run `npm test`. Confirm all tests pass.

4. **README:** Confirm env vars, deploy steps, fork sync, and test instructions are accurate.

---

## Step 9 — You: Verify Phase 5 complete

**Who:** You

**What:** Confirm:

1. auth-login returns 429 after 5 failed attempts per IP per minute.
2. Admin drawer has Export CSV; download produces a restorable backup ZIP.
3. `npm test` passes.
4. README documents env vars, deploy, fork sync, and tests.
5. Static deployment unchanged; public site and admin behave as before.

---

## Summary

| Order | Who   | Step                                                                 |
|-------|-------|----------------------------------------------------------------------|
| 1     | Agent | Rate limiting on auth-login (Supabase table storage)                 |
| 2     | Agent | admin-export-csv Edge Function (ZIP of CSVs)                         |
| 3     | Agent | Admin drawer — Export CSV button                                     |
| 4     | Agent | Extract standings and stat logic to lib/                             |
| 5     | Agent | Unit tests for standings and stat aggregation                        |
| 6     | Agent | Update README                                                        |
| 7     | You   | Deploy auth-login and admin-export-csv; set secrets                  |
| 8     | You   | Test rate limiting, export, tests                                    |
| 9     | You   | Verify Phase 5 complete                                              |

---

## Data reference (for Agent)

**CSV export entities (full backup):**

| Entity             | Source                           | Notes                                                |
|--------------------|----------------------------------|------------------------------------------------------|
| seasons            | seasons                          | The exported season row                              |
| teams              | teams                            | Filter by season_id                                  |
| players            | players                          | Filter by season_id                                  |
| rosters            | rosters + players + teams        | player_id, team_id, sort_order; denormalize player_name, team_name |
| games              | games + teams                    | Denormalize home/away team names                     |
| awards             | awards                           | Filter by season_id                                  |
| game_stat_values   | game_stat_values                 | For game_ids in season                               |
| player_stat_values | player_stat_values               | For player_ids in season                             |
| stat_definitions   | stat_definitions                 | All rows, all columns (including scope)              |
| media_items        | media_items                      | Filter by season_id                                  |
| media_slots        | media_slots                      | Filter by season_id                                  |
| content_blocks     | content_blocks                   | Filter: season_id = X OR season_id IS NULL           |
| sponsors           | sponsors                         | Filter by season_id                                  |

**content_blocks keys:** hero_badge, season_tag, about_text, about_conf_taglines, conferences_layout, media_layout, draft_team_order, draft_recap, draft_placeholder, sponsor_tier_title, sponsor_tier_conf, sponsor_tier_community, sponsor_community_1_name, sponsor_community_1_logo, sponsor_community_1_desc, etc.

**Rate limit table:** `login_attempts (id UUID, ip TEXT, attempted_at TIMESTAMPTZ)` with index on `(ip, attempted_at)`. Flow: delete old → count → if ≥5 return 429 → insert → check password → on success delete rows for IP.
