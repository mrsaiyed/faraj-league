# Schedule Page Fixes — Plan

> **Status:** ✅ **Superseded — work complete.** The issues below were rolled into [**schedule_tab_fix.md**](./schedule_tab_fix.md) (steps 1–7) and shipped; production verified April 2026. Keep this file for **historical context** only, not as an active backlog.

---

## Issues

### 1. Remove button missing from normal Schedule tab
`attachScheduleAdminOverlays` in `admin/js/sections.js` adds Edit and Stat sheet buttons per game card but never adds a Remove button. The Remove button code only exists in the legacy `renderSchedule(content, ctx)` path.

**Fix:** Add Remove button block to `attachScheduleAdminOverlays` (same logic as the existing remove in `renderSchedule`).

---

### 2. Back button on Edit Full Schedule doesn't work
When "Edit Full Schedule" is clicked from the visual mirror Schedule tab, `renderFullScheduleEditor(pageSchedule, ctx)` replaces `#page-schedule` content. The back button calls `ctx.onScheduleSaved()` which triggers `renderAll()` + `initAdminOverlays()` to restore the page. However `onScheduleSaved` is not always in ctx — when called from the sections-based `renderSchedule`, ctx has no `onScheduleSaved`, causing the back button to call `renderSchedule(content, ctx)` with wrong arguments.

**Fix:** Always pass a reliable back-navigation callback. For the visual mirror path, `ctx.onScheduleSaved` exists and works. For the sections path, ensure `renderSchedule(content, ctx)` is called with the correct content element (which it already is). Verify the back button handler covers both paths correctly.

---

### 3. Edit button in Edit Full Schedule — teams not selectable
The `Edit` button per filled game slot opens `openMatchupModal`. Investigation shows the modal and its submit handler are correctly wired. The likely issue is that `teams` is sourced from `config.DB.teams` at function load time, and if `config.DB` is not populated (season not loaded), the team dropdowns are empty.

**Fix:** Ensure teams are fetched fresh alongside games at the top of `renderFullScheduleEditor`, falling back to a direct supabase query if `config.DB.teams` is empty.

---

### 4. No way to set total weeks for the season
`config.TOTAL_WEEKS` is currently derived from game data via `deriveWeeks()` (min 8). There is no admin UI to set how many weeks the season has, and no `total_weeks` column in the DB.

**Fix (requires manual DB step):**
- Add `total_weeks` column to `seasons` table
- Update `admin-seasons` edge function to accept `total_weeks`
- Add `total_weeks` field to the settings drawer (`renderSeasons`)
- Add an editable "Total weeks" field at the top of the Edit Full Schedule page
- Use `season.total_weeks` to override `config.TOTAL_WEEKS` in `data.js` and `admin.js`

---

## Manual Steps Required (by you)

### A. Run DB migration for `total_weeks`
After the migration file is added to `supabase/migrations/`, run:
```
npx supabase db push
```
Or paste the migration SQL in Supabase Dashboard → SQL Editor.

### B. Deploy updated Edge Function
After `admin-seasons/index.ts` is updated:
```
npx supabase functions deploy admin-seasons
```

---

## Implementation Steps

1. Add `007_total_weeks.sql` migration
2. Update `admin-seasons/index.ts` to accept and write `total_weeks`
3. Update `data.js` to read `season.total_weeks` and use it for `config.TOTAL_WEEKS`
4. Update `admin.js` `loadAdminSeason` to apply `season.total_weeks`
5. Add `total_weeks` input to `renderSeasons` season settings drawer
6. Add Remove button to `attachScheduleAdminOverlays`
7. Add total weeks inline editor to Edit Full Schedule page header
8. Fix team loading in `renderFullScheduleEditor` to always have teams
