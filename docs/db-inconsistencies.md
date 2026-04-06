# Database Read/Write Inconsistency Audit

Audit of all DB reads and writes across the codebase. Issues are **not fixed** — documented for future action.

---

## My Recent Changes (this session)

### 1. `renderFullScheduleEditor` — timezone mismatch between read and write

**File:** `admin/js/sections.js`

`getISOTime()` reads stored `scheduled_at` values using `d.getUTCHours()` / `d.getUTCMinutes()` (UTC-based). But `buildScheduledAt()` creates timestamps as `${dateStr}T${timeStr}:00` — no timezone suffix. When Postgres receives a bare ISO string for a `TIMESTAMPTZ` column, it applies the database server's timezone. When browsers parse the same bare string with `new Date()`, the ECMAScript spec treats date-time strings without a timezone designator as **local time**.

Meanwhile `formatGameTime()` in `render.js` uses `d.toLocaleString()` which renders in the **browser's local time**.

Net effect: a time entered as "10:00" in the editor may display as a different time on the public page depending on the browser/server timezone offset. The existing individual-game modal (`datetime-local` input) has the same root problem — the whole codebase treats `scheduled_at` as a naive local timestamp — but the new editor introduces UTC reads on top of that.

---

## Existing Codebase Issues

### 2. `rosters` table fetched without a season filter

**Files:** `lib/api.js` (`getSeasonData`), `supabase/functions/admin-export-csv/index.ts`

```js
// lib/api.js
supabase.from('rosters').select('*').order('sort_order', { ascending: true })
// no .eq('season_id', ...) — rosters has no season_id column
```

The `rosters` table has no `season_id` column; season isolation relies on joining to `teams` (which are season-scoped). Both the public API and the CSV export fetch the entire `rosters` table and filter client-side by `team_id`. As more seasons accumulate, this becomes a full-table scan. The `admin-game-stats` and stat sheet direct reads do the same thing (filtered by `team_id.eq.X,team_id.eq.Y`), which is sufficient for correctness but reads all roster rows before filtering.

---

### 3. `admin-teams` — cannot clear the `captain` field

**File:** `supabase/functions/admin-teams/index.ts`

```ts
...(captain != null && { captain }),
```

`null != null` is `false`, so passing `captain: null` to clear a captain is silently ignored — the update patch never includes the field. The only way to clear a captain is direct DB access.

---

### 4. `renderGames` — free-text `scheduled_at` input with no format validation

**File:** `admin/js/sections.js` (`renderGames`, line ~1574)

```html
<input type="text" id="games-scheduled" placeholder="2026-01-15T18:00:00Z" ...>
```

Every other game-editing modal uses `<input type="datetime-local">` which enforces a valid date-time format. `renderGames` uses a plain text field. An invalid string (e.g. typo in the ISO format) is passed as-is to `admin-games`, which then passes it to Postgres. Postgres may reject it or silently cast it incorrectly depending on the string.

---

### 5. `admin-content` — unknown content block keys silently skipped

**File:** `supabase/functions/admin-content/index.ts`

```ts
if (!key || !validKeys.includes(key)) continue;  // no error returned
```

The `validKeys` whitelist is hardcoded in the edge function. If a new content block key is added to the UI (e.g. a new editable text section) without also being added to `validKeys`, every save for that key silently does nothing — no error is returned to the caller. The UI shows "Saved" but the DB is not updated.

---

### 6. `admin-seasons` — no API to create seasons or edit `label`/`slug`

**File:** `supabase/functions/admin-seasons/index.ts`

The edge function only handles `is_current` and `current_week`. There is no endpoint to:
- Create a new season
- Update a season's `label` or `slug`

New seasons require direct DB access or running the seed script. Season labels shown in the UI cannot be corrected through the admin.

---

### 7. `deriveWeeks` fallback always returns `CURRENT_WEEK >= 1`

**File:** `js/data.js`

```js
return { TOTAL_WEEKS: Math.max(8, maxWeek), CURRENT_WEEK: latestPlayed || 1 };
```

`deriveWeeks` can never return `CURRENT_WEEK: 0`. The week-0 feature (showing upcoming matchups on the homepage) **only works** when `current_week = 0` is explicitly set on the season record in the DB. If `current_week` is `NULL` in the DB (not yet set by admin), the app falls back to `deriveWeeks`, which returns at least 1 — making week 0 unreachable without a manual DB save.

---

### 8. `admin-seasons` — no minimum constraint on `current_week`

**File:** `supabase/functions/admin-seasons/index.ts` / `supabase/migrations/002_phase3_schema.sql`

The column is defined as `current_week INT` with no `CHECK (current_week >= 0)` constraint. The edge function doesn't validate the value either. Negative values (e.g. `-1`) would be accepted and stored, with undefined rendering behavior on the public site.

---

### 9. `admin-players` — roster delete is cross-season when reassigning a player

**File:** `supabase/functions/admin-players/index.ts`

```ts
await supabase.from('rosters').delete().eq('player_id', body.id);
```

When a player is reassigned to a new team, all roster rows for that `player_id` are deleted first — across all seasons. Currently this is safe because each player gets a unique UUID per season and is never reused. If player UUIDs were ever shared across seasons, this would orphan roster entries from other seasons.

---

### 10. `stat_definitions` are global — no season isolation

**Files:** `lib/api.js`, `admin/js/sections.js` (`renderGames`, stat sheet), `supabase/functions/admin-stats/index.ts`

`stat_definitions` has no `season_id` column. All seasons share the same stat definitions. Adding or removing a stat definition affects every season. There is no way to have different per-season stat schemas.

---

### 11. `openStatSheet` fallback renders into unexpected element

**File:** `admin/js/sections.js` (`openStatSheet`, line ~1524)

```js
if (onSaved) await onSaved();
else if (content) {
  const sections = await import('./sections.js');
  await sections.renderSchedule(content, ctx);
}
```

When called without an `onSaved` callback (e.g. from `renderSchedule(content, ctx)` in sections.js), it re-renders the full schedule into `content` after saving stats. The `content` passed from `renderSchedule` is the admin section panel div — this is intentional for that code path. However, this fallback is effectively dead code in the visual mirror flow (which always passes `onScheduleSaved`), and the self-import `import('./sections.js')` to call `sections.renderSchedule` is circular and redundant since `renderSchedule` is available in the same module scope.

---

### 12. `lib/api.js` `getSeasonData` — `player_stat_values` error is non-fatal but `game_stat_values` error is silently swallowed

**File:** `lib/api.js`

```js
if (playerStatsRes.error) {
  return { data: null, error: playerStatsRes.error };  // fatal
}
// ...
const game_stat_values = gameStatValuesRes.error ? [] : (gameStatValuesRes?.data || []);  // silent
```

A `player_stat_values` fetch error causes the entire season load to fail. A `game_stat_values` fetch error is silently swallowed (returns `[]`), causing the stats and box scores to appear empty with no indication of the error. The two error handling paths are inconsistent.

---

### 13. `renderSchedule` (sections.js) game lookup uses strict equality; `attachScheduleAdminOverlays` uses string coercion

**File:** `admin/js/sections.js`

```js
// renderSchedule (line ~480):
const game = scores.find(s => s.gameId === gameId);

// attachScheduleAdminOverlays (line ~1114):
const game = scores.find(s => String(s.gameId) === String(gameId));
```

Both `gameId` values are UUID strings and the comparison works in practice, but the inconsistency means one code path is more defensive than the other. If `gameId` were ever a number (e.g. from a different data source), `renderSchedule` would silently fail to find the game.
