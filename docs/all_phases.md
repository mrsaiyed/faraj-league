# Faraj League Backend Implementation Plan

**Context**

- **Your repo** = development
- **Fork** = production (farajleague.org)
- **Flow**: develop in your repo → when ready, update fork → farajleague.org reflects changes
- **Phase 0 done**: Supabase project created; URL and anon key available

**Principles**

- **Scalability** — Structure and schema should support growth (new seasons, teams, stats, etc.).
- **Admin editability** — Data users see on the public site should be editable via the admin page. Avoid hardcoded or non-editable content.
- **Admin ease of use** — Admin UI should have clear navigation, validation feedback, and obvious save/update flows. Prefer simple, direct workflows over complex multi-step wizards.
- **Admin = public site + edit overlays** — Admin uses the **exact same HTML structure** as the public site. Same nav, same layout, same width, same CSS. No sidebar or container that changes the layout. Admin-only controls (season switcher, settings, logout) live in a **floating overlay** (drawer/modal). Edit affordances are overlaid on every editable text element. Admins see precisely what visitors see; they edit in context. No separate form-based dashboards.
- **Static deployment** — Public site remains static (no build step). Admin is static HTML + JS; writes go through Edge Functions.
- **Transform at boundary** — Map Supabase response → app data shape in one place; render logic stays unchanged.
- **No secrets in client** — Only `SUPABASE_ANON_KEY` in frontend. Never expose `SUPABASE_SERVICE_ROLE_KEY`; auth and writes stay in Edge Functions.

---

## Phase 1 — Foundation (DB schema + public API) COMPLETE

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

## Phase 2 — Public site uses API COMPLETE

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

## Phase 2.5 — Code structure refactor (maintainability & scalability)

Refactor the public site from a single `index.html` into a proper file structure for maintainability, readability, and scalability. Do this after Phase 2 and before Phase 3 so the admin app is built on a clean foundation.

### Agent tasks

1. **Extract into separate files**
   - `index.html` — HTML structure only; link to external CSS and JS.
   - `css/` (e.g. `css/main.css`) — All styles, or split by page/component if preferred.
   - `js/` — Separate modules using ES modules (`type="module"`):
     - `js/config.js` — API URL, anon key, sponsor constants, TOTAL_WEEKS.
     - `js/data.js` — Data fetching (`fetchSeasons`, `fetchSeasonData`), Supabase transform.
     - `js/render.js` — All render functions (renderHome, renderStandings, etc.).
     - `js/app.js` — loadAll, changeSeason, event handlers, init.

2. **No build step**
   - Use native ES modules; browser loads scripts via `<script type="module">`.
   - Deployment remains static (same as current).

3. **Preserve behavior**
   - All pages and features work identically after refactor.
   - `lib/api.js` can be used by `js/data.js` or inlined fetch logic.

### Your tasks

1. Test locally after refactor; confirm all pages work.
2. Verify static deployment (e.g. GitHub Pages) still works.

---

## Phase 3 — Admin v1 (login + CRUD) COMPLETE

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

4. **Schema migration**
   - Add `scheduled_at TIMESTAMPTZ` (nullable) to `games` for game time.
   - Add `current_week INT` (nullable) to `seasons`; admin sets which week is "current" for a season.
   - Create `media_items` (id, season_id, week, title, url, type, sort_order) for Media page content.
   - Create `content_blocks` (id, key, value, season_id nullable) for editable page copy — e.g. `about_intro`, `about_secondary`, `draft_recap`, `draft_placeholder`.
   - Add RLS with public read for `media_items` and `content_blocks`.

5. **CRUD UI**
   - Season switcher (list seasons, choose one to edit).
   - Seasons: edit `is_current` (toggle; ensure only one current) and **`current_week`** (admin sets which week is current for that season).
   - Teams: list, add, edit, delete (name, conference, captain).
   - Players: list, add, edit, delete; assign to teams (roster).
   - Games/Schedule: list by week; add, edit, delete games; edit scores; edit game time (`scheduled_at`). Full schedule management.
   - Awards: edit weekly (akhlaq, motm1–3) and season (champ, mvp, scoring).
   - Stats: list stat definitions; add new stat type; edit player stat values.
   - Sponsors: edit per season (title, conference, MOTM labels, logos).
   - Media: list by week; add, edit, delete media items (title, url, type) for Highlights & Interviews.
   - About (optional): edit league story and secondary text blocks shown on About page, if that content is actively managed.
   - Draft page: edit Draft Recap paragraph and placeholder text (e.g. "Draft board coming soon").

6. **API / data**
   - Extend `fetchSeasonData` (or equivalent) to include media_items and content_blocks so the public site renders them.

7. **No public login**
   - No admin login link on public homepage; admin at `/admin` only.

**Note:** Phase 3.7 refactors Home, Standings, Schedule, Media, About to visual mirror (edit overlays on the actual public pages instead of separate form dashboards).

### Your tasks

1. Choose and set `ADMIN_PASSWORD`; add to Supabase Edge Function env or dashboard secrets.
2. Add `ADMIN_PASSWORD` to GitHub Actions secrets (if using Actions) as `ADMIN_PASSWORD`.
3. Test admin login in incognito; confirm you can edit data.
4. Confirm no admin UI or password visible on public pages.

---

## Phase 3.5 — Schedule tab (public site) DONE

Add a dedicated Schedule tab so users can view the season schedule, navigate by week, and filter by team. Admin manages the underlying data via Phase 3 Games/Schedule CRUD.

### Agent tasks

1. **Schedule tab (public)**
   - Add Schedule nav tab and page.
   - Week dropdown: select focus week (default: current week).
   - Display three sections: **Previous week** | **Focus week** | **Next week** (hide prev when Week 1, next when last week).
   - Past weeks: show scores; future/current weeks: show matchups with time (or "TBD" when `scheduled_at` is null).
   - Team filter: dropdown to view a team's full season schedule.
   - Each game shows: opponent, time (or TBD).

2. **Data**
   - Use existing `games` data; include `scheduled_at` in API transform (e.g. `fetchSeasonData` / scores shape).
   - Derive opponent from `home_team_id` / `away_team_id` (teams lookup).

### Your tasks

1. Verify Schedule tab works with season switcher.
2. Test team filter and week navigation (prev/focus/next).
3. Confirm past weeks show scores; upcoming show time/TBD.
4. Confirm homepage "Recent Matchups" and "Recent Awards" show previous week's data when `current_week` is set (e.g. current week 4 → show week 3).

---

## Phase 3.6 — Game stat sheets (Stats + Games) DONE

**Business goal:** Replace paper stat sheets with digital ones. Fill out stat sheets live during games (or retroactively). Track points, fouls, and admin-configurable stats per player per game. Enable live score tracking for fans at home.

### Agent tasks

1. **Schema**
   - Create `game_stat_values` (game_id, player_id, stat_definition_id, value) for per-game, per-player stats.
   - Add `scope` or equivalent to `stat_definitions` to distinguish game-level stats (points, fouls) vs season-level if needed; or treat all stats as game-scoped for stat sheets.
   - Admin can add new stat types (points, fouls, rebounds, etc.) from the admin page.

2. **Games + Stats UI (admin)**
   - Merge Games and Stats into a unified flow (or keep Games tab but add stat-sheet entry as primary action when viewing a game).
   - Select a game → show stat sheet: **Team 1 vs Team 2**, 7 players per team (from rosters).
   - One row per player; columns for each stat (points, fouls, + any admin-defined stats).
   - Input fields for each cell; save per game. Optimistic UI; clear validation feedback.
   - Support live entry during games; auto-save or manual save with obvious feedback.

3. **Score derivation**
   - Game score (home_score, away_score) can be derived from points stat or entered separately; document the chosen approach. If derived, update games on stat save.

4. **Public site**
   - Expose game stat sheets and live (or near-live) scores so fans can follow along.
   - Stats tab: continue to show season aggregates; optionally link to per-game stat sheets.

5. **Public Schedule — expandable box score**
   - Matchup cards on Schedule (and Scores on Standings) are expandable (click or chevron to expand).
   - **Played games:** Expand to show full box score — team score + per-player stats table (PTS, Fouls, etc.).
   - **Unplayed games:** Expand to show skeleton — team names, empty score line, empty stat rows (or "Stats will appear after the game").
   - Same expandable behavior wherever games are shown (Schedule, Standings Scores).

6. **Live score behavior**
   - "Live" = fans see updates after page refresh (static site; no real-time push).
   - Optional future: auto-refresh when Schedule is open (e.g. every 30s) for near-live feel.

7. **Data layer**
   - Extend `fetchSeasonData` or add `fetchGameStats(gameId)` to include game_stat_values.
   - Include `game_id` in scores shape (config.DB.scores) for box score lookups.
   - Ensure standings and scoring title use correct aggregation (from game stats or player_stat_values as decided).

### Your tasks

1. Test live stat entry during a simulated game.
2. Confirm scores update and are visible on the public site for fans.
3. Verify stat types can be added from admin and appear in the stat sheet.
4. Verify expandable box score works on Schedule; played games show full stats, unplayed show skeleton.

---

## Phase 3.7 — Admin mirrors public site + editable media slots DONE

**Business goal:** Admin is the public site with edit overlays — nothing more. Same HTML structure, same layout, same width, same CSS. The only addition: Edit affordances overlaid on every editable text element. Admin controls (season switcher, settings, logout) live in a **floating overlay** (drawer/modal), **not** a sidebar. No layout-changing admin chrome.

**Scope:** Home, Standings, Schedule, **Teams**, Media, About, Sponsors, and other sections with public pages. Every editable text gets an overlay: hero badge, season tag, team names, captains, player names, conference labels, media titles/URLs, about text, sponsor taglines in About accordions, etc. All media slots (Top Plays, Baseline Episodes, Match Highlights) editable. No hardcoded "Coming soon" that admins cannot replace.

### Agent tasks

1. **Admin layout = public layout**
   - Admin page uses the **exact same structure** as the public site: same `<nav>`, same `main`, same `css/main.css`, same body background and width. No sidebar.
   - **Floating admin control:** A single control (e.g. gear icon) that opens a drawer with: season switcher, season settings (is_current, current_week), logout. When closed, the page looks identical to public.
   - Nav order: **Home** | **Standings** | **Schedule** | **Teams** | **Players** | **Stats** | **Awards** | **Draft** | **Media** | **About** | **Sponsors**. (Roster edits via Teams panel; Players tab for full CRUD and bulk delete—added in Phase 4.)

2. **Edit overlays on every editable text**
   - Home: hero badge, season tag; link to Awards; link to Schedule.
   - Standings: Edit Schedule button.
   - Schedule: Edit on each matchup card; add game; stat sheet modal centered; week and team filter preserved after edits.
   - **Teams:** Edit overlays on season label, conference headers (with add/remove conference), team names, captains, roster player names. Dynamic conferences via `conferences_layout`; full label editing with `display_label`; drag-and-drop reorder and move between conferences; optimistic Add team.
   - Media: Edit on each Top Play and each Baseline/Highlights card.
   - About: Edit on merged `about_text` block; editable sponsor taglines inside conference accordions (`about_conf_taglines`); sponsor text derived from conference label when possible.
   - Stats, Awards, Draft, Sponsors: visual mirror where a public page exists; Sponsors page redesigned (title sponsor, conference sponsors, community partners) and mirrored with edit overlays.

3. **Media slots schema**
   - Create `media_slots` (season_id, week, slot_key, title, url) for defined slots.
   - Slot keys: baseline_ep1, baseline_ep2, baseline_ep3, highlights_g1, highlights_g2, highlights_g3.
   - Admin assigns title and URL via edit overlay on Media cards.

4. **Public Media page**
   - Consume media_slots for Baseline and Highlights. Show link when URL set; "Coming soon" when empty.

5. **Additional refinements (implemented)**
   - Box score: redesigned layout — prominent game score, team names above tables, clear division between teams, alternating rows, points emphasized.
   - Admin drawer: season settings form uses aligned layout (admin-drawer-form, admin-drawer-form-row).
   - Sponsors: newlines preserved in descriptions (`white-space: pre-line`); Medina fallback logo (`images/wellness-logo.png`).
   - Richtext: newlines preserved in edit overlays (display: `\n` → `<br>`; textarea for editing).

### Your tasks

1. Navigate admin; confirm the page looks **identical** to public (same layout, same width) with only Edit overlays as the difference.
2. Edit hero badge, season tag, team names, media slots, about text, conference taglines; verify changes appear on public site.
3. Confirm no media slot is permanently hardcoded.

---

## Phase 4 — Draft (player bank + drag/drop + autosave) COMPLETE

**Business goal:** Replace manual draft with interactive drag-and-drop. League staff run the draft via admin; public views a read-only draft board (team slots only, no bank). See **phase4.md** for full step-by-step tasks.

### Implemented

1. **Draft data (no new schema)**
   - Use existing `rosters`. Player bank = season players with no roster entry; assigned = players in rosters.
   - Team order: `draft_team_order` in content_blocks (JSON array of team IDs). Fallback: teams by sort_order.
   - Team slot count = `teams.length` (6, 7, 8 — whatever exists for the season).

2. **Draft API**
   - Use `admin-players` for assign: `{ id, team_id }`; unassign: `{ id, team_id: null }`; delete: `{ delete: true, id }` (clears team.captain when applicable).
   - Use `admin-content` for `draft_team_order` (team card display order).
   - Use `admin-teams` for captain: `{ id: team_id, captain: player_name }`.

3. **Draft UI — Public**
   - Team cards with strong dividers; captain (turquoise box) and players (gold chips) per team. No player bank.

4. **Draft UI — Admin**
   - Same layout as public + player bank at bottom. Drag-and-drop: bank↔team, team↔team, team→bank.
   - Captain slot is drop zone; drag player to assign captain. Captain chip draggable.
   - Team cards draggable to reorder (Sortable.js); save to `draft_team_order`.
   - Add Players (bulk); draft timer, rounds, start/pause/end, manual prev/next.
   - Autosave on drop; optimistic UI with rollback on error.

5. **Players tab (admin)**
   - New nav tab: list all players, Add/Edit/Delete, "Delete all players" bulk action. Used to clear test data before importing real roster.

6. **Captain display logic**
   - Only show captain when they exist in roster; ghost/deleted captains show "—". `admin-players` clears team.captain on player delete.

### Your tasks

1. Run a test draft: drag players, reorder teams, assign captains, confirm data updates in Supabase.
2. Verify public sees only team slots (no bank); admin sees bank and can drag.

---

## Phase 5 — Hardening COMPLETE

### Agent tasks

1. **Rate limiting**
   - Rate limit login endpoint (e.g. 5 attempts per IP per minute).

2. **Export**
   - Admin: "Export CSV" for current season (rosters, scores, awards, stats, schedule/games, game_stat_values, media_items, media_slots, content_blocks) for backup. content_blocks includes keys such as hero_badge, season_tag, about_text, about_conf_taglines, conferences_layout, media_layout, draft_team_order, draft_recap, draft_placeholder, sponsor tiers, etc.

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

**Phase 2.5**

> Implement Phase 2.5: Refactor public site from single index.html into separate HTML, css/, and js/ modules (config, data, render, app). Use ES modules, no build step. Preserve all behavior.

**Phase 3**

> Implement Phase 3: Create admin app at admin/index.html with shared-password login, protected API, and CRUD for seasons (incl. is_current, current_week), teams, players, games (full schedule: add/edit/delete, scores, scheduled_at), awards, stats, sponsors, media, about content, draft page content. Migrations: games.scheduled_at, seasons.current_week, media_items, content_blocks. Extend fetchSeasonData to include media and content_blocks. Admin ease of use: clear nav, validation, save feedback. No admin link on public homepage.

**Phase 3.5**

> Implement Phase 3.5: Add Schedule tab to public site nav. Week dropdown for focus week; display previous, focus, and next week (hide prev at Week 1, next at last week). Past weeks show scores; future show matchups with time or TBD. Team filter for full season schedule per team. Homepage Recent Matchups/Awards show previous week when current_week is set.

**Phase 3.6**

> Implement Phase 3.6: Add game stat sheets. Schema: game_stat_values (game_id, player_id, stat_definition_id, value). Admin: Games tab — "Stat sheet" per game; Team 1 vs Team 2, players from rosters, input cells per stat (points, fouls, etc.). Live/retro entry; derive or manual scores. Public: Schedule matchup cards expandable — played games show full box score; unplayed show skeleton. Include game_id in scores shape. Stats tab keeps season aggregates from game stats.

**Phase 3.7**

> Implement Phase 3.7: Admin is the public site + edit overlays. Same HTML structure, same layout, same width — no sidebar. Admin controls (season switcher, settings, logout) in a floating drawer/modal. Edit overlays on every editable text: hero badge, season tag, team names, captains, player names, conference labels (dynamic via conferences_layout), media titles/URLs, about_text, about_conf_taglines (sponsor taglines in accordions). Nav: Home, Standings, Schedule, Teams, Stats, Awards, Draft, Media, About, Sponsors (player/roster in Teams panel). Media slots (media_slots): baseline_ep1–3, highlights_g1–3. Public Media: consume slots; no hardcoded "Coming soon" unless slot empty. Reuse public render functions with adminMode flag; shared lib/api + transform.

**Phase 4** *(complete)*

> Implement Phase 4 from phase4.md: Draft UI with player bank (admin only), team boxes with strong dividers, drag-and-drop (players: bank↔team, team↔team; teams: reorder). Captain slot drop zone; captain chip draggable. Use admin-players (assign/unassign/delete); admin-content (draft_team_order); admin-teams (captain). Players tab for full CRUD and bulk delete. Shared renderDraft(adminMode). Turquoise captain section, gold player chips. Autosave on drop, optimistic UI.

**Phase 5**

> Implement Phase 5: Add login rate limiting, CSV export in admin (rosters, scores, awards, stats, schedule/games, game_stat_values, media_items, media_slots, content_blocks), and tests for standings/stat logic.
