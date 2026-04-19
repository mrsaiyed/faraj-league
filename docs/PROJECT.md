# Faraj League — Project Overview

This repository contains the code for the **Faraj League** public site (farajleague.org) and its admin app. It is a **static frontend** backed by **Supabase** (PostgreSQL + Edge Functions). Public site and admin deploy as static assets; writes go through Edge Functions.

---

## Current Position

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1 | ✅ Complete | DB schema, Supabase project, public API, seed data |
| Phase 2 | ✅ Complete | Public site uses Supabase API instead of Google Sheets |
| Phase 2.5 | ✅ Complete | Code refactored into `js/`, `css/`, `lib/` modules |
| Phase 3 | ✅ Complete | Admin v1: login, CRUD for seasons, teams, players, games, awards, stats, sponsors, media, draft |
| Phase 3.5 | ✅ Complete | Schedule tab (public site); homepage previous week |
| Phase 3.6 | ✅ Complete | Game stat sheets; live scores for fans |
| Phase 3.7 | ✅ Complete | Admin = public + edit overlays; floating controls; media slots; dynamic conferences; Sponsors redesign |
| Phase 4 | ✅ Complete | Draft UI: player bank, drag/drop, captain assign, team reorder, Players tab, Add Players bulk, draft timer |
| Phase 5 | ✅ Complete | Hardening: rate limiting, CSV export, tests |
| Schedule / Edit Full Schedule | ✅ Complete | FSE layout + mount/Back; `content_blocks` keys (`schedule_slots_by_week`, `schedule_week_labels`, `schedule_dates_by_week`); public week headings; admin game datetime handling for correct `scheduled_at` display — see **`docs/schedule_tab_fix.md`** |
| Duplicate game fix | ✅ Complete | Double-submit guard on all three game modal forms (`openMatchupModal` FSE, `openGameModal` in `renderSchedule` and `attachScheduleAdminOverlays`): submit button disabled on first click, re-enabled only on error. No DB unique constraint exists, so this is the sole guard. |
| Matchup card redesign | ✅ Complete | New `buildMatchupCard()` helper in `js/render.js`; used by `renderSchedule`, `renderScores`, `renderHome`. Card has: darker header band (`#091c2b`) with gold bottom border showing Game N / time / date (left/center/right, no duplicate); horizontal body row with away logo+name (left, white) and home name+logo (right, teal); VS with faint gold decoration behind it; "View box score" below VS; winner tag as full-width teal strip. Team logos served from `images/teams/` via `TEAM_LOGOS` map + `teamLogoUrl()` with initials fallback. |
| Schedule tab — All Weeks view | ✅ Complete | Default view shows all weeks grouped into **Past** (collapsible, collapsed by default), **Current Week**, and **Upcoming** sections. Section headers are larger than week sub-labels. Sectioning is always derived from `config.CURRENT_WEEK` (admin setting), never the dropdown. Week dropdown gains "All Weeks" as default first option; selecting a specific week shows only that week. `#schedule-all-content` added to DOM alongside the preserved `#schedule-prev/focus/next` for admin FSE compatibility. |
| Clickable homepage | ✅ Complete | Every meaningful home page element is a navigation entry point. Quick-stats bar tiles (Teams/Players/Conferences → `#teams`; Weeks Played → `#schedule`). Standings heading → `#standings`. Each home-standings team row → `#teams` + opens that team's roster panel via `navToTeam(teamName)` (pending-navigation pattern in `js/app.js`). Recent matchup cards → `#schedule` + smooth-scrolls to that week via `navToMatchup(week)`. Recent Awards heading and award cards → `#awards`. All clickable regions have `cursor:pointer` and hover states. Browser back button supported throughout. Admin unaffected. See `docs/clickable_homepage.md`. |
| Mobile hamburger nav | ✅ Complete | On mobile the tab bar is hidden; a hamburger button (top-left, labelled MENU) opens a slide-in drawer containing all nav tabs. Season select moved to drawer footer on mobile. Faraj League logo centered in mobile nav header. |
| Teams page redesign | ✅ Complete | Horizontal team cards with Record and Seed badge; team logos shown in circular frames (same crop/scale as schedule cards). `calcSeeds()` in `lib/standings.js` computes seeds with H2H / point-differential / points-for tiebreakers. 3-column grid layout. Gold team names, larger stat labels, 1.5× logo circles (56 → 84 px). Roster panel opens below the clicked card on mobile and at the bottom on desktop. Roster panel header shows team name and conference only (captain and record removed from header). |

---

## Tech Stack

- **Public site**: Static HTML, CSS, JS (ES modules); no build step
- **Admin**: Static SPA at `/admin`; uses the **same structure** as the public site (same nav, same layout, same width); floating Admin control (drawer) for season switcher, settings, logout; Edit overlays on every editable region; password login; CRUD via Edge Functions
- **Backend**: Supabase (PostgreSQL, RLS, Edge Functions)
- **Auth**: Shared password → JWT; admin writes require valid token
- **Hosting**: GitHub Pages (static); Supabase hosts API and Edge Functions

---

## Repository Structure

```
├── index.html           # Public site entry
├── css/main.css         # Public site styles
├── js/
│   ├── config.js        # API URL, anon key, sponsor constants
│   ├── data.js          # fetchSeasons, fetchSeasonData, transform
│   ├── render.js        # renderHome, renderStandings, etc.
│   └── app.js           # loadAll, changeSeason, init
├── lib/api.js           # Supabase queries (getSeasons, getSeasonData)
├── admin/
│   ├── index.html       # Admin SPA
│   ├── css/             # Admin overlays
│   └── js/
│       ├── admin.js     # Login, token, adminFetch, nav
│       ├── sections.js  # CRUD UI per entity
│       ├── draft-drag-drop.js   # Draft DnD handlers
│       └── draft-timer.js       # Draft timer/rounds
├── supabase/
│   ├── migrations/      # Schema (002_phase3_schema.sql)
│   └── functions/       # auth-login, admin-*
├── docs/
│   ├── all_phases.md    # Master plan (phases 1–5)
│   ├── phase3.md        # Phase 3 step-by-step
│   ├── API.md           # API reference
│   └── PROJECT.md       # This file
└── .env                 # SUPABASE_URL, SUPABASE_ANON_KEY, ADMIN_PASSWORD
```

---

## Data Architecture

### Supabase Tables

- **seasons** — slug, label, is_current, current_week
- **teams**, **players**, **rosters** — teams and rosters per season
- **games** — week, game_index, home/away, scores, scheduled_at
- **awards** — weekly (akhlaq, motm1–3) and season (champ, mvp, scoring)
- **stat_definitions**, **player_stat_values** — stats (points, etc.)
- **sponsors** — per-season sponsor overrides
- **media_items** — Media page Top Plays by week
- **media_slots** — Media page Baseline Episodes and Match Highlights (season_id, week, slot_key, title, url)
- **content_blocks** — Editable copy (hero_badge, season_tag, about_text, about_conf_taglines, conferences_layout, draft_recap, draft_placeholder, draft_team_order, media_layout, sponsor tiers); schedule metadata (`schedule_week_labels`, `schedule_slots_by_week`, `schedule_dates_by_week`) for Edit Full Schedule / public week headings

### Public Data Flow

1. `fetchSeasons()` → list seasons; default to `is_current`
2. `fetchSeasonData(slug)` → teams, games, awards, stats, sponsors, media_items, media_slots, content_blocks
3. `transformSeasonData()` maps Supabase shape → app `DB` shape
4. `renderAll()` updates UI from `config.DB`

### Admin Data Flow

1. Login → `auth-login` Edge Function → JWT stored in localStorage
2. Reads: direct Supabase client (anon key, public RLS)
3. Writes: `adminFetch(fnName, body)` → Edge Function with `X-Admin-Token` + anon key

---

## Overall Goals

1. **farajleague.org** remains a static site; content editable via admin
2. **Admin** lets league staff manage seasons, teams, players, games, awards, stats, sponsors, media, and draft content
3. **Admin = public + edit overlays (Phase 3.7)**: Admin is the public site with Edit affordances layered on top. Same HTML structure, same layout, same width — no sidebar. Admin controls (season switcher, settings, logout) live in a floating drawer. Edit overlays on every editable text: hero badge, season tag, team names, captains, player names, conference labels (dynamic conferences via conferences_layout), media titles/URLs, about text, sponsor taglines in About accordions, etc. Nav: Home, Standings, Schedule, Teams, Players, Stats, Awards, Draft, Media, About, Sponsors. All media slots editable; no hardcoded "Coming soon" that admins cannot replace. Every save shows success/error feedback.
4. **Phase 3.6**: Digital stat sheets; live entry during games; live scores for fans
5. **Phase 4** *(complete)*: Interactive draft UI with player bank, drag/drop (bank↔team, team↔team, team reorder), captain drag-and-drop, Players tab (CRUD + bulk delete), Add Players bulk, draft timer
6. **Phase 5**: Rate limiting, CSV export, tests

**Engineering principles (preserved):** Static deployment, transform at boundary, no secrets in client. Admin mirrors public so admins edit in context — same render functions, same CSS, same layout. The admin page is the public page with edit overlays; no separate admin chrome that alters structure or width.

---

## Outlook

**Phase 5:** ✅ Complete — rate limiting on login, CSV export for backup, tests for standings and stat aggregation.

**Post–Phase 5:** One-time import from Google Sheets (if needed); ongoing maintenance and feature refinements.

**Schedule tab initiative:** ✅ Complete — **`docs/schedule_tab_fix.md`** (companion: **`docs/schedule_tab_fix_steps_plan.md`**; original issue list: **`docs/schedule-fixes-plan.md`** — superseded).

**Schedule card redesign (complete):** Team logos (`images/teams/`) shown in circular frames on each matchup card. New horizontal layout: away logo+name left, home name+logo right, VS center with faded decoration, "View box score" below. Header band separated from matchup body. All-weeks view with Past/Current/Upcoming sections. See Implementation summary in `docs/schedule_tab_fix.md`.

**Clickable homepage (complete):** All home page elements are navigation entry points — stats bar, standings header, team rows (deep-link to team panel), matchup cards (deep-link to schedule week), awards. See `docs/clickable_homepage.md`.

**Mobile hamburger nav (complete):** Slide-in drawer replaces tab bar on mobile. Hamburger top-left, season select in drawer footer, Faraj League logo centered in mobile header.

**Teams page redesign (complete):** Horizontal cards with logos, Record, Seed badge; `calcSeeds` H2H/PD/PF tiebreakers; 3-column grid; gold team names; roster panel opens in-context below card on mobile.

**North star — Complete customization:** The long-term goal is that the admin never has to touch the code or database. All content, structure, and layout should be editable through the admin UI. Every phase we ship is a stepping stone toward that, but none of them reach it fully. We keep adding editable pieces (media layout, sponsor tiers, conferences, etc.); the next step is awards customization (editable titles, add sections, add blocks), then more tiles and config until the admin can control everything.

---

## Deploy Flow

- **Dev repo** (this repo) → develop and test locally
- **Fork** → production; merge when ready
- **farajleague.org** → served from fork (GitHub Pages)
- **Edge Functions** → deploy separately: `npx supabase functions deploy <name>`

---

## References

- **all_phases.md** — Full phase plan with principles, agent tasks, prompt templates
- **schedule_tab_fix.md** — Schedule tab & Edit Full Schedule initiative (✅ complete)
- **schedule_tab_fix_steps_plan.md** — Condensed implementation plan for that initiative
- **schedule-fixes-plan.md** — Original schedule issue list (superseded by `schedule_tab_fix.md`)
- **phase3.md** — Phase 3 implementation checklist
- **phase3.5.md** — Phase 3.5 Schedule tab implementation
- **phase3.6.md** — Phase 3.6 Game stat sheets implementation
- **phase3.7.md** — Phase 3.7 Admin visual mirror; editable media slots
- **phase4.md** — Phase 4 Draft UI (player bank, drag/drop, autosave) ✅
- **phase5.md** — Phase 5 Hardening (rate limiting, CSV export, tests)
- **API.md** — Public API and Supabase query patterns
