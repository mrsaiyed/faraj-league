# Phase 3.5 — Schedule tab (public site)

Execute these steps in order. **Agent** = tasks the Cursor agent does. **You** = manual steps you perform.

**Prerequisite:** Phase 1, Phase 2, Phase 2.5, and Phase 3 complete. Public site uses Supabase API; admin CRUD works; `games.scheduled_at` and `seasons.current_week` exist; `config.DB.scores` includes `scheduled_at`.

---

## Principles

- **Static deployment** — No build step; all changes are static HTML/JS.
- **Transform at boundary** — Use existing `config.DB.scores`; no new data fetches. Scores already include `scheduled_at` from Phase 3.
- **Consistency** — Schedule tab reuses styling and patterns from Standings/Scores (matchup cards, week labels).

---

## Alignment with all_phases & business goal

- **all_phases.md Phase 3.5:** Add dedicated Schedule tab so users can view the season schedule, navigate by week, and filter by team. Admin manages underlying data via Phase 3 Games CRUD.
- **Business goal:** Fans can browse the full schedule, see past results and upcoming game times. Homepage Recent Matchups/Awards show the previous week when `current_week` is set (e.g. week 4 → show week 3).

---

## Step 1 — Agent: Add Schedule nav tab and page structure

**Who:** Agent

**What:**

1. **Add Schedule nav tab** to `index.html`:
   - Insert between Standings and Teams: `<button class="nav-tab" onclick="showPage('schedule')">Schedule</button>`
   - Order: Home | Standings | **Schedule** | Teams | Stats | Awards | Draft | Media | About | Sponsors

2. **Add Schedule page** (`#page-schedule`):
   - Create `div#page-schedule.page` with:
     - Section header and sub (e.g. "Schedule", season label)
     - Week dropdown: `<select id="schedule-week-select">` — options Week 1 through TOTAL_WEEKS, default current week
     - Team filter dropdown: `<select id="schedule-team-filter">` — "All teams" + one option per team (by name)
     - Three content areas: `#schedule-prev`, `#schedule-focus`, `#schedule-next` for Previous week | Focus week | Next week
     - Footer (match existing page footers)

3. **Placement:** Insert `#page-schedule` after `#page-standings`, before `#page-teams`.

**How:** In Agent mode:

> Implement Phase 3.5 Step 1 from phase3.5.md: Add Schedule nav tab between Standings and Teams. Add page-schedule div with week dropdown, team filter, and three content areas (prev/focus/next week).

---

## Step 2 — Agent: Implement renderSchedule and game cards

**Who:** Agent

**What:**

1. **Create `renderSchedule(focusWeek, teamFilter)` in `js/render.js`:**
   - `focusWeek`: selected week (1..TOTAL_WEEKS)
   - `teamFilter`: team name or null for "All teams"
   - For each of prev (focusWeek-1), focus (focusWeek), next (focusWeek+1):
     - Hide prev section when focusWeek === 1
     - Hide next section when focusWeek === TOTAL_WEEKS
     - Filter `config.DB.scores` by week; if teamFilter set, keep only games where that team is t1 or t2
   - For each game: show matchup (t1 vs t2), and either:
     - **Past weeks** (s1/s2 present): show scores, winner tag
     - **Future/current weeks**: show time from `scheduled_at` (formatted, e.g. "Wed 6:00 PM") or "TBD" if null
   - Reuse matchup-card styling from renderScores / home matchups

2. **Game card content:**
   - Game label (Game 1, 2, 3)
   - Team names
   - Past: scores, winner
   - Future: time or TBD

**How:** In Agent mode:

> Implement Phase 3.5 Step 2 from phase3.5.md: Add renderSchedule(focusWeek, teamFilter) in js/render.js. Show prev/focus/next week; past weeks show scores, future show scheduled_at or TBD. Filter by team when teamFilter set. Reuse matchup-card styles.

---

## Step 3 — Agent: Wire Schedule to app and renderAll

**Who:** Agent

**What:**

1. **In `js/app.js`:**
   - Import `renderSchedule` from `./render.js`
   - Add `renderSchedule(config.CURRENT_WEEK, null)` to `renderAll()` (or equivalent so Schedule is populated on load)
   - Expose `window.renderSchedule = renderSchedule` if Schedule page uses dropdown onchange handlers

2. **In `index.html` Schedule page:**
   - `schedule-week-select` onchange: call `renderSchedule(parseInt(this.value), teamFilterValue)` and update team filter value from DOM
   - `schedule-team-filter` onchange: call `renderSchedule(weekValue, this.value || null)`
   - Ensure dropdowns are populated: week options from 1..config.TOTAL_WEEKS; team options from config.DB.teams

3. **Populate dropdowns on load:**
   - `buildWeekDropdown` or inline: populate schedule-week-select with Week 1..TOTAL_WEEKS, default config.CURRENT_WEEK
   - Team filter: "All teams" + config.DB.teams.map(t => t.name)

4. **showPage('schedule'):** Already works if `#page-schedule` exists and nav button calls `showPage('schedule')`. Ensure nav-tab active state matches (showPage compares text; "Schedule" → "schedule").

**How:** In Agent mode:

> Implement Phase 3.5 Step 3 from phase3.5.md: Wire renderSchedule to app.js renderAll. Populate schedule-week-select and schedule-team-filter; onchange handlers call renderSchedule with selected week and team. Expose renderSchedule on window if needed.

---

## Step 4 — Agent: Verify homepage previous-week display

**Who:** Agent

**What:**

1. **Confirm `renderHome()` in `js/render.js`:**
   - Uses `displayWeek = Math.max(1, config.CURRENT_WEEK - 1)` for Recent Matchups and Recent Awards
   - Labels show "Week X · Previous" when displayWeek < config.CURRENT_WEEK
   - If not present, add this logic so homepage shows previous week's data when current_week is set in admin

2. **No new data fetches** — `config.CURRENT_WEEK` comes from `season.current_week` (set in app.js from fetchSeasonData).

**How:** In Agent mode:

> Implement Phase 3.5 Step 4 from phase3.5.md: Verify renderHome uses displayWeek = current_week - 1 for Recent Matchups and Recent Awards. Ensure labels say "Week X · Previous" when showing previous week. Fix if missing.

---

## Step 5 — You: Test Schedule tab

**Who:** You

**What:**

1. Run `npx serve .` (or your local server). Open the public site.
2. Click **Schedule** in the nav. Confirm:
   - Schedule page loads
   - Week dropdown shows weeks 1..N; default is current week
   - Three sections: Previous week | Focus week | Next week (prev hidden at Week 1, next hidden at last week)
   - Past weeks show scores; future/current weeks show time or "TBD"
3. Change week dropdown; confirm content updates.
4. Change team filter to a specific team; confirm only that team's games appear across the three sections.
5. Change season (if multiple seasons); confirm Schedule reflects selected season.
6. Set `current_week` to 4 in admin (Seasons). Refresh public site. Confirm homepage "Recent Matchups" and "Recent Awards" show Week 3 · Previous.

**Verify:** No console errors; Schedule styling matches Standings/Scores.

---

## Step 6 — You: Verify Phase 3.5 complete

**Who:** You

**What:** Confirm:

1. Schedule tab appears in nav between Standings and Teams.
2. Week dropdown and team filter work; three-section layout (prev/focus/next) displays correctly.
3. Past weeks show scores; upcoming weeks show scheduled time or TBD.
4. Homepage Recent Matchups and Recent Awards show previous week's data when `current_week` is set (e.g. week 4 → week 3).
5. All changes are static; no new Edge Functions or migrations required.

---

## Summary

| Order | Who   | Step                                                                 |
|-------|-------|----------------------------------------------------------------------|
| 1     | Agent | Add Schedule nav tab and page structure (HTML)                       |
| 2     | Agent | Implement renderSchedule (prev/focus/next, scores vs time/TBD)       |
| 3     | Agent | Wire Schedule to app.js, dropdowns, renderAll                        |
| 4     | Agent | Verify homepage previous-week display                                |
| 5     | You   | Test Schedule tab (week, team filter, scores, times)                 |
| 6     | You   | Verify Phase 3.5 complete                                            |

---

## Data reference (for Agent)

**Scores shape (config.DB.scores):**

| Field        | Type   | Notes                                      |
|--------------|--------|--------------------------------------------|
| week         | int    | Week number                                |
| game         | int    | Game index (1, 2, 3)                       |
| t1, t2       | string | Team names                                 |
| s1, s2       | string | Scores (empty if not played)               |
| scheduled_at | string | ISO timestamp or null (from games table)   |

**Config:**

- `config.CURRENT_WEEK` — from `season.current_week` or derived
- `config.TOTAL_WEEKS` — from season/games
- `config.DB.teams` — for team filter options

**Format scheduled_at:** Use `new Date(scheduled_at).toLocaleString()` or similar for display; fallback "TBD" when null.
