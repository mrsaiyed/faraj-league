# Faraj League Backend Implementation Plan

**Context**

- **Your repo** = development
- **Fork** = production (farajleague.org)
- **Flow**: develop in your repo → when ready, update fork → farajleague.org reflects changes
- **Phase 0 done**: Supabase project created; URL and anon key available

---

## Phase 1 — Foundation (DB schema + public API)

### Agent tasks

1. **Project setup**
   - Add `package.json` with minimal deps (e.g. Supabase client).
   - Add `.env.example` listing: `SUPABASE_URL`, `SUPABASE_ANON_KEY`.
   - Add `.gitignore` entries: `.env`, `node_modules/`.

2. **Database migrations**
   - Create Supabase migrations or SQL scripts for:
     - `seasons` (id, slug, label, is_current, created_at)
     - `teams` (id, season_id, name, conference, captain, sort_order)
     - `players` (id, season_id, name, jersey_number)
     - `rosters` (player_id, team_id) — or embed roster on team
     - `games` (id, season_id, week, game_index, home_team_id, away_team_id, home_score, away_score)
     - `awards` (id, season_id, week, akhlaq, motm1, motm2, motm3, champ, mvp, scoring)
     - `stat_definitions` (id, name, slug, unit, sort_order)
     - `player_stat_values` (player_id, stat_definition_id, value)
     - `sponsors` (id, season_id, type, name, logo_url, label — per season)
   - Add RLS policies so:
     - Public read for `seasons`, `teams`, `players`, `games`, `awards`, `stat_definitions`, `player_stat_values`, `sponsors`.

3. **Seed data**
   - Seed script: Spring 2026 season (`is_current = true`), 6 teams (Mecca/Medina), placeholder players, one empty week of games, default stat definition (points).

4. **Public API**
   - Document or implement read-only endpoints that match current `DB` shape:
     - `GET /seasons` (list)
     - `GET /seasons/current` or `/seasons?is_current=true`
     - `GET /seasons/:slug/data` returning: teams, rosters, scores, awards, stats, sponsors for that season.
   - If using Supabase directly: document the queries/filters and CORS for `https://farajleague.org` and `https://*.github.io`.

5. **README**
   - Add setup steps: clone, `npm install`, copy `.env.example` to `.env`, fill values, run migrations, run seed.
   - Add manual migration step: run import script once when ready.

### Your tasks

1. Create `.env` from `.env.example` and fill `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
2. Run migrations (e.g. `npx supabase db push` or SQL via Supabase dashboard).
3. Run seed script (e.g. `node scripts/seed.js` or equivalent).
4. In Supabase dashboard: verify tables and seed rows.
5. In Supabase → Settings → API: enable CORS for `https://farajleague.org` and `http://localhost:*` (for local preview).

---

## Phase 2 — Public site uses API

### Agent tasks

1. **Data layer**
   - Add `API_BASE` config (from env or single constant) pointing to Supabase REST URL.
   - Add `fetchSeasonData(slug)` (or `fetchCurrentSeason()`) that returns teams, scores, awards, stats, sponsors in the same shape as current `DB`.
   - Remove or disable `fetchCSV`, `TABS`, `parseRosters`, etc.

2. **Season dropdown**
   - Fetch `GET /seasons` and populate the season dropdown.
   - Default selection: season with `is_current = true`.
   - On change: call `fetchSeasonData(selectedSlug)` and re-render.

3. **Fallback**
   - If API fails: show a clear error and optionally keep `DEFAULT_TEAMS` as last-resort fallback.

4. **Config**
   - `API_BASE` should be easy to change for dev vs prod (e.g. env or one constant at top of script). Prod: Supabase project URL.

### Your tasks

1. Set `API_BASE` to your Supabase URL (e.g. `https://<project>.supabase.co/rest/v1` or the documented base).
2. Test locally: open `index.html` or a simple local server; confirm Network tab shows successful API calls.
3. Push to your dev repo; test on GitHub Pages preview if you use it.
4. If CORS errors: share error with agent; agent updates Supabase CORS or docs.

---

## Phase 3 — Admin v1 (login + CRUD)

### Agent tasks

1. **Admin app**
   - Create `admin/index.html` (and assets) as a small SPA.
   - Admin entrypoint at `/admin` or `admin/index.html` on the same Pages deployment.

2. **Auth**
   - Edge Function or serverless endpoint `POST /auth/login` that:
     - Accepts `{ password }`.
     - Compares to `ADMIN_PASSWORD` from env.
     - Returns short-lived JWT or session cookie.
   - Or: Supabase Auth with a single shared user and login; document credentials storage.
   - Admin UI: login form; on success, store token and redirect to dashboard.

3. **Protected routes**
   - All admin API calls include `Authorization: Bearer <token>`.
   - Server validates token before allowing writes.

4. **CRUD UI**
   - Season switcher (list seasons, choose one to edit).
   - Teams: list, add, edit, delete (name, conference, captain).
   - Players: list, add, edit, delete; assign to teams (roster).
   - Games: list by week; edit scores.
   - Awards: edit weekly (akhlaq, motm1–3) and season (champ, mvp, scoring).
   - Stats: list stat definitions; add new stat type; edit player stat values.
   - Sponsors: edit per season (title, conference, MOTM labels, logos).

5. **No public login**
   - No admin login link on public homepage; admin at `/admin` only.

### Your tasks

1. Choose and set `ADMIN_PASSWORD`; add to Supabase Edge Function env or dashboard secrets.
2. Add `ADMIN_PASSWORD` to GitHub Actions secrets (if using Actions) as `ADMIN_PASSWORD`.
3. Test admin login in incognito; confirm you can edit data.
4. Confirm no admin UI or password visible on public pages.

---

## Phase 4 — Draft (player bank + drag/drop + autosave)

### Agent tasks

1. **Draft data**
   - `draft_players` or `draft_pool` (season_id, player_id, team_id nullable, pick_order).
   - Player bank = players with `team_id` null (or equivalent).
   - Draft config: num teams, players per team (from admin or DB).

2. **Draft API**
   - `GET /draft/:seasonId` — players by team + bank.
   - `PATCH /draft/:seasonId/pick` — assign player to team (and optionally pick_order).
   - Idempotent, with validation (player not already assigned, team exists).

3. **Draft UI**
   - Player bank (bottom).
   - Team boxes (6 by default; configurable).
   - Drag-and-drop (HTML5 or library) from bank to team and team to team.
   - On drop: call PATCH immediately; optimistic UI with rollback on error.

4. **Admin config**
   - Admin can change number of teams and roster size for the season's draft.

### Your tasks

1. Run a test draft (screenshare-style): drag players, confirm data updates in Supabase.
2. Verify undo/error handling if agent implements it.

---

## Phase 5 — Hardening

### Agent tasks

1. **Rate limiting**
   - Rate limit login endpoint (e.g. 5 attempts per IP per minute).

2. **Export**
   - Admin: "Export CSV" for current season (rosters, scores, awards, stats) for backup.

3. **Tests**
   - Unit tests for standings calculation and stat aggregation (if not in Supabase functions).
   - Document how to run tests.

4. **Docs**
   - Update README with: env vars, deploy steps, fork sync workflow.

### Your tasks

1. Add GitHub repository secrets if not done: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ADMIN_PASSWORD` (for any CI that needs them).
2. Run tests locally.
3. Periodically export CSV or use Supabase backup for safety.

---

## One-time — Import from Google Sheets

### Agent tasks

1. **Import script**
   - Script that fetches rosters, scores, awards, stats from current Sheet CSV URLs.
   - Maps rows to DB schema and inserts (or upserts) for Spring 2026.
   - Idempotent where possible (e.g. clear season first, then insert).

2. **Documentation**
   - Document: "Run `node scripts/import-from-sheets.js` once; requires `.env`."

### Your tasks

1. Run the script once after Phase 1 (or when you're ready to move off Sheets).
2. Verify data in Supabase; then switch index.html to API (Phase 2).

---

## Fork sync workflow

### Your tasks (manual)

1. Develop and test in your dev repo.
2. When ready:
   - Open the fork repo on GitHub.
   - Sync/pull from your upstream (or create PR from your repo to fork).
   - Merge so the fork's main branch has your changes.
3. farajleague.org (served from the fork) will reflect the merge after Pages rebuilds.

---

## GitHub repository secrets (manual)

1. Repo → **Settings** → **Secrets and variables** → **Actions**.
2. **New repository secret** for each:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `ADMIN_PASSWORD`

Add these when you introduce GitHub Actions; for local dev, `.env` is sufficient.

---

## Agent prompt templates (reference)

**Phase 1**

> Implement Phase 1 of the Faraj League plan: Supabase is set up. Add migrations for seasons, teams, players, rosters, games, awards, stat_definitions, player_stat_values, sponsors. Seed Spring 2026 with 6 teams. Expose read-only public API matching the current index.html data shape. Add .env.example and README setup steps.

**Phase 2**

> Implement Phase 2: Change index.html to load data from the Supabase API instead of Google Sheets. Add fetchSeasonData() and wire the season dropdown to the API. Default to is_current season. Handle API errors.

**Phase 3**

> Implement Phase 3: Create admin app at admin/index.html with shared-password login, protected API, and CRUD for seasons, teams, players, games, awards, stats, sponsors. No admin link on public homepage.

**Phase 4**

> Implement Phase 4: Add draft UI with player bank, team boxes, drag-and-drop, and autosave. API endpoints for draft state and picks.

**Phase 5**

> Implement Phase 5: Add login rate limiting, CSV export in admin, and tests for standings/stat logic.
