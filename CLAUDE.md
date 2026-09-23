# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm test                              # Run all unit tests (vitest)
npx vitest run tests/standings.test.js  # Run a single test file (also: tests/stats.test.js, tests/seasons.test.js, tests/api.test.js)

npm run seed      # Seed database with placeholder data

# Import a season's player names (idempotent; --sql prints SQL for the Dashboard instead)
node scripts/import-roster.js scripts/rosters/fall2026.json
node scripts/import-roster.js scripts/rosters/fall2026.json --sql > supabase/seed_fall2026_players.sql

# Deploy all Edge Functions at once
npx supabase functions deploy auth-login admin-export-csv admin-seasons admin-teams admin-players admin-games admin-awards admin-stats admin-sponsors admin-media admin-content admin-media-slots admin-game-stats

# Push DB migrations (apply in order: 001–011)
npx supabase db push
```

Tests cover `lib/standings.js` (`calcStandings`, `calcSeeds`), `lib/stats.js` (`aggregateStats`), `lib/seasons.js` (slug/ordering helpers), `lib/team-logos.js` (logo resolution), `lib/draft-bank.js` (player-bank search), `lib/roster.js` (display ordering), `lib/game-tracker.js` (live stat engine) and `lib/sponsors.js` (sponsor slots) — pure functions only, no DB. `tests/api.test.js` covers `getSeasonData`'s season scoping against a stub Supabase client.

No build step — this is a static site with ES modules served directly.

## Architecture

**Stack**: Static HTML/CSS/ES modules (no bundler) + Supabase (PostgreSQL + Edge Functions) + GitHub Pages hosting.

### Public Site

`index.html` → `js/app.js` (orchestration) → `js/data.js` (fetch) → `lib/api.js` (Supabase queries) → `js/render.js` (DOM updates).

Data flow:
1. `fetchSeasons()` populates the season dropdown
2. `fetchSeasonData(slug)` fetches all season data in parallel (teams, players, rosters, games, awards, stats, sponsors)
3. `transformSeasonData(raw)` maps Supabase shape → internal `config.DB` shape (run once on fetch)
4. `renderAll()` updates all page sections from `config.DB`
5. `changeSeason(slug)` repeats steps 2–4; `showPage(id)` toggles `.page.active`

### Admin Site

`admin/index.html` is the **public site + edit overlays** — same layout, same width, same nav. Admin logic adds edit controls to every editable region.

`admin/js/admin.js` handles login and `adminFetch(fnName, options)` — all writes go through Supabase Edge Functions with `X-Admin-Token` header (JWT stored in localStorage).

`admin/js/admin-data.js` is the admin counterpart to `js/data.js` — loads season data and hydrates `config.DB` for admin pages.

`admin/js/page-templates.js` contains HTML templates extracted from `index.html` so the admin mirror renders the same DOM structure. **Must stay in sync with `index.html`** — public render functions find elements by ID in these templates. Any structural DOM change in `index.html` (new IDs, section restructuring) must be manually mirrored in `page-templates.js`.

`admin/js/edit-overlays.js` attaches inline Edit buttons to content-block regions and handles the inline/modal editor UI.

`admin/js/sections.js` wires up all CRUD UI (inline edit overlays, modals, floating drawer for season/logout controls).

### Edge Functions (`supabase/functions/`)

All admin writes go through Edge Functions — never direct DB access from the browser:
- `auth-login` — validates password, returns 24h JWT
- `admin-{seasons,teams,players,games,awards,stats,sponsors,media,media-slots,game-stats,content,export-csv}` — CRUD handlers
- `_shared/auth.ts` — JWT verification shared across all admin functions
- `admin-game-stats` — saves `game_stat_values` rows **and** derives/updates `games.home_score`/`away_score` from point totals; this is why scores update when a stat sheet is saved

Public reads use the Supabase anon key directly from `lib/api.js`.

### Key Files

| File | Purpose |
|------|---------|
| `js/config.js` | Supabase URL, anon key, sponsor/conference constants; `config.CURRENT_WEEK` and `config.TOTAL_WEEKS` runtime state; `getConferences()` reads dynamic conference list from `content_blocks.conferences_layout` (falls back to Mecca/Medina); `confShortLabel()` returns abbreviated conference name; `motmLabel(game)`, `akhlaqLabel(week)`, `statsTitle()` are sponsor-branded label helpers that read from `config.SP2A`/`SP2B` |
| `js/data.js` | `fetchSeasons`, `fetchSeasonData`, `transformSeasonData`; `deriveWeeks(scores, season)` derives `TOTAL_WEEKS`/`CURRENT_WEEK` — `seasons.total_weeks` wins when set but is floored at the highest week that has a game (so a stale setting can never hide scheduled or playoff weeks); with no setting the season runs to at least 8 weeks; `applySponsorOverrides(overrides)` mutates `config` SP1/SP2A/SP2B from sponsor rows |
| `js/render.js` | All DOM updates: `renderAll`, `renderHome`, `renderStandings`, `renderSchedule`, `renderScores`, `renderStats`, `renderAwards`, etc. `buildMatchupCard()` is the shared helper for home/schedule/scores cards. `TEAM_LOGOS` map + `teamLogoUrl()` serve team logos from `images/teams/` (keyed by lowercase name slug) |
| `scripts/rosters/*.json` | Per-season player lists — the source of truth for an import. Edit the JSON, then regenerate the SQL; never hand-edit `supabase/seed_*.sql` |
| `scripts/import-roster.js` | Imports a roster JSON into one season. Writes via the service role, or `--sql` emits SQL for the Dashboard. Idempotent: skips names already in that season (case-insensitive), so re-running adds nothing |
| `lib/game-tracker.js` | Pure live-tracker engine: `deriveState(events, cursor, config)` derives box score, team score, fouls and on-court lineups from an append-only event log; `appendEvent`/`undo`/`redo` move a cursor rather than editing totals; `toStatValues()` maps totals onto `game_stat_values` rows |
| `admin/js/live-tracker.js` | The live tracker UI. **Admin only** — imported on demand from `sections.js`, styled by `admin/css/live-tracker.css`; the public site references neither |
| `lib/sponsors.js` | Pure sponsor-slot helpers: `SPONSOR_SLOTS` (title / mecca / medina), `sponsorOverridesFrom(rows)` builds a **complete** override set so applying it resets slots a season has no row for, and `highlightSponsorNames()` colours the season's own sponsor names in one pass |
| `lib/team-logos.js` | Pure logo resolution: `resolveTeamLogo(team, name)` prefers that season's `teams.logo_url`, else falls back to the files committed in `images/teams/` matched loosely by name. `logoScaleCss()` renders the per-logo zoom (some are `[x, y]`) |
| `lib/draft-bank.js` | Pure `filterBankPlayers(players, query)` for the admin draft search — prefix match on the whole name or any word in it, original order preserved |
| `lib/seasons.js` | Pure season helpers: `slugifySeasonLabel('Fall 2026')` → `'fall2026'`, `isValidSeasonSlug()`, `sortSeasons()` (active season first, then newest-first), `activeSeasonSlug()`. `SEASON_SLUG_RE` is mirrored server-side in `admin-seasons` |
| `lib/standings.js` | Pure functions: `calcStandings(teams, scores)` → W/L/PF/PA (ties = loss for both); `calcSeeds(teams, scores)` → per-conf seed numbers with tiebreakers (conf record → H2H → PD → PF); returns `'TBD'` for all when no scored games |
| `lib/stats.js` | Pure function: `aggregateStats()` → player stat aggregation; prefers `game_stat_values` (per-game sheet), falls back to `player_stat_values` (manual season totals) when no game stats exist |
| `admin/js/sections.js` | All admin CRUD section renderers — one `renderX(content, ctx)` per entity; wires modals, inline overlays, and the season/logout drawer |
| `admin/js/draft-drag-drop.js` | Drag-and-drop for draft UI |
| `admin/js/draft-timer.js` | Draft timer and round management |

### Non-obvious Behaviours

**Seasons**: `seasons.is_current` marks the active season — the public site loads it by default (`activeSeasonSlug()` falls back to the newest season if none is flagged). Migration 010 adds a partial unique index so only one season can be current; `admin-seasons` therefore always clears the flag on every other season *before* setting it, never the other way round.

**Creating a season**: the admin drawer's "New season" form posts `{ create: true, label, slug, is_current, total_weeks, copy_from_season_id, copy: { settings, teams, sponsors } }` to `admin-seasons`. The copy options carry `content_blocks` structure keys, team rows (names/conferences/captains, no players or rosters) and sponsor rows across from an existing season, so a new season starts with the same categories rather than blank. Per-season results (schedule, playoffs, draft, power rankings, awards, hero/season tag copy) are never copied.

**Roster imports are season-scoped by construction**: the generated SQL `CROSS JOIN`s the VALUES list against `seasons` filtered by slug, so a wrong or missing slug inserts zero rows rather than writing players into another season. The duplicate check is `season_id` + `lower(name)`, so the same person can appear in several seasons (they get one `players` row per season) while a re-run never doubles up within one.

**Live stat tracker (admin only)**: the "Live stats" button on a game opens `admin/js/live-tracker.js`. It records an append-only event log (score / foul / stat / sub / lineup / period) and derives everything from it, so undo and redo are just a cursor and can never drift from the totals. The log is held in `localStorage` per game (`faraj_live_tracker_<gameId>`), so a refresh or a locked tablet mid-game loses nothing. Saving derives totals and posts them through the **existing** `admin-game-stats` function, which already recomputes the final score — so the tracker needs no new table, Edge Function or migration. Only stats with a matching `stat_definitions.slug` are saved; the rest are named in a warning. Roster players who never appeared are sent as `dnp_player_ids`. Input works by dragging a token onto a player *or* tapping the token then the player — Pointer Events, not HTML5 drag-and-drop, because iOS Safari does not fire the latter.

**Sponsors are per-season, with no code-level fallback**: `sponsors` rows are season-scoped, and a season with no row for a slot shows a neutral placeholder — the renderer no longer falls back to any particular brand name or logo file. `applySponsorOverrides()` assigns **every** slot unconditionally (resetting to the placeholder when absent) because `config` is a module singleton reused across season switches; skipping absent slots used to leave the previously loaded season's sponsor on screen. `highlightSponsor()` likewise colours only the names the current season actually has, via slot-keyed classes (`brand-sponsor-title/-a/-b`); the old brand-named classes remain in CSS only so previously saved rich text still renders. Admin: the Sponsors tab has a "Manage sponsors" panel (add / edit / **remove**), and the inline logo and description overlays now create a row when the slot is empty instead of silently doing nothing.

**Team logos are per-season**: `teams.logo_url` (migration 011) holds the logo for that season's team row, so renaming a team keeps its logo and two seasons can show different logos for the same club. `teams.logo_scale` is the zoom inside the circular crop (default 1.15) — custom logos usually need one. When `logo_url` is empty, `resolveTeamLogo()` falls back to matching the name against `images/teams/`, which is what pre-011 seasons rely on; that fuzzy match is intentionally unchanged, so setting `logo_url` is how you override a wrong match. Admin: the Teams page team cards each get a "Set logo" button.

**Season scoping**: `rosters`, `player_stat_values`, `game_stat_values` and `game_dnp` have no `season_id` — they are reached through `team_id`/`player_id`/`game_id`. `getSeasonData` therefore runs in two passes: season-scoped tables first, then those tables filtered by the ids it just fetched. Anything querying them must do the same or it will read across seasons (and eventually hit PostgREST's 1000-row cap). `stat_definitions` is deliberately global — every season shares the same stat categories.

**`confLabel()` vs `confLabelRaw()`**: `confLabel()` returns HTML with brand-name `<span>` highlights — use only in `innerHTML` contexts. `confLabelRaw()` returns plain text — use in `textContent`/attributes. `highlightSponsor()` only wraps three specific brand names (TOYOMOTORS, XTREME, Wellness).

**`scheduled_at` timezone**: `datetime-local` inputs in the admin produce naive `YYYY-MM-DDTHH:mm` strings (no timezone). `scheduledAtInputToIso()` in `sections.js` converts them to full ISO strings using the browser's local timezone offset, so times are stored correctly in UTC.

**`content_blocks` key precedence**: `transformSeasonData` applies global (null `season_id`) blocks first, then season-specific blocks, so season-level entries override global ones for the same key.

**`getBasePath()`**: Returns `/faraj-league` on GitHub Pages project sites (hostname contains `github.io`), otherwise `''`. Used when constructing image URLs so assets resolve correctly in both environments.

**Standings PD column**: `calcStandings()` returns `{ w, l, pf, pa }` — it does NOT include point differential. The PD column in the standings table is computed at render time in `renderStandings()` as `pf - pa`.

**Stats display limits**: `renderStats()` caps the table at 15 players (sorted by total points). A separate top-3 PPG leaders widget (`#stats-leaders-wrap`) is rendered above the table, sorted by points-per-game. Both respect the team filter.

**`config.DB` scores shape** (after `transformSeasonData`): `{ week, game, gameId, t1Id, t2Id, t1, s1, t2, s2, scheduled_at }`. The `t1`/`t2` fields are team names (used for display and standings lookups); `t1Id`/`t2Id` are DB UUIDs.

### Database Tables

`seasons`, `teams`, `players`, `rosters`, `games`, `game_stat_values`, `awards`, `stat_definitions`, `player_stat_values`, `sponsors`, `media_items`, `media_slots`, `content_blocks`, `login_attempts` (rate limiting).

Season-scoped (`season_id` column): `teams`, `players`, `games`, `awards`, `sponsors`, `media_items`, `media_slots`, `content_blocks` (null `season_id` = global). Global: `stat_definitions`, `login_attempts`.

RLS allows public read on all tables; writes are enforced by Edge Function JWT validation, not RLS policies.

`config.DB` extended shape after `transformSeasonData`: `gameStatValues` (`{ [gameId]: { [playerId]: { [statDefId]: value } } }`), `statDefinitions` (game-scoped stat columns), `draftBank` (unrostered players), `draftTeamOrder` (from `content_blocks.draft_team_order` or team sort order).

`content_blocks` stores freeform JSON values by key. Schedule-specific keys: `schedule_week_labels` (week heading text), `schedule_slots_by_week` (per-week game slots), `schedule_dates_by_week` (per-week date strings). Conference keys: `conferences_layout` (JSON with `conferences[]` array), `conf_name_mecca`, `conf_name_medina`. Other keys: `hero_badge`, `season_tag`, `about_text`, `draft_recap`, `draft_team_order`, `media_layout`, sponsor tier labels.

### Environment

```
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ADMIN_PASSWORD=
```

Copy `.env.example` to `.env` for local development. The seed script and Edge Functions use `SUPABASE_SERVICE_ROLE_KEY`; the browser uses only `SUPABASE_ANON_KEY`.

### Deploy Flow

**Two-repo model**: develop and test in this dev repo, then sync/PR into the production fork. GitHub Pages serves the fork's `main` branch at `farajleague.org`. Edge Functions deploy separately to Supabase (not via GitHub Pages). Migrations run via Supabase dashboard or `npx supabase db push` (apply in order 001–011).

`js/config.js` has Supabase URL and anon key baked in — dev and prod share the same Supabase project, so no config change is needed when syncing to the fork.
