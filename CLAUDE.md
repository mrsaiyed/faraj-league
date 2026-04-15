# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm test                              # Run all unit tests (vitest)
npx vitest run tests/standings.test.js  # Run a single test file (also: tests/stats.test.js)

npm run seed      # Seed database with placeholder data

# Deploy an Edge Function
npx supabase functions deploy <function-name>

# Push DB migrations (run in order: 001–007)
npx supabase db push
```

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

`admin/js/page-templates.js` contains HTML templates extracted from `index.html` so the admin mirror renders the same DOM structure. **Must stay in sync with `index.html`** — public render functions find elements by ID in these templates.

`admin/js/edit-overlays.js` attaches inline Edit buttons to content-block regions and handles the inline/modal editor UI.

`admin/js/sections.js` wires up all CRUD UI (inline edit overlays, modals, floating drawer for season/logout controls).

### Edge Functions (`supabase/functions/`)

All admin writes go through Edge Functions — never direct DB access from the browser:
- `auth-login` — validates password, returns 24h JWT
- `admin-{seasons,teams,players,games,awards,stats,sponsors,media,media-slots,game-stats,content,export-csv}` — CRUD handlers
- `_shared/auth.ts` — JWT verification shared across all admin functions

Public reads use the Supabase anon key directly from `lib/api.js`.

### Key Files

| File | Purpose |
|------|---------|
| `js/config.js` | Supabase URL, anon key, sponsor/conference constants; `config.CURRENT_WEEK` and `config.TOTAL_WEEKS` runtime state; `getConferences()` reads dynamic conference list from `content_blocks.conferences_layout` (falls back to Mecca/Medina) |
| `js/data.js` | `fetchSeasons`, `fetchSeasonData`, `transformSeasonData`; `deriveWeeks(scores, season)` derives `TOTAL_WEEKS`/`CURRENT_WEEK` (min 8, overridden by `season.total_weeks`); `applySponsorOverrides(overrides)` mutates `config` SP1/SP2A/SP2B from sponsor rows |
| `js/render.js` | All DOM updates: `renderAll`, `renderHome`, `renderStandings`, `renderSchedule`, `renderScores`, `renderStats`, `renderAwards`, etc. `buildMatchupCard()` is the shared helper for home/schedule/scores cards. `TEAM_LOGOS` map + `teamLogoUrl()` serve team logos from `images/teams/` (keyed by lowercase name slug) |
| `lib/standings.js` | Pure functions: `calcStandings(teams, scores)` → W/L/PF/PA (ties = loss for both); `calcSeeds(teams, scores)` → per-conf seed numbers with tiebreakers (conf record → H2H → PD → PF); returns `'TBD'` for all when no scored games |
| `lib/stats.js` | Pure function: `aggregateStats()` → player stat aggregation; falls back to `player_stat_values` if no game stats |
| `admin/js/sections.js` | All admin CRUD section renderers — one `renderX(content, ctx)` per entity; wires modals, inline overlays, and the season/logout drawer |
| `admin/js/draft-drag-drop.js` | Drag-and-drop for draft UI |
| `admin/js/draft-timer.js` | Draft timer and round management |

### Database Tables

`seasons`, `teams`, `players`, `rosters`, `games`, `game_stat_values`, `awards`, `stat_definitions`, `player_stat_values`, `sponsors`, `media_items`, `media_slots`, `content_blocks`, `login_attempts` (rate limiting).

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

**Two-repo model**: develop and test in this dev repo, then sync/PR into the production fork. GitHub Pages serves the fork's `main` branch at `farajleague.org`. Edge Functions deploy separately to Supabase (not via GitHub Pages). Migrations run via Supabase dashboard or `npx supabase db push` (apply in order 001–007).
