# Schedule tab & Edit Full Schedule — fix plan

**Status:** ✅ **Complete** — Steps 1–7 implemented and **verified on production** (farajleague.org, April 2026). BR-1–BR-6 satisfied; Step 7.3 regressions (R1–R6) addressed in code; static assets deploy via GitHub Pages (fork sync). Additional fix: **admin Edit game / Games tab** naive `datetime-local` values are converted to UTC ISO before `admin-games` (`scheduledAtInputToIso` / `scheduledAtToDatetimeLocalValue` in `admin/js/sections.js`) so displayed times match local intent.

Execute these steps in order unless noted as parallel. **Agent** = tasks the Cursor agent implements. **You** = manual steps (Supabase dashboard, deploy, verification).

**Prerequisite:** Admin login works; `admin-games`, `admin-seasons`, `admin-content` deployed; `seasons.total_weeks` migration applied (`007_total_weeks.sql`) if you use total weeks in UI.

**Implementation plan (condensed):** [`schedule_tab_fix_steps_plan.md`](./schedule_tab_fix_steps_plan.md) — same scope as the Cursor plan `schedule_tab_fix_steps_1-6`, kept in-repo for version control.

---

## Business requirements (must be met)

These are acceptance criteria for this initiative. Implementation follows the numbered steps below.

| # | Requirement |
|---|-------------|
| **BR-1** | **Matchups:** In **Edit Full Schedule**, for each week and each active game slot, admins can set **home vs away** using **team dropdowns** and save to the database. Creating a new matchup uses **+ Add**; changing teams uses **Edit** on a filled slot (see **Matchup editing workflow** below). |
| **BR-2** | **Back navigation:** After opening Edit Full Schedule, **Back** returns to the normal Schedule tab with prev / current / next week columns working; schedule data repaints. |
| **BR-3** | **Slot visibility:** Default **3** slots per week; admins can **hide** slot rows per week (e.g. week 7 only one game) via minus/plus (or equivalent), persisted in `content_blocks`. **Rule:** If a game **already exists** in a slot the admin tries to remove from the UI, **block** the action until the admin **removes the game** first (or explicitly deletes that game)—do not silently drop rows. |
| **BR-4** | **Week titles:** Admins can edit a **custom title/description per week** in the full editor. **The public site must display these custom labels** on the schedule (not admin-only). Fallback when a week has no custom label: **`Week N`** (or equivalent). |
| **BR-5** | **Public schedule integrity:** Fixes do not break the public schedule page; `renderSchedule` continues to reflect `games` and, when implemented, `schedule_week_labels` from the same data boundary (`transformSeasonData` / `config`). |
| **BR-6** | **Principles:** Static deployment, writes only via Edge Functions, admin as public mirror — unchanged (see Principles). |

---

## Principles

- **Static deployment** — No bundler; admin remains static HTML/JS. Changes are `admin/js/*.js`, `admin/css/*.css`, and `js/data.js` / `js/render.js` where public reads require new `content_blocks` keys.
- **Writes through Edge Functions only** — Browser uses `adminFetch` + JWT. No service role in the client.
- **Admin = public + overlays** — Schedule tab mirrors `index.html`; fixes must not replace entire page roots in a way that destroys `#schedule-prev` / `#schedule-focus` / `#schedule-next`.
- **Transform at boundary** — Schedule metadata in `content_blocks` is merged in **`transformSeasonData`** (or equivalent) so `config.DB.contentBlocks` drives both admin and public; week labels used on the **public** schedule must be read here and passed into `renderSchedule` week headings.

---

## Principles compliance (how implementation must satisfy them)

| Principle | What to do |
|-------------|------------|
| **Static deployment** | No new bundler; only static assets (`admin/*`, `js/*`, `css/*`). `admin-content` / `admin-games` deploy as Edge Functions, not embedded secrets in the client. |
| **Writes through Edge Functions only** | All schedule metadata saves use **`adminFetch('admin-content', …)`** and game CRUD uses **`adminFetch('admin-games', …)`** — never `SUPABASE_SERVICE_ROLE_KEY` in the browser. |
| **Admin = public + overlays** | **Step 2** keeps **`#schedule-prev` / `#schedule-focus` / `#schedule-next`** in the DOM (mirror wrap + editor **mount**); do not replace the entire `#page-schedule` with only the editor. Schedule tab structure stays aligned with the public mirror. |
| **Transform at boundary** | **`schedule_week_labels`** and parsed slot config are consumed from **`transformSeasonData`** / `config.DB.contentBlocks` (and **`renderSchedule`** reads the same shape on the public site). No ad-hoc duplicate fetches for week labels on the public page. |

Together with **BR-6**, these are acceptance checks for code review, not optional polish.

---

## Alignment with all_phases & business goal

- **all_phases.md (Phase 3):** Full schedule CRUD, scores, `scheduled_at`. Backend for games already exists; this plan fixes **admin UX/DOM/CSS** and adds **persisted metadata** (per-week slot visibility, **week titles with public display**).
- **Business goal:** Admins can reliably **set matchups** (home/away) in **Edit Full Schedule**, **navigate back** to the mirror schedule, **adjust visible slots** per week, and **label weeks**—and **visitors see custom week labels** on the public schedule—without breaking rendering.

---

## Matchup editing workflow (primary business function)

**Already implemented in code** (`admin/js/sections.js` — `openMatchupModal`). Edit Full Schedule does **not** use inline home/away dropdowns in each grid row; it uses a **modal**:

- **Empty slot:** **+ Add** → modal **“Add game — Week *w*, Game *gi*”** with **Home** and **Away** `<select>` lists (all season teams) → **Save** → `admin-games` **insert** with `season_id`, `week`, `game_index`, `home_team_id`, `away_team_id`, `scheduled_at`.
- **Filled slot:** Row shows **“Team A vs Team B”** (read-only summary) + **Edit** → same modal with dropdowns pre-selected → **Save** → `admin-games` **update** by `id` (teams only).

**Why it felt missing:** Global `.admin-edit-btn { position: absolute }` and replacing `#page-schedule` innerHTML broke the **+ Add / Edit** controls and **Back**, so the modal path was hard to use. **Steps 1–2** restore this flow; **Step 3** verifies saves and surfaces API errors.

**Optional future enhancement:** Inline Home/Away `<select>`s per row without opening a modal — not required for BR-1; add only if product wants that UX.

---

## Requirements traceability

| BR | Addressed in |
|----|----------------|
| BR-1 Matchups (modal Home/Away) | Steps 1–3 + existing `openMatchupModal` / `admin-games` |
| BR-2 Back / schedule restore | Step 2 |
| BR-3 Slot hide + block if game exists | Step 4 |
| BR-4 Custom week titles on **public** site | Step 5 + `transformSeasonData` + `renderSchedule` |
| BR-5 Public schedule integrity | Steps 1–2 (**admin** DOM/CSS only — no `renderFullScheduleEditor` on public `index.html`); Step 5 (**shared** `js/data.js` / `js/render.js` — regression-test public schedule after changes); **Step 7** — smoke-test public page: games + headings still correct |
| BR-6 Principles | Steps 1–6 + **Principles compliance** table above; Step 6 confirms overlay parity |

**BR-5 note:** The full-schedule editor exists only on **admin**. The **public** site uses the same **`renderSchedule`** / **`fetchSeasonData`** pipeline; any change to week headings (**Step 5**) must keep default behavior when `schedule_week_labels` is absent (fallback **Week N**).

---

## Backend & database — what this work touches

| Layer | Role for schedule work |
|--------|-------------------------|
| **`games` table** | Source of truth for matchups (`week`, `game_index`, `home_team_id`, `away_team_id`, scores, `scheduled_at`). Inserts/updates/deletes via **`admin-games`** only. |
| **`admin-games`** (`supabase/functions/admin-games/index.ts`) | `POST` body: create `{ season_id, week, game_index, home_team_id, away_team_id, … }`; update `{ id, … }`; delete `{ delete: true, id }`. **No change required** for basic add/remove once UI calls it correctly. Verify **unique** constraints in DB (if any) match product rules for `(season_id, week, game_index)`. |
| **`game_stat_values`** | Linked to `games`; deleting a game should cascade (per migration). No Edge Function change for stat cleanup if DB `ON DELETE CASCADE` is correct. |
| **`seasons.total_weeks`** | Set via **`admin-seasons`** `POST` `{ id, total_weeks }`. Already wired; editor reads via Supabase in `renderFullScheduleEditor`. |
| **`content_blocks` + `admin-content`** | **Required** for **week titles** (`schedule_week_labels`), **per-week slot config** (`schedule_slots_by_week`), and **week dates with no games yet** (`schedule_dates_by_week`) as JSON strings. **`admin-content` whitelists `key`** in `validKeys`** — keys **must** be added to `validKeys` and deployed. |
| **Public read** | **`js/data.js`** — `transformSeasonData` already merges `content_blocks` into `contentBlocks`; extend usage so **`schedule_week_labels`** drives week headings on the **public** schedule (**BR-4**). **`js/render.js`** — `renderSchedule` week labels (e.g. “Week 3 — Current”) must read custom text when present. |
| **Teams list** | Full editor already loads `teams` via anon Supabase `.from('teams')`; no new Edge Function unless you move reads server-side (not required). |

**Deploy checklist (when Edge Functions change):**

```bash
npx supabase functions deploy admin-games admin-seasons admin-content
```

**DB checklist:** After new migrations: `npx supabase db push` (or SQL in dashboard).

---

## Root causes (reconstructed from repo)

1. **CSS:** `admin/css/admin-overlays.css` sets **`.admin-edit-btn { position: absolute; top/right }`** globally. Edit Full Schedule uses the same class on **+ Add / Edit / Remove** inside `.fse-slot` flex rows, so buttons **leave flex flow** and can stack at the viewport/page corner—looks broken; clicks may be misleading.
2. **DOM:** `renderFullScheduleEditor` sets **`content.innerHTML` on `#page-schedule`**, wiping `#schedule-prev`, `#schedule-focus`, `#schedule-next`. `js/render.js` → `renderSchedule()` **returns immediately** if those nodes are missing—**Back** appears to do nothing useful; schedule never repaints.
3. **Product gaps (addressed in implementation):** Default three slots / custom slot lists / week labels / week dates without games are persisted via **`content_blocks`**; see **Implementation summary** and **Step 7.3** if behavior regresses (e.g. stale deploy, invalid `validKeys`).

---

## Step 1 — Agent: Full Schedule Editor — button layout (CSS)

**Who:** Agent

**What:**

1. **Stop reusing global overlay positioning** for FSE controls. Either:
   - Add a scoped rule: `#full-schedule-editor .admin-edit-btn { position: static; }` (or `relative` without `top`/`right`), **or**
   - Replace FSE button classes with a dedicated class (e.g. `fse-btn`) that does **not** extend `admin-edit-btn` global absolute rules.
2. Ensure `.fse-actions` / `.fse-slot` remain **flex**; buttons stay in row order.
3. **Regression:** Other pages’ `admin-edit-btn` behavior unchanged (media/about overrides stay as-is).

**How:** In Agent mode:

> Implement schedule_tab_fix Step 1: Fix Edit Full Schedule button layout. Scope CSS so `.admin-edit-btn` inside `#full-schedule-editor` is not `position:absolute` globally, or use `fse-btn` without absolute positioning. Verify Add/Edit/Remove align in each slot row.

---

## Step 2 — Agent: Full Schedule Editor — mount / teardown (Back + schedule restore)

**Who:** Agent

**What:**

1. **Do not replace** the entire `#page-schedule` innerHTML with only the editor.
2. Choose one approach:
   - **A)** Wrap schedule mirror markup in a container (e.g. `#schedule-mirror-wrap`). Add a dedicated **mount** node (e.g. `#schedule-full-editor-mount`) **inside** `#page-schedule` / `.section`. Toggle visibility: hide mirror, show mount and set its `innerHTML` to the editor (root inside mount may be `#full-schedule-editor`); **Back** clears mount, shows mirror, then `ctx.onScheduleSaved()` (reload + `renderAll` + `initAdminOverlays`), **or**
   - **B)** On Back, **re-insert** the original `#page-schedule` structure (match `admin/index.html`: `.section`, prev/focus/next, Add game button, footer) before `renderAll`, so IDs exist again.
3. After restore, **`renderSchedule(...)`** must run with `#schedule-prev`, `#schedule-focus`, `#schedule-next` present.
4. **Regression:** Open Edit Full Schedule → Back → schedule cards visible; week dropdown works; `attachScheduleAdminOverlays` re-attaches.

**How:** In Agent mode:

> Implement schedule_tab_fix Step 2: Fix renderFullScheduleEditor so it does not destroy #schedule-prev, #schedule-focus, #schedule-next. Use a wrapper toggle or DOM restore on Back. Ensure onScheduleSaved still refreshes data and redraws schedule.

---

## Step 3 — Agent: Verify add / remove / edit matchup (admin-games path)

**Who:** Agent

**What:**

1. **BR-1:** With Step 1–2 fixed, manually verify in browser: **+ Add** opens **`openMatchupModal`**, **Home** / **Away** dropdowns list all season teams, **Save** creates row; **Remove** deletes; **Edit** opens same modal and **Save** updates `home_team_id` / `away_team_id`.
2. If create/update fails: surface **`admin-games`** error text in `#fse-m-msg` (modal) / `#fse-save-msg` (toolbar). Common issues: missing `scheduled_at` when date empty (allowed null—confirm); **duplicate** `(season_id, week, game_index)` if DB unique index exists.
3. **Edge Function:** Only change **`admin-games`** if product requires new fields (e.g. soft-delete). Default: **no change**.

**How:** In Agent mode:

> Implement schedule_tab_fix Step 3: After DOM/CSS fixes, verify admin-games create/update/delete from full editor; improve error display if needed. Document any DB unique constraint behavior in code comments.

---

## Step 4 — Agent: Per-week slot count (“minus” hides slot rows)

**Who:** Agent

**What:**

1. **BR-3:** Default **3** slots per week. **Minus** / **plus** (or equivalent) adjusts which `game_index` values are **active** for that week—UI does not offer **+ Add** for hidden slots.
2. **Agreed rule (data safety):** If a **game row already exists** for a slot the admin tries to **remove from the schedule UI**, **block** the action and show a clear message (e.g. “Remove this game first” via existing **Remove** on that slot, or delete the game in the modal path). **Do not** silently delete DB rows or hide required migrations.
3. **Persistence:** Single `content_blocks` row per season, key **`schedule_slots_by_week`**, value JSON: `{ "7": [1], "1": [1,2,3] }` (week → list of active `game_index` values).
4. **Backend:** Extend **`admin-content`** `validKeys` to include `schedule_slots_by_week`. Deploy **`admin-content`** (can deploy together with Step 5 keys).
5. **Frontend:** `renderFullScheduleEditor` reads/writes via `adminFetch('admin-content', …)` with `season_id`; `renderEditor()` filters slot rows by active indices.
6. **Public site (optional parity):** By default, public `renderSchedule` is driven by **`games`** rows only (games not shown for “hidden” slots simply don’t exist). If product later wants empty rows hidden on **public** when fewer slots are active, read `schedule_slots_by_week` in `data.js` / `render.js`—not required for BR-3 if unused slots have no games.

**How:** In Agent mode:

> Implement schedule_tab_fix Step 4: schedule_slots_by_week in content_blocks; admin-content validKeys; minus/plus per week; **block** slot removal when a game exists until removed; no silent DB deletes.

---

## Step 5 — Agent: Editable week titles (admin + public)

**Who:** Agent

**What:**

1. **BR-4:** **`schedule_week_labels`** in `content_blocks`, JSON `{ "1": "Week 1 — Openers", "7": "Playoffs" }`. Missing or empty value for a week → fallback **`Week N`** (or preserve suffixes like “— Current” in render logic when appropriate).
2. **Backend:** Add **`schedule_week_labels`** to **`admin-content`** `validKeys`**; deploy **`admin-content`**.
3. **Admin UI:** In `renderFullScheduleEditor`, replace static `Week ${w}` with an editable field that loads/saves the map (`adminFetch('admin-content', …)` with `season_id`).
4. **Public site (required):** Store JSON as a **string** in `content_blocks` if that is existing convention; in **`transformSeasonData`**, **`JSON.parse`** the value for `schedule_week_labels` when needed and expose a convenient map on `config` (e.g. `weekLabelByWeek` or merged into `contentBlocks`). Update **`renderSchedule`** in **`js/render.js`** so prev/focus/next week **headings** use the custom label when present (**visitors must see the same labels as configured**). Preserve suffixes such as “— Current” / “— Previous” / “— Next” in render logic when using custom titles. Keep admin mirror behavior aligned with public data shape.

**How:** In Agent mode:

> Implement schedule_tab_fix Step 5: schedule_week_labels in content_blocks; admin-content validKeys; editable week header in full editor; **mandatory** public `renderSchedule` + `transformSeasonData` wiring for BR-4.

---

## Step 6 — Agent: Schedule tab parity (optional cleanup)

**Who:** Agent

**What:**

1. Confirm **`attachScheduleAdminOverlays`** includes **Remove** on each matchup card on the main Schedule tab (**BR-6** / parity with full editor removes).
2. Remove or archive duplicate **`renderSchedule(content, ctx)`** legacy path if unused, to avoid two behaviors—only if safe (grep callers). *(Done: documented in code; legacy `sections.renderSchedule(content, ctx)` remains for dashboard/stat-sheet paths.)*

**How:** In Agent mode:

> Implement schedule_tab_fix Step 6: Verify attachScheduleAdminOverlays Remove button; grep legacy renderSchedule(content) usage; consolidate if dead.

---

## Implementation summary (what landed in repo)

Use this as a baseline so follow-up work does not re-litigate solved items unless a regression is confirmed.

| Area | What was implemented |
|------|----------------------|
| **CSS (Step 1)** | `#full-schedule-editor .admin-edit-btn { position: static; … }` in `admin/css/admin-overlays.css` so FSE row buttons stay in flex layout. |
| **Mount / Back (Step 2)** | `#schedule-mirror-wrap` + `#schedule-full-editor-mount` in `admin/index.html` and `SCHEDULE_TEMPLATE`; `renderFullScheduleEditor` writes only to the mount; `closeEditorShell` on Back; no wipe of `#page-schedule` on missing season. |
| **Matchups (Step 3)** | `openMatchupModal` + `admin-games`; errors surfaced in modal and `#fse-save-msg`; optional comment in `admin-games` on future unique constraint. |
| **Slots (Step 4)** | `schedule_slots_by_week` in `content_blocks` + `admin-content` `validKeys`; minus blocked if a game exists in that slot; default **3** slots when unset; **follow-up:** allow **zero** slots per week and **unlimited** slot indices (see **Step 7 — regression checklist**). |
| **Week titles public (Step 5)** | `schedule_week_labels` in `validKeys`; `transformSeasonData` → `scheduleWeekLabels`; `renderSchedule` headings + `scheduleWeekTitle()` on public site. |
| **Week date without games** | `schedule_dates_by_week` in `content_blocks` + `validKeys`; week date saves even when no `games` row yet. |
| **Timezone (display vs DB)** | `buildScheduledAt` builds a **local** `Date` then `toISOString()` for Postgres `timestamptz`; FSE `getISOTime` uses **local** getters (not UTC). Old rows saved under naive UTC interpretation may still show wrong until **re-saved**. |
| **Time save UX** | No separate Save on `<input type="time">`: `change` + debounced `input` persist; week date resolved from date field, `getWeekDate`, or `getISODate(game.scheduled_at)` before building `scheduled_at`. |
| **Admin schedule/game forms (post–R2)** | Schedule tab **Edit game** modal and **Games** tab form: `scheduledAtInputToIso` / `scheduledAtToDatetimeLocalValue` so naive datetime strings are not stored as UTC wall time (fixes 10 AM → 5 AM style display bugs on cards). |

**Key files:** `admin/js/sections.js` (`renderFullScheduleEditor`), `admin/css/admin-overlays.css`, `admin/index.html`, `admin/js/page-templates.js`, `js/data.js`, `js/app.js`, `js/render.js`, `admin/js/admin.js`, `admin/js/admin-data.js`, `js/config.js`, `supabase/functions/admin-content/index.ts`, `supabase/functions/admin-games/index.ts` (comment only).

---

## Step 7 — Verification, deploy & regression checklist (You + Agent)

**Who:** Primarily **You** for deploy/smoke tests; **Agent** can work through the **regression checklist** if something still fails.

### 7.1 — Deploy & cache

1. Deploy static site (GitHub Pages or host) so **`admin/js/**` and **`js/**`** match the repo.
2. Deploy Edge Functions — **`admin-content` is required** whenever `validKeys` changes (`schedule_slots_by_week`, `schedule_week_labels`, `schedule_dates_by_week`). Deploy **`admin-games`** if that file changed.
   ```bash
   npx supabase functions deploy admin-content
   # npx supabase functions deploy admin-games   # if changed
   ```
3. **Hard-refresh** admin and public (`Ctrl+Shift+R`) so the browser is not serving an old cached `sections.js`.

### 7.2 — Original plan smoke tests

1. **Admin:** Login → Schedule → Edit Full Schedule → **+ Add** / **Edit** matchups (Home/Away) → **Back** → schedule mirror shows prev / focus / next (**BR-1**, **BR-2**).
2. **Public:** Schedule page: games from **`games`**; **custom week titles** in headings when set; fallback **Week N** and suffixes **— Previous / Current / Next** when labels absent (**BR-4**, **BR-5**).
3. **Supabase:** `games` rows look correct; deleting a game does not leave orphan **`game_stat_values`** (FK / cascade).

### 7.3 — Regression checklist (issues reported in follow-up)

An agent or reviewer should confirm each item **passes** in a **logged-in admin** session **after** a hard refresh and **after** static + function deploys. If any item fails, fix in code or redeploy as indicated.

| # | Issue | Expected behavior | If it still fails, check |
|---|--------|-------------------|---------------------------|
| **R1** | **Week date without games** | In Edit Full Schedule, setting the **week date** (calendar) **persists** even when that week has **no games** yet (after Back / reload). | `schedule_dates_by_week` in **`admin-content` `validKeys`** and deployed; `persistDatesByWeek` in `sections.js`; Network tab: `admin-content` POST succeeds. |
| **R2** | **Time shows wrong (e.g. 10 AM in editor vs 5 AM on schedule)** | Schedule tab / public show the **same local wall time** you set in FSE after a **new save** (FSE uses local `Date` → ISO). | Old **`games.scheduled_at`** may still be wrong until **re-saved**; confirm DB value is full ISO. **Not** a naive `YYYY-MM-DDTHH:mm:ss` without timezone semantics. Hard refresh. |
| **R3** | **More than 3 slots per week** | **+ Slot** can add a **4th, 5th, …** slot (`game_index` increments). | Latest `sections.js` deployed; `getActiveIndices` does **not** cap indices at 3; `admin-content` saves `schedule_slots_by_week`. |
| **R4** | **Remove all slots from a week** | **−** on the last slot removes it; week can show **only** header (title, date, + Slot) with **zero** slot rows. | `getActiveIndices` returns `[]` for persisted `[]`; not reverting to `[1,2,3]` unless key missing. `persistSlots` succeeds. |
| **R5** | **Time picker has no Save button** | Changing time in the **native time picker** **auto-saves** (no extra button): `change` and debounced `input` on `.fse-time-input`. | Week **date** must be settable (or derived from game) so `buildScheduledAt` is not `null`. |
| **R6** | **Slots / UI “still limited to 3” after “fix”** | Same as R3–R4; often **stale JS** or **`admin-content`** not deployed so `schedule_slots_by_week` never persists. | Verify **single** `renderFullScheduleEditor` in `sections.js`; grep for `<= 3` or `[1, 2, 3].find` in slot handlers (should use `max+1` for new index). |

### 7.4 — Database / migrations

- **No new migration** required for these `content_blocks` keys (JSON string values on existing table).
- **`seasons.total_weeks`:** use existing migration if the total-weeks control is used (`007_total_weeks.sql` or equivalent).

### 7.5 — Code audit: Step 7.3 issues (R1–R6) vs current repo

A pass over **`admin/js/sections.js`** and **`supabase/functions/admin-content/index.ts`** shows **R1–R6 are implemented in source**; remaining failures in QA are usually **deploy/cache** or **legacy DB rows** (see the “If it still fails” column in §7.3), not missing application logic.

| Item | Status in repo | Where / how |
|------|----------------|-------------|
| **R1** Week date with no games | **Implemented** | `datesByWeek`, load from `content_blocks` (`schedule_dates_by_week`), `persistDatesByWeek()` on `.fse-date-input` **change**. Empty week: `weekGames` loop is skipped but **`persistDatesByWeek` still runs**. |
| **R2** Time mismatch (editor vs schedule) | **Implemented** | `buildScheduledAt` uses **local** `Date(y, mo-1, d, hh, mm)` then **`toISOString()`** for `timestamptz`. `getISOTime` uses **local** getters. Public **`formatGameTime`** uses `new Date(scheduled_at)` + **`toLocaleString`** — same instant, local display. **Old rows** saved before this fix may still be wrong until re-saved (documented in **Implementation summary**). |
| **R3** More than 3 slots | **Implemented** | **`+ Slot`** (`.fse-add-slot-btn`): `nextIdx = Math.max(...cur) + 1` (or `1` if empty); **`getActiveIndices`** does not cap at 3 — only the **default** when no key is `[1, 2, 3]`. |
| **R4** Zero slots for a week | **Implemented** | **`getActiveIndices`**: if persisted array is **`[]`**, returns **`[]`** immediately (no fallback to three slots). **`−`** on last slot persists **`[]`** via `persistSlots`. |
| **R5** Time picker auto-save | **Implemented** | **`.fse-time-input`**: **`change`** fires immediate save; **`input`** uses **debounced** `setTimeout(..., 420)` to same persist path. Message if week date missing: *Set the week date (calendar field) first*. |
| **R6** “Still limited to 3” | **No erroneous cap in slot logic** | Grep: only **`[1, 2, 3]`** is the **default** when `schedule_slots_by_week` has no entry for that week; **`<= 3`** appears only in **`defaultTimeForSlot`** (default times for games 1–3, not a slot count limit). |

**Valid keys (deploy):** `admin-content` **`validKeys`** includes **`schedule_slots_by_week`**, **`schedule_week_labels`**, **`schedule_dates_by_week`** — required for R1/R3/R4 persistence.

**If manual tests still fail after this audit:** use §7.1 (hard refresh, deploy **`admin-content`** + static), then re-run §7.3 row-by-row; only then treat **§7.6** as a debugging playbook (below) for **environment/data** issues rather than re-implementing R1–R6.

### 7.6 — When R1–R6 still fail after deploy (debugging playbook)

Use this **only** when §7.5 says the code is present but behavior is still wrong in the browser or DB.

1. **Confirm assets and functions**
   - Browser **Network**: `sections.js` response matches repo (no CDN cache of old file).
   - **`admin-content` POST**: body includes the expected `key`/`value`/`season_id`; response is 2xx. If **403/400** on key name, redeploy **`admin-content`** with current `validKeys`.
2. **R1 (date not sticking)** — Inspect **`content_blocks`** for that `season_id`: row **`schedule_dates_by_week`** JSON should include the week key after save. If missing, trace **`persistDatesByWeek`** errors in console.
3. **R2 (time wrong)** — In Supabase **`games.scheduled_at`**: value should be a full **ISO 8601** instant. If it looks like a naive string with no offset, **re-save** the game time in FSE. Compare **browser timezone** vs where you expect “local” (same machine = should match).
4. **R3 / R4 / R6 (slots)** — Inspect **`schedule_slots_by_week`** JSON: week keys should list **`game_index`** values (including **`[]`**). If the key never updates, **`admin-content`** deploy or **`adminFetch`** failure. If UI shows 3 slots but JSON has 4 indices, **hard refresh** stale **`sections.js`**.
5. **R5 (time not saving)** — Ensure **week date** is set (calendar) or derivable from an existing game’s `scheduled_at`; otherwise **`persistGameTime`** exits with the “Set the week date…” message. Some browsers fire **`change`** but not **`input`** on time pickers — **`change`** is still wired.

---

## Edge Functions & migrations (quick reference)

| Deliverable | Typical change |
|-------------|----------------|
| **admin-games** | Usually **none** for this initiative. |
| **admin-seasons** | Already supports `total_weeks`; **none** unless new season fields. |
| **admin-content** | **Required** for keys: `schedule_slots_by_week`, `schedule_week_labels`, `schedule_dates_by_week` (all in `validKeys`). |
| **Migrations** | **Optional** new table only if you reject JSON in `content_blocks`; otherwise **no new migration** for Steps 4–5. |
| **data.js / render.js** | **Required for BR-4:** parse `schedule_week_labels` into `contentBlocks` and use in **`renderSchedule`** week headings on the **public** site. |

---

## Reference — key files

| File | Purpose |
|------|---------|
| `admin/js/sections.js` | `renderFullScheduleEditor`, `attachScheduleAdminOverlays`, **`openMatchupModal`** (Home/Away dropdowns) |
| `admin/css/admin-overlays.css` | `.admin-edit-btn` global positioning |
| `js/render.js` | `renderSchedule` — requires prev/focus/next IDs; **week heading strings for BR-4** |
| `js/data.js` | `transformSeasonData` — **contentBlocks** / week label map for BR-4 |
| `admin/js/admin.js` | `scheduleOverlayCtx.onScheduleSaved` |
| `supabase/functions/admin-games/index.ts` | Game CRUD |
| `supabase/functions/admin-content/index.ts` | `validKeys` whitelist |
| `supabase/functions/admin-seasons/index.ts` | `total_weeks` |

---

## Summary

| Order | Who   | Step |
|-------|-------|------|
| 1     | Agent | Full Schedule Editor — button layout (CSS scoped or `fse-btn`; fix absolute `.admin-edit-btn`) |
| 2     | Agent | Mount / teardown — Back restores `#schedule-prev` / `#schedule-focus` / `#schedule-next` |
| 3     | Agent | Verify `admin-games` add / remove / edit + error surfacing in UI |
| 4     | Agent | Per-week slot count — `schedule_slots_by_week`; block removal if game exists (**BR-3**) |
| 5     | Agent | Week titles — `schedule_week_labels`; **public** `transformSeasonData` + `renderSchedule` (**BR-4**) |
| 6     | Agent | Schedule tab parity — Remove on cards; legacy `renderSchedule(content)` cleanup if safe |
| 7     | You + Agent | Deploy; **§7.2** smoke tests; **§7.3** regression checklist (R1–R6); **§7.5** code audit (issues addressed in repo); **§7.6** if QA still fails; hard-refresh |

---

*Document style aligned with `docs/phase5.md` (principles, alignment, numbered steps, Agent vs You, deploy commands). **Business requirements (BR-1–BR-6)**, **Principles compliance**, and **requirements traceability** together define acceptance criteria. Companion: `docs/schedule-fixes-plan.md` (original issue list; **superseded** — work tracked here is **complete**).*
