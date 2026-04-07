# Clickable Homepage — Navigation from Home Page Elements

Make every meaningful element on the home page a navigation entry point. Users should be able to tap any stat, standing, matchup, or award and land on the relevant tab in context.

Execute steps in order. **Agent** = tasks the Cursor/Claude agent does. **You** = manual verification steps.

**Prerequisite:** Hash-based routing (`#teams`, `#standings`, `#schedule`, `#awards`) is already live. `showPage(id)` pushes state and activates the correct tab.

---

## Principles

- **No new pages or routes** — all destinations already exist. This feature is purely navigation wiring and CSS cursor affordances.
- **Static, no build step** — all changes are in `index.html`, `js/render.js`, `js/app.js`, and `css/main.css`. No new files required.
- **Deep-link via state, not URL params** — hash routing is already `#page-id` only. For sub-page targets (specific team panel, specific matchup week), pass intent through a lightweight in-memory pending-navigation object cleared immediately after use. Do not introduce query strings or fragment subpaths.
- **Progressive enhancement** — elements that were divs become anchor tags or gain `role="link"` + `tabindex="0"` + `cursor:pointer` so keyboard and screen-reader users benefit too.
- **Touch-friendly** — clickable regions should have at least 44px hit targets. Use padding, not just font size, to achieve this.
- **Admin unaffected** — `admin/index.html` mirrors the public layout but admin overlays own those elements. Do not wire home-page click handlers in admin JS.

---

## Step 1 — Agent: Quick-stats bar → tab navigation

**Who:** Agent

**What:**

The four `.qs-item` tiles on the home page (`index.html` lines 59–62) are currently static divs.

1. **Wrap each `.qs-item` in `<a>` tags** (or add `href` and convert to `<a>`) so they navigate on click:
   - **Teams (6)** → `href="#teams"` — routes to the Teams & Rosters tab
   - **Players (42)** → `href="#teams"` — routes to the Teams & Rosters tab (players are listed within team rosters)
   - **Conferences (2)** → `href="#teams"` — routes to the Teams & Rosters tab
   - **Weeks Played (0 / dynamic)** → `href="#schedule"` — routes to the Schedule tab

2. The `href="#page"` links already trigger `showPage()` via the `popstate` listener and the nav `<a>` pattern established in the routing commit. Ensure `.qs-item` links follow the same `<a href="#pageid">` pattern used by nav tabs so clicking calls `showPage()` consistently (add `onclick="showPage('teams');return false;"` if needed to match nav tab behavior).

3. **CSS:** Add `cursor:pointer` and a subtle hover state (e.g. slight brightness lift or underline on the `.qs-num`) to signal interactivity. Do not change layout or font size.

**Files:** `index.html`, `css/main.css`

---

## Step 2 — Agent: Standings section header → Standings tab

**Who:** Agent

**What:**

The `<h2 class="section-title" id="home-standings-title">Standings</h2>` heading on the home page (and its `.section-sub` label above it) should navigate to the Standings tab on click.

1. Wrap both the `#home-standings-sub` paragraph and `#home-standings-title` heading in a single `<a href="#standings" onclick="showPage('standings');return false;">` (or wrap in a `<div>` with the click handler and `cursor:pointer`). Keep existing IDs so `render.js` can still set their text content.

2. Add a subtle "→" indicator or hover underline on the heading only (not the sub-label) so it reads as a link without breaking the visual hierarchy.

3. **CSS:** `cursor:pointer` on the wrapper; `text-decoration:none` so it doesn't look like a hyperlink unless hovered.

**Files:** `index.html`, `css/main.css`

---

## Step 3 — Agent: Home standings rows → specific team on Teams tab

**Who:** Agent

**What:**

Each team row rendered inside `#home-standings` (built in `render.js` → `buildHomeStandingsBlock`) currently shows rank, name, and record. Clicking a team row should navigate to the Teams tab and open (expand) that team's roster panel.

1. **In `render.js` `buildHomeStandingsBlock`:** Add `data-team-name` attribute and `cursor:pointer` / click handler to each `.home-stand-row`:
   ```html
   <div class="home-stand-row" data-team-name="${r.name}" onclick="navToTeam('${escapeJs(r.name)}')">
   ```

2. **Add `navToTeam(teamName)` to `js/app.js`:**
   - Store `teamName` in a module-level `pendingTeamOpen` variable.
   - Call `showPage('teams')`.
   - After the page is shown (use `requestAnimationFrame` or `setTimeout(0)` to yield to the DOM), find the team panel that matches `teamName`, call its open/expand function, and scroll it into view.
   - Clear `pendingTeamOpen` immediately after use.

3. **Teams page panel open mechanism:** Inspect how team panels are opened in `render.js` (the existing click handler on team cards). Extract or reuse that open logic into a callable function `openTeamPanel(teamName)` so `navToTeam` can invoke it after navigation.

4. **CSS:** Add `cursor:pointer` and hover row highlight to `.home-stand-row` in `css/main.css`.

**Files:** `js/app.js`, `js/render.js`, `css/main.css`

---

## Step 4 — Agent: Recent Matchups → Schedule tab at that week

**Who:** Agent

**What:**

Each matchup card in `#home-matchups` (rendered by `buildMatchupCard` in `render.js`) should navigate to the Schedule tab and scroll to the corresponding week section.

1. **In `render.js` matchup card template:** Add `data-week` attribute and click handler to each matchup card:
   ```html
   <div class="mc-card" data-week="${g.week}" onclick="navToMatchup(${g.week})">
   ```
   Ensure this does not break existing card styling or inner click targets.

2. **Add `navToMatchup(week)` to `js/app.js`:**
   - Store `week` in a module-level `pendingMatchupWeek` variable.
   - Call `showPage('schedule')`.
   - After navigation (via `requestAnimationFrame` or `setTimeout(0)`), find the week section on the schedule page that corresponds to `week` (by `data-week` attribute or week heading), scroll it into view with `{ behavior: 'smooth', block: 'start' }`.
   - Clear `pendingMatchupWeek` immediately after use.

3. **Schedule page week structure:** Inspect `renderSchedule()` in `render.js` to confirm each week block has an identifiable attribute or ID (e.g. `id="week-${n}"` or `data-week="${n}"`). If not present, add it during the schedule render so `navToMatchup` has a reliable scroll target.

4. **CSS:** Add `cursor:pointer` to `.mc-card` in `css/main.css` (if not already present).

**Files:** `js/app.js`, `js/render.js`, `css/main.css`

---

## Step 5 — Agent: Recent Awards → Awards tab

**Who:** Agent

**What:**

The Recent Awards section on the home page has two clickable surfaces:
- The section heading `<h2 class="section-title">Recent Awards</h2>` (and its `.section-sub` label)
- Each individual award card inside `#home-awards`

Both should navigate to the Awards tab.

1. **Section heading:** Wrap the `#home-awards-sub` paragraph and the "Recent Awards" `<h2>` in a clickable container (same pattern as Step 2 for Standings heading): `onclick="showPage('awards');return false;"`.

2. **Individual award cards:** In `render.js` inside the `#home-awards` render block, add `onclick="showPage('awards');return false;"` and `style="cursor:pointer"` (or a CSS class) to each award card element (`.award-card`).

3. **CSS:** `cursor:pointer` on `.home-awards-grid .award-card`; subtle hover state (brightness or border highlight) consistent with the matchup card hover in Step 4.

**Files:** `js/render.js`, `index.html`, `css/main.css`

---

## Step 6 — You: Visual QA checklist

**Who:** You

**What:** Open the live site and verify each clickable region:

1. **Quick-stats bar:**
   - [ ] Clicking "6 Teams" → lands on `#teams`
   - [ ] Clicking "42 Players" → lands on `#teams`
   - [ ] Clicking "2 Conferences" → lands on `#teams`
   - [ ] Clicking "0 Weeks Played" → lands on `#schedule`
   - [ ] Each tile shows `cursor:pointer` on hover

2. **Standings header:**
   - [ ] Clicking "Standings" heading → lands on `#standings`
   - [ ] Hover shows pointer + subtle underline

3. **Home standings rows:**
   - [ ] Clicking a team row → lands on `#teams` with that team's panel open and scrolled into view
   - [ ] Row shows `cursor:pointer` and hover highlight

4. **Recent Matchups:**
   - [ ] Clicking a matchup card → lands on `#schedule` scrolled to that week
   - [ ] Card shows `cursor:pointer`

5. **Recent Awards:**
   - [ ] Clicking "Recent Awards" heading → lands on `#awards`
   - [ ] Clicking any award card → lands on `#awards`
   - [ ] Both heading and cards show `cursor:pointer`

6. **Browser back button** navigates back to home after each of the above.

---

## Summary

| Step | Who   | What                                                                 | Files                              |
|------|-------|----------------------------------------------------------------------|------------------------------------|
| 1    | Agent | Quick-stats bar (Teams/Players/Conferences → #teams, Weeks → #schedule) | `index.html`, `css/main.css`      |
| 2    | Agent | Standings heading → #standings                                       | `index.html`, `css/main.css`       |
| 3    | Agent | Home standings team row → #teams + open that team's panel            | `js/app.js`, `js/render.js`, `css/main.css` |
| 4    | Agent | Recent matchup card → #schedule + scroll to that week                | `js/app.js`, `js/render.js`, `css/main.css` |
| 5    | Agent | Recent Awards heading + award cards → #awards                        | `js/render.js`, `index.html`, `css/main.css` |
| 6    | You   | Visual QA across all clickable regions                               | —                                  |

---

## Implementation notes for Agent

**Pending navigation pattern (Steps 3 & 4):**
```js
// In app.js
let pendingTeamOpen = null;
let pendingMatchupWeek = null;

export function navToTeam(teamName) {
  pendingTeamOpen = teamName;
  showPage('teams');
  requestAnimationFrame(() => {
    if (pendingTeamOpen) { openTeamPanel(pendingTeamOpen); pendingTeamOpen = null; }
  });
}

export function navToMatchup(week) {
  pendingMatchupWeek = week;
  showPage('schedule');
  requestAnimationFrame(() => {
    if (pendingMatchupWeek !== null) {
      const el = document.querySelector(`[data-week="${pendingMatchupWeek}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      pendingMatchupWeek = null;
    }
  });
}
```

**Escape helper for inline onclick strings:** Any team name interpolated into an `onclick="..."` string must be JS-escaped (single quotes escaped). Prefer `data-*` attributes + delegated listeners over inline onclick where team names may contain special characters.

**Do not touch:**
- Admin JS or admin overlays
- The `showPage` function signature or hash routing logic
- Matchup card inner elements (score, logos) — the click handler should be on the card wrapper only and must not interfere with any inner interactivity
