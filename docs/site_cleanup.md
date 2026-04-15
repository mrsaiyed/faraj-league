# Faraj League — Site Cleanup Plan

**Context**

- **Your repo** = development
- **Fork** = production (farajleague.org)
- **Flow**: develop in your repo → when ready, update fork → farajleague.org reflects changes
- **Scope**: Public site polish on the Standings tab and shared box score components

**Principles**

- **Static deployment** — Public site remains static (no build step). All changes are pure JS/HTML/CSS; no new API calls, no schema changes.
- **Transform at boundary** — All data shape changes stay in `js/data.js`; render logic in `js/render.js` consumes the existing `config.DB` shape unchanged.
- **No secrets in client** — No changes to auth or API surface.
- **Admin = public site + edit overlays** — Changes to shared render functions (`buildMatchupCard`, `renderStandings`, `renderBoxScore`) propagate to both public and admin automatically; no admin-specific overrides needed.
- **Admin editability** — No new hardcoded content. Week labels remain driven by `content_blocks.schedule_week_labels`; dates are derived from `scheduled_at` already in the data.

---

## Site Cleanup — Standings Tab & Box Score Polish

### Goal

Five targeted UI improvements to the public standings tab and shared box score component:

1. **PD column** — Add Point Differential (`PF − PA`) to each conference standings table.
2. **Unplayed games → "No results yet"** — In the Scores section of the standings tab, game cards for unplayed games are replaced with a "No results yet" message; only played game results are rendered.
3. **Hide future weeks from Scores dropdown** — The week dropdown on the Scores section only lists weeks that have at least one scored game; future weeks are not selectable and do not appear in the All Weeks view.
4. **Box score sorted by score** — When opening a game's box score, players are sorted by their point total (highest first) within each team's stat table.
5. **Date at week level, not game level** — Remove the per-game date label from each matchup card header. Show the date (derived from the first game's `scheduled_at`) in the week section header of both the Scores and Schedule sections.

---

### Agent tasks

1. **PD column in `renderStandings` (`js/render.js`)**
   - Add `<th>PD</th>` after `<th>PA</th>` in the dynamically generated table header.
   - Add `<td>${pd > 0 ? '+' + pd : pd}</td>` (where `pd = (r.pf||0) - (r.pa||0)`) to each team row.
   - Apply to both the `confGrid.innerHTML` branch and the fallback `tbody` branch.
   - Update static fallback header in `index.html` to include `<th>PD</th>` and bump `colspan` from 6 → 7 on the loading cell.

2. **Only played games in Scores section (`js/render.js` — `renderScores`)**
   - Inside the `rw(w)` helper, compute `const played = games.filter(g => g.s1 !== '' && g.s2 !== '')`.
   - If `played.length === 0`, return the "No results yet" card (removes the existing ambiguous `!g.s1 && !g.s2` check, which would false-positive on 0–0 scorelines).
   - Build matchup cards only from `played`, not all `games`.

3. **Scores week dropdown — played weeks only (`js/render.js`)**
   - Add a `buildScoresWeekDropdown()` helper that reads `config.DB.scores`, filters to played games, extracts unique weeks, sorts ascending, and populates `#scores-week-select` (with "All Weeks" as first option).
   - Replace the `buildWeekDropdown('scores-week-select', true)` call in `renderAll()` with `buildScoresWeekDropdown()`.
   - In the `renderScores` "all" branch: render only played weeks (derived from scores) instead of iterating all `TOTAL_WEEKS`.

4. **Sort box score stat table by points (`js/render.js` — `renderBoxScore`)**
   - Change `const roster1 = t1?.roster || []` and `const roster2 = t2?.roster || []` to shallow copies (`[...()]`) to avoid mutating `config.DB`.
   - After `getPoints` is defined, sort both rosters in-place: `roster1.sort((a, b) => getPoints(b.id) - getPoints(a.id))`.

5. **Date at week level, remove from card (`js/render.js`)**
   - In `buildMatchupCard`: remove `const dateStr = formatGameDate(g.scheduled_at)` and the `<span class="mc-meta-date">` element from the header band.
   - In `renderScores` → `rw(w)`: derive `weekDateStr` from `games.find(g => g.scheduled_at)?.scheduled_at` and append to the week heading (e.g. `Week 3 · Apr 5`).
   - In `renderSchedule` → `renderWeekBlock(w, label)`: same pattern — append `weekDateStr` to `label` so the schedule page week headers also carry the date now that the per-card date is gone.

### Your tasks

1. Load the standings tab and confirm:
   - Each conference table has a PD column showing `+N` / `−N` / `0`.
   - The Scores week dropdown lists only weeks with played games.
   - Selecting "All Weeks" shows only played weeks, with the date displayed beside the week heading (e.g. `WEEK 3 · APR 5`).
   - No VS matchup cards appear anywhere in the Scores section — only scored games or the "No results yet" placeholder.
2. Open a box score (click "View box score") and verify players are sorted from highest scorer to lowest within each team's table.
3. Open the Schedule tab and verify that week headings show the date (e.g. `WEEK 3 · APR 5`) and individual game cards no longer show a date.
4. Check that the home matchup cards and admin matchup cards look correct with the date removed.
5. Sync and PR into the production fork when satisfied.

---

## Schedule Card Time Centering & Home Page Date Label

**Commit**: `6a7a961`

### Changes

1. **Centered game time in matchup card header** (`js/render.js` — `buildMatchupCard`)
   - The CSS already set `.mc-meta-time { flex:1; text-align:center }` to center the time, but with only two flex children (Game N left, time right) the time was visually offset right.
   - Added an invisible ghost `<span class="mc-meta-game" aria-hidden="true" style="visibility:hidden">` on the right side to balance the left-side "Game N" label, making the time truly centered.

2. **Home page week subheader shows game date** (`js/render.js` — `renderHome`)
   - Derives `weekDateStr` from `weekGames.find(g => g.scheduled_at)?.scheduled_at` using the existing `formatGameDate` helper (returns e.g. `Apr 12`).
   - When a date is available it replaces the word "Previous" / "Results" / "Upcoming" — label reads `Week 3 · Apr 12`.
   - Falls back to the old text labels when no `scheduled_at` is present.
