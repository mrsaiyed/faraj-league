# Phase 3.7 — Admin mirrors public site + editable media slots

Execute these steps in order. **Agent** = tasks the Cursor agent does. **You** = manual steps you perform.

**Prerequisite:** Phase 1, Phase 2, Phase 2.5, Phase 3, Phase 3.5, and Phase 3.6 complete. Public site has Schedule tab, expandable box scores; admin has Games (with stat sheets), Stats, media_items CRUD, content_blocks for About and Draft.

---

## Refined business goal (core principle)

**Admin is the public site with edit overlays — nothing more.** The admin page must be an **exact copy** of the normal page. Same HTML structure, same CSS, same layout, same width, same background. The only addition: small Edit affordances overlaid on every editable text element. Admin controls (season switcher, season settings, logout) live in a **floating overlay** (e.g. a collapsible panel or drawer) that does **not** change the layout or width of the main content. No sidebar that squeezes content. No separate admin chrome.

**Critical:** Any layout change (sidebar, different container, different width) causes the admin to look different from the public site and fails the goal. The public site is the source of truth; admin layers edit capabilities on top.

---

## Principles

- **Admin = public + edit overlays** — Admin uses the **exact same HTML structure** as the public site. Same `<nav>`, same page divs, same `main.css`, same body background. Full-width content. Edit affordances (Edit buttons, pencil icons) are overlaid on each editable region. Admins see precisely what visitors see; they edit in context.
- **No layout-changing admin chrome** — No fixed sidebar. No container that narrows or alters the public layout. Admin-only UI (season switcher, season settings, logout) is a **floating overlay** (e.g. a button that opens a slide-out panel or modal). When closed, the page is indistinguishable from the public site.
- **Edit overlays on every editable text** — Every user-visible text that comes from the database or content is editable: hero badge, season tag, team names, captain names, player names, conference labels, media titles/URLs, about intro/secondary, section titles where applicable, etc. No permanently hardcoded "Coming soon" that admins cannot replace.
- **Shared render, shared structure** — Admin reuses the public `render*` functions and the same page markup. Single source of truth. Transform at boundary; config.DB shape unchanged.
- **Static deployment** — No build step. Public and admin remain static HTML + JS.
- **Admin ease of use** — Every save shows "Saved." or error feedback. Re-render after save so changes are visible immediately.

---

## Alignment with all_phases & business goal

- **all_phases.md Phase 3.7:** Admin literally displays the same page as the public site. Same layout, same width, same structure. Edit controls overlaid on editable regions. Media slots (Top Plays, Baseline Ep 1–3, Match Highlights G1–3) editable. No hardcoded "Coming soon" unless admin leaves a slot empty.
- **Business goal:** Admins see exactly what visitors see. Admin Home = public Home + Edit buttons. Admin Standings = public Standings + Edit Schedule. Admin Schedule = public Schedule + Edit per matchup. Admin Media = public Media + Edit per card. Admin About = public About + Edit on intro/secondary. **Admin Teams = public Teams + Edit on every text element** (team names, captains, player names, conference labels, section titles). Edit in context; no separate form-based dashboards.

---

## Step 1 — Agent: Schema migration (media_slots)

**Who:** Agent

**What:**

1. **Create `media_slots` table:**
   - `id UUID PRIMARY KEY DEFAULT uuid_generate_v4()`
   - `season_id UUID NOT NULL` REFERENCES seasons(id) ON DELETE CASCADE
   - `week INT NOT NULL`
   - `slot_key TEXT NOT NULL` — one of: `baseline_ep1`, `baseline_ep2`, `baseline_ep3`, `highlights_g1`, `highlights_g2`, `highlights_g3`
   - `title TEXT` — display label (e.g. "Episode 1", "Game 1 Highlights"); defaults from slot_key if null
   - `url TEXT` — link (e.g. Instagram URL); null/empty = show "Coming soon"
   - UNIQUE(season_id, week, slot_key)

2. **RLS:** Public SELECT on `media_slots`. Admin writes via Edge Function (service_role).

3. **Note:** `media_items` unchanged — continues to power Top Plays (flexible list per week). Admin Media tab already supports add/edit/delete for media_items.

**How:** In Agent mode:

> Implement Phase 3.7 Step 1 from phase3.7.md: Create media_slots table (season_id, week, slot_key, title, url). UNIQUE(season_id, week, slot_key). RLS public read.

---

## Step 2 — Agent: Content blocks for Home (hero_badge, season_tag)

**Who:** Agent

**What:**

1. **Extend `content_blocks` usage** — Add keys `hero_badge` and `season_tag` (same table; no migration if key is free-form).

2. **Public `renderAll` / `renderHome`:**  
   - `hero_badge`: use `contentBlocks.hero_badge` if present; else fallback to `${config.currentSeasonLabel} · Inaugural Season`.  
   - `season_tag`: use `contentBlocks.season_tag` if present; else fallback to derived `${teams.length} Teams · ${players.length} Players · Ages 17–30` or current static text.

3. **Admin Home section** will edit these via Edit overlays on the mirrored Home page (see Step 6). Save → admin-content with keys `hero_badge`, `season_tag`.

**How:** In Agent mode:

> Implement Phase 3.7 Step 2 from phase3.7.md: Use content_blocks hero_badge and season_tag for Home. Admin Home section edits these via admin-content.

---

## Step 3 — Agent: Edge Function for media_slots

**Who:** Agent

**What:**

1. **Create `admin-media-slots` Edge Function** (or extend `admin-media`):
   - Accepts `POST` with `Authorization: Bearer <token>` (X-Admin-Token)
   - Body: `{ season_id, week, slot_key, title?, url? }` — upsert by (season_id, week, slot_key)
   - Body: `{ bulk: [{ season_id, week, slot_key, title?, url? }, ...] }` — bulk upsert
   - Validation: slot_key in allowed list; season_id exists; week >= 1

2. **Upsert** into `media_slots` using service_role. Return success or 400 with message.

**How:** In Agent mode:

> Implement Phase 3.7 Step 3 from phase3.7.md: Create admin-media-slots Edge Function. Upsert media_slots by (season_id, week, slot_key).

---

## Step 4 — Agent: Data layer — fetch and transform media_slots

**Who:** Agent

**What:**

1. **Extend `lib/api.js` `getSeasonData`:**
   - Fetch `media_slots` for the season (filter by season_id).
   - Add `media_slots` to returned data.

2. **Extend `js/data.js` `transformSeasonData`:**
   - Build `mediaSlots` map: `{ [week]: { [slot_key]: { title, url } } }` or array of `{ week, slot_key, title, url }`.
   - Attach to config: `config.DB.mediaSlots`.

3. **Ensure `media_items`** continue to be fetched and transformed as today (Top Plays).

**How:** In Agent mode:

> Implement Phase 3.7 Step 4 from phase3.7.md: Extend getSeasonData to fetch media_slots. Add mediaSlots to transformSeasonData. Attach to config.DB.

---

## Step 5 — Agent: Admin layout — same structure as public, floating controls only

**Who:** Agent

**What:**

1. **Admin layout = public layout.** Admin page uses the **exact same structure** as the public site: same `<nav>` with the same tabs (Home, Standings, Schedule, Teams, Players, Stats, Awards, Draft, Media, About, Sponsors), same `main` container, same `css/main.css`. Same body background (`#060f1a`). Same width and spacing. The page content area is identical to the public site.

2. **Floating admin control (no sidebar):** A single floating control (e.g. "Admin" or gear icon) that does **not** change layout. When clicked, it opens a **drawer or modal** containing:
   - Season switcher (dropdown)
   - Season settings (is_current, current_week)
   - Logout

   When the drawer is closed, the page looks exactly like the public site.

3. **Page navigation:** Admin uses the same nav as the public site. Clicking Home, Standings, Schedule, etc. shows the same page content as the public tab. No separate admin sidebar tabs.

4. **Main content:** Each tab renders via the same `render*` functions as the public site. Pass `adminMode: true` so edit overlays are added. The rendered output is identical in structure; only the edit affordances differ.

5. **Edit overlays:** Every editable text element gets a small "Edit" affordance (button or pencil icon) overlaid. Click → inline editor or small modal. On save: show "Saved." or error; re-render. See Steps 6–10 and 12 for per-section details.

**How:** In Agent mode:

> Implement Phase 3.7 Step 5 from phase3.7.md: Admin uses the same HTML structure and layout as the public site (same nav, same main, same CSS). Add a floating "Admin" control that opens a drawer for season switcher, season settings, logout. No sidebar. Add edit overlay pattern for editable regions.

---

## Step 6 — Agent: Admin Home section (visual mirror)

**Who:** Agent

**What:**

1. **Admin Home** renders the **exact same Home page** as the public site — hero area, hero badge, season tag, historic banner (if applicable), standings snapshot, recent matchups, recent awards. Same HTML structure and CSS as public Home.

2. **Edit overlays** on editable regions:
   - **Hero badge** — Small "Edit" button near the badge text. Click → inline input or modal; save → admin-content with key `hero_badge`. On save: show "Saved." or error message; re-render.
   - **Season tag** — "Edit" button near the tag. Click → inline input or modal; save → admin-content with key `season_tag`. On save: show "Saved." or error message; re-render.
   - **Historic banner** — Derived from Awards. "Edit season awards" link or button → switches to Awards tab.
   - **Standings snapshot** — Read-only; "Edit Schedule" button → switches to Schedule tab.

3. **No separate form dashboard.** The admin sees the real Home page; edits happen in context via overlays.

4. **Wire** admin Home nav to load this section.

**How:** In Agent mode:

> Implement Phase 3.7 Step 6 from phase3.7.md: Admin Home section renders the actual public Home page (same layout, same CSS). Add Edit overlays on hero_badge and season_tag; Edit Schedule and Edit Awards links. No form-based preview.

---

## Step 7 — Agent: Admin Standings section (visual mirror)

**Who:** Agent

**What:**

1. **Admin Standings** renders the **exact same Standings page** as the public site — conference headers (Mecca, Medina), standings table, same layout and CSS. What you see is what the public sees.

2. **Edit overlay:** Standings are derived from games. Add "Edit Schedule" button (e.g., above or below the table) → switches to Schedule section where games/scores are edited. No form for standings; the table is read-only.

3. **Wire** admin Standings nav to load this section.

**How:** In Agent mode:

> Implement Phase 3.7 Step 7 from phase3.7.md: Admin Standings section renders the actual public Standings page (same layout, same CSS). Add "Edit Schedule" button to switch to Schedule. No separate form.

---

## Step 8 — Agent: Admin Schedule section (visual mirror)

**Who:** Agent

**What:**

1. **Admin Schedule** renders the **exact same Schedule page** as the public site — week dropdown, prev/focus/next week layout, matchup cards, scores, times, expandable box scores. Same layout and CSS as public Schedule.

2. **Edit overlays** on each matchup/game: "Edit" button on each card → opens form/modal to edit teams, scores, scheduled_at, or stat sheet. Or inline edit controls (e.g., score inputs) directly on the cards. Stat sheet entry works as today (expand to edit per-player stats). On save: show "Saved." or error message; re-render.

3. **Add game** — Button to add new matchup; same flow as existing Games CRUD.

4. **Wire** admin Schedule nav to load this section. Nav label "Schedule" (not "Games").

**How:** In Agent mode:

> Implement Phase 3.7 Step 8 from phase3.7.md: Admin Schedule section renders the actual public Schedule page (same layout, same CSS). Edit overlays on matchup cards for scores, times, stat sheets. Add game button. Nav label "Schedule".

---

## Step 9 — Agent: Admin Teams section (visual mirror)

**Who:** Agent

**What:**

1. **Admin Teams** renders the **exact same Teams page** as the public site — same conference headers (Mecca, Medina), same team cards, same roster layout. Same structure and CSS.

2. **Edit overlays** on every editable text:
   - **Season label / page title** — Edit button; save to content_blocks or season metadata.
   - **Conference headers** (Mecca, Medina) — Edit button per header if stored; or link to config.
   - **Team names** — Edit button on each team name; save via admin-teams.
   - **Captain names** — Edit button on each captain; save via admin-players or roster.
   - **Roster player names** — Edit button on each player; save via admin-players.
   - Any other user-visible text in Teams that comes from data.

3. **Wire** admin Teams nav to load this section. No separate form dashboard; edit in context.

**How:** In Agent mode:

> Implement Phase 3.7 Step 9 from phase3.7.md: Admin Teams section renders the actual public Teams page (same layout, same CSS). Add Edit overlays on season label, conference headers, team names, captains, roster player names. Save via admin-teams and admin-players.

---

## Step 10 — Agent: Admin Media tab (visual mirror)

**Who:** Agent

**What:**

1. **Admin Media** renders the **exact same Media page** as the public site — week dropdown, Top Plays section, Baseline Breakdown (Ep 1–3 cards), Match Highlights (G1–3 cards). Same `.video-card`, `.media-grid`, `.media-section-title` structure and CSS as public Media. Same width and layout.

2. **Edit overlays** on each slot:
   - **Top Plays** — Each item gets "Edit" / "Delete" buttons. "Add media item" button. On save: show "Saved." or error message; re-render.
   - **Baseline Ep 1–3, Highlights G1–3** — Each video card gets an "Edit" button. Click → inline inputs or small modal for Title and URL. Save → admin-media-slots. Default title "Episode 1" etc. when empty. On save: show "Saved." or error message; re-render.

3. **No separate form dashboard.** Admin sees the real Media page; edits happen on the cards themselves. Same look as public; edit affordances overlaid.

4. **Slot keys:** baseline_ep1, baseline_ep2, baseline_ep3, highlights_g1, highlights_g2, highlights_g3.

**How:** In Agent mode:

> Implement Phase 3.7 Step 10 from phase3.7.md: Admin Media section renders the actual public Media page (same layout, same CSS). Edit overlays on Top Plays items and on each Baseline/Highlights card. Inline or modal edit for title/URL. Save via admin-media-slots.

---

## Step 11 — Agent: Public Media page — consume media_slots

**Who:** Agent

**What:**

1. **Update `renderMedia` in js/render.js:**
   - Top Plays: unchanged — use `config.DB.mediaItems` filtered by week.
   - Baseline Ep 1–3: for each slot_key (baseline_ep1, baseline_ep2, baseline_ep3), lookup `config.DB.mediaSlots[week][slot_key]`. If url present, render video card with title and link. If url empty, render "Coming soon" placeholder (same look as today).
   - Match Highlights G1–3: same for highlights_g1, highlights_g2, highlights_g3.

2. **Preserve exact UI** — Same `.video-card`, `.media-grid`, `.media-section-title` structure. Only content (title, url vs placeholder) changes.

3. **Default titles** — If title empty, use "Episode 1", "Episode 2", "Episode 3", "Game 1 Highlights", etc.

**How:** In Agent mode:

> Implement Phase 3.7 Step 11 from phase3.7.md: Public renderMedia consumes mediaSlots for Baseline and Highlights. Show link when url present; "Coming soon" when empty. Preserve exact UI.

---

## Step 12 — Agent: Admin About section (visual mirror)

**Who:** Agent

**What:**

1. **Admin About** renders the **exact same About page** as the public site — about text block, Mecca/Medina conference accordions with sponsor taglines. Same layout and CSS as public About.

2. **Edit overlays** on each block:
   - **About text** — "Edit" button near the main text. Save → admin-content with key `about_text` (merged intro + secondary). Fallback: `about_intro` + `about_secondary` when `about_text` absent.
   - **Conference sponsor taglines** — "Edit" button on each accordion's tagline (e.g. "Mecca Conference — Brought to you by TOYOMOTORS"). Save → admin-content with key `about_conf_taglines` (JSON: `{ "mecca": "...", "medina": "..." }`). Newlines preserved.
   - **Conference lists** — Read-only (derived from teams). Link to Teams tab if reordering needed.

3. **Wire** admin About nav to load this section. No separate form dashboard.

**How:** In Agent mode:

> Implement Phase 3.7 Step 12 from phase3.7.md: Admin About section renders the actual public About page (same layout, same CSS). Edit overlays on about_text and about_conf_taglines (sponsor taglines in accordions). Save via admin-content.

---

## Step 13 — You: Deploy Edge Function

**Who:** You

**What:**

1. Deploy `admin-media-slots`:
   ```bash
   npx supabase functions deploy admin-media-slots
   ```
2. Ensure ADMIN_PASSWORD and JWT verification work.

**Verify:** Admin can save media slots and see "Saved." feedback.

---

## Step 14 — You: Test admin mirrors public

**Who:** You

**What:**

1. Navigate admin using the same nav as public site. Confirm order: Home | Standings | Schedule | Teams | Players | Stats | Awards | Draft | Media | About | Sponsors. Confirm Season switcher and Season settings accessible from floating Admin control (no sidebar).
2. **Visual mirror check:** Admin page must look identical to public page — same layout, same width, same structure. Admin Home, Standings, Schedule, Teams, Media, About should each look identical to the corresponding public page. Edit buttons are the only visible difference. No sidebar that narrows content.
3. Home: Click Edit on hero_badge and season_tag; save; confirm they appear on public Home.
4. Standings: Click "Edit Schedule"; switch to Schedule and edit a game.
5. Schedule: Edit a matchup (score, time); confirm it appears on public Schedule.
6. Media: Click Edit on Baseline Ep 1 and Highlights G1; add URL. Confirm they appear on public Media. Leave Ep 2 empty; confirm "Coming soon" still shows.
7. About: Click Edit on intro; save; confirm it appears on public About.
8. Teams: Edit team name, captain, player name; confirm they appear on public Teams.
9. Season settings: Edit is_current and current_week via floating Admin control; confirm behavior.

---

## Step 15 — You: Verify Phase 3.7 complete

**Who:** You

**What:** Confirm:

1. **Admin visually mirrors public** — Each admin tab (Home, Standings, Schedule, Teams, Media, About, Sponsors, etc.) displays the exact same layout as the public page. Same width, same structure. No form-based dashboards; edit controls are overlaid on the real page.
2. Admin nav: Home, Standings, Schedule, Teams, Stats, Awards, Draft, Media, About, Sponsors (player/roster management in Teams roster panel; no standalone Players tab).
3. Season settings editable from floating Admin control (no sidebar).
4. media_slots table exists; Baseline and Highlights editable per week via edit overlays on Media cards.
5. Public Media page shows links when URL set; "Coming soon" when empty.
6. hero_badge and season_tag editable via Edit overlays on admin Home.
7. No hardcoded "Coming soon" that admins cannot replace.
8. UI/layout identical between admin and public (admin = public + edit affordances).

---

## Phase 3.7 complete

All 15 steps have been implemented. Additional refinements beyond the original spec:

### Teams enhancements

- **Dynamic conferences** — `conferences_layout` in content_blocks: add/remove/edit conferences; full label editing via `display_label`.
- **Drag-and-drop** — Sortable.js for team reorder within conference and move between conferences.
- **Optimistic Add team** — New team added to `config.DB.teams` locally without full refresh; avoids newly added conferences disappearing.
- **Conference persistence** — Conference layout saves call refresh (loadAdminSeason) so admin view stays in sync.

### About page

- **Single `about_text` block** — Merged intro + secondary; fallback to `about_intro` + `about_secondary` when absent.
- **`about_conf_taglines`** — Editable sponsor taglines inside each conference accordion (JSON: `{ "mecca": "...", "medina": "...", "slug": "..." }`).
- **Sponsor derived from conference label** — When `display_label` matches `"SponsorName ConferenceType Conference"`, tagline defaults to that sponsor.

### Schedule & box score

- **Week/team filter persistence** — Preserved across edits (games, stat sheets).
- **Stat sheet modal** — Centered via flexbox.
- **Box score layout** — Redesigned: prominent score, team names above tables, clear division, alternating rows, points emphasized.

### Sponsors

- **Layout redesign** — Title sponsor, conference sponsors (Mecca | Medina), community partners; tier labels, responsive.
- **Newlines preserved** — `white-space: pre-line` on descriptions.
- **Medina fallback logo** — `images/wellness-logo.png` when no DB logo URL.

### Admin drawer

- Season settings form uses `.admin-drawer-form`, `.admin-drawer-form-row` for aligned layout.

---

## Summary

| Order | Who   | Step                                                                 |
|-------|-------|----------------------------------------------------------------------|
| 1     | Agent | Schema migration (media_slots)                                       |
| 2     | Agent | Content blocks for Home (hero_badge, season_tag)                     |
| 3     | Agent | Edge Function admin-media-slots                                      |
| 4     | Agent | Data layer: fetch media_slots, transform, config.DB.mediaSlots       |
| 5     | Agent | Admin layout: same structure as public; floating Admin control (no sidebar) |
| 6     | Agent | Admin Home section (hero_badge, season_tag edit overlays)            |
| 7     | Agent | Admin Standings section (read-only + link to Schedule)               |
| 8     | Agent | Admin Schedule section (Games renamed; edit overlays per matchup)    |
| 9     | Agent | Admin Teams section (edit overlays on all text)                      |
| 10    | Agent | Admin Media tab — slot editor (Baseline, Highlights)                 |
| 11    | Agent | Public Media page — consume media_slots                              |
| 12    | Agent | Admin About section (edit overlays on about_text, about_conf_taglines) |
| 13    | You   | Deploy admin-media-slots Edge Function                               |
| 14    | You   | Test admin mirrors public                                            |
| 15    | You   | Verify Phase 3.7 complete                                            |

---

## Data reference (for Agent)

**media_slots:**

| Column    | Type   | Notes                                   |
|-----------|--------|-----------------------------------------|
| id        | UUID   | PK                                      |
| season_id | UUID   | FK seasons                              |
| week      | INT    | Week number                             |
| slot_key  | TEXT   | baseline_ep1, baseline_ep2, baseline_ep3, highlights_g1, highlights_g2, highlights_g3 |
| title     | TEXT   | Display label (nullable)                |
| url       | TEXT   | Link; null/empty → "Coming soon"        |

**mediaSlots shape (config.DB):**

- Map: `{ [week]: { [slot_key]: { title, url } } }`  
- Example: `mediaSlots[1].baseline_ep1 = { title: "Episode 1", url: "https://..." }`

**content_blocks (extended keys):**

- hero_badge — Home hero badge text
- season_tag — Home season tag line (e.g. "6 Teams · 42 Players · Ages 17–30")
- about_text — Merged About intro + secondary (or legacy about_intro, about_secondary)
- about_conf_taglines — JSON `{ "mecca": "...", "medina": "...", "slug": "..." }` for sponsor taglines in conference accordions
- conf_name_mecca, conf_name_medina — Legacy conference names
- conferences_layout — JSON `{ conferences: [{ id, name, display_label?, sort_order }] }` for dynamic conferences

---

## Implementation approach for visual mirror

**Goal:** Admin is the public site with edit overlays. Same HTML structure, same layout, same width. No layout-changing admin chrome (no sidebar).

**Data loading:** Admin loads season data in the same shape as the public site. Use shared `lib/api.js` `getSeasonData` and `js/data.js` `transformSeasonData` so `config.DB` contains teams, scores, awards, mediaSlots, contentBlocks, etc. Shared render functions require this shape.

**Layout:** Admin page uses the **same HTML structure** as the public site: same `<nav>`, same `main`, same `css/main.css`, same body background. Admin-only UI (season switcher, season settings, logout) is a **floating control** that opens a drawer/modal. When closed, the page is indistinguishable from public.

**Render:** Reuse `js/render.js` functions with `adminMode: true` so they inject Edit affordances. Single source of truth. Add a small admin-only CSS overlay for Edit buttons. No separate admin layout or container that alters width or structure.

---

## Current state

**All steps complete.** Admin mirrors public with edit overlays. Teams has dynamic conferences, drag-and-drop, optimistic Add team. About uses `about_text` and `about_conf_taglines`. Sponsors redesigned and mirrored. Box score layout updated. Schedule preserves week/team filter; stat sheet modal centered.
