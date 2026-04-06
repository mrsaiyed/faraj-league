# Implementation plan: Schedule tab fix (steps 1–6)

**Status:** ✅ **Complete** — Same scope as [schedule_tab_fix.md](./schedule_tab_fix.md); **verified on production** (April 2026).

**Companion:** [schedule_tab_fix.md](./schedule_tab_fix.md) (full spec, BR-1–BR-6, principles compliance, steps 1–7).

This file is the **action plan** for implementation (aligned with the Cursor plan `schedule_tab_fix_steps_1-6`).

## Overview

Implement Steps 1–6 per **BR-1–BR-6** and the **Principles compliance** table in [schedule_tab_fix.md](./schedule_tab_fix.md): FSE CSS; preserve schedule DOM for **Back**; verify **modal matchups** (`openMatchupModal` + `admin-games`); **`schedule_slots_by_week`** with **block if game exists**; **`schedule_week_labels`** with **mandatory** `transformSeasonData` + public `renderSchedule`; overlay/legacy cleanup.

## Business requirements (summary)

| BR | Essence |
|----|--------|
| **BR-1** | Matchups via **+ Add** / **Edit** → **`openMatchupModal`** (Home/Away dropdowns) → `admin-games` |
| **BR-2** | **Back** restores mirror schedule (`#schedule-prev` / `#schedule-focus` / `#schedule-next`) |
| **BR-3** | `schedule_slots_by_week`; **block** removing a slot if a game exists until removed |
| **BR-4** | `schedule_week_labels` — **public** site shows custom week headings |
| **BR-5** | Public schedule integrity — games + headings still correct after shared `js` changes |
| **BR-6** | Static site, Edge writes only, admin = mirror (+ principles table) |

## Principles compliance (must hold)

| Principle | Implementation hook |
|-----------|---------------------|
| **Static deployment** | No bundler; only static files + Edge deploys. |
| **Edge Functions only for writes** | `adminFetch('admin-content'|'admin-games', …)` only. |
| **Admin = public + overlays** | Step 2: mirror wrap + **mount**; never wipe `#schedule-prev` / `#schedule-focus` / `#schedule-next`. |
| **Transform at boundary** | Step 5: `schedule_week_labels` in **`transformSeasonData`**; **`renderSchedule`** uses same shape on public site. |

## Architecture (current bug)

`renderFullScheduleEditor` sets `innerHTML` on `#page-schedule`, removing `#schedule-prev` / `#schedule-focus` / `#schedule-next`, so `renderSchedule` in `js/render.js` no-ops. Global `.admin-edit-btn { position: absolute }` breaks FSE flex rows.

## Step 1 — FSE button layout (CSS)

**BR-1 / principles:** Scoped `#full-schedule-editor .admin-edit-btn` or `fse-btn` — [`admin/css/admin-overlays.css`](../admin/css/admin-overlays.css), [`admin/js/sections.js`](../admin/js/sections.js).

## Step 2 — Mount / teardown

**BR-2 / principles:** `#schedule-mirror-wrap` + `#schedule-full-editor-mount` in [`admin/index.html`](../admin/index.html) and [`admin/js/page-templates.js`](../admin/js/page-templates.js); refactor [`renderFullScheduleEditor`](../admin/js/sections.js). Editor content goes **in the mount**, not replacing the whole page.

## Step 3 — Verify `openMatchupModal` + admin-games

**BR-1 / Edge-only writes:** Verify + Add / Edit / Remove; errors in modal/toolbar; `admin-games` unchanged unless needed.

## Step 4 — `schedule_slots_by_week`

**BR-3:** `validKeys` in [`supabase/functions/admin-content/index.ts`](../supabase/functions/admin-content/index.ts); block slot removal when game exists; `adminFetch` for saves.

## Step 5 — `schedule_week_labels` (admin + public)

**BR-4 / transform at boundary:** `validKeys`; FSE editable headers; [`js/data.js`](../js/data.js) `transformSeasonData` + [`js/render.js`](../js/render.js) `renderSchedule` (**required** for public). **BR-5:** regression-test public schedule after merge.

## Step 6 — Parity + legacy cleanup

**BR-6:** Confirm Remove on cards; grep legacy `renderSchedule(content, ctx)`.

## Dependency order

1 → 2 → 3 → 4–5 (deploy **admin-content**) → 6.

## Files likely touched

| Step | Files |
|------|--------|
| 1 | `admin/css/admin-overlays.css`, `admin/js/sections.js` |
| 2 | `admin/index.html`, `admin/js/page-templates.js`, `admin/js/sections.js` |
| 3 | `admin/js/sections.js` |
| 4–5 | `supabase/functions/admin-content/index.ts`, `admin/js/sections.js`, **`js/data.js`**, **`js/render.js`** (BR-4, BR-5) |
| 6 | `admin/js/sections.js` |

**Step 7** (You): **BR-1**, **BR-2**, **BR-4**, **BR-5** verification + deploy — [schedule_tab_fix.md](./schedule_tab_fix.md) Step 7. ✅ Done (production, April 2026).
