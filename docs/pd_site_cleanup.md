# Point Differential (PD) — Standings Column COMPLETED

Add a Point Differential column to the conference standings tables on the public (and admin-mirrored) standings page.

Execute these steps in order. Agent = tasks the Claude Code agent does. You = manual steps you perform.

---

## Step 1 — Agent: Confirm data availability

**Who:** Agent

**What:** Verify that `calcStandings` in `lib/standings.js` already returns `pf` and `pa` per team, so PD (`pf − pa`) is derivable with no new queries or schema changes. Also confirm that `renderStandings` in `js/render.js` receives this data via `config.DB.scores` → `calcStandings(config.DB.teams, config.DB.scores)`.

**How:** Read `lib/standings.js` and `js/render.js`.

Key facts to confirm:
- `calcStandings` returns `{ w, l, pf, pa, conf, id }` per team name.
- `renderStandings` already spreads this record onto each row object: `{ ...rec[t.name] || { w:0, l:0, pf:0, pa:0 }, name, id }`.
- PD is already used as a tiebreaker in the sort: `.sort((a,b) => b.w - a.w || (b.pf - b.pa) - (a.pf - a.pa))`.
- No schema change, no new API call, no Edge Function change needed.

**Verify:** `calcStandings` return shape includes `pf` and `pa`. ✓

---

## Step 2 — Agent: Add PD column to `renderStandings`

**Who:** Agent

**What:** Update `js/render.js` → `renderStandings()` to display PD as a new rightmost column in each conference standings table.

Two branches must both be updated:
- The `confGrid.innerHTML = ...` branch (dynamic rebuild when `confGrid` exists).
- The `else` branch (individual `tbody` update when `confGrid` doesn't match).

**Changes in each branch:**

1. **Table header** — append `<th>PD</th>` after `<th>PA</th>`:
   ```
   <th>W</th><th>L</th><th>PF</th><th>PA</th><th>PD</th>
   ```

2. **Row data** — compute `pd = (r.pf || 0) - (r.pa || 0)` and append with sign:
   ```js
   const pd = (r.pf || 0) - (r.pa || 0);
   // ...
   <td>${pd > 0 ? '+' + pd : pd}</td>
   ```
   - Positive: `+20`
   - Negative: `-14`
   - Zero: `0`

**How:** In Agent mode:

> Update `renderStandings` in `js/render.js`. In both branches (confGrid and else), add `<th>PD</th>` after `<th>PA</th>` in the header and append `<td>${pd > 0 ? '+' + pd : pd}</td>` to each row (where `pd = (r.pf||0) - (r.pa||0)`).

---

## Step 3 — Agent: Update static HTML fallback in `index.html`

**Who:** Agent

**What:** The static HTML in `index.html` contains a hardcoded standings table structure used as a loading placeholder before JS hydrates it. This must stay in sync with the column count rendered by `renderStandings`.

**Changes in `index.html`:**

1. Add `<th>PD</th>` after `<th>PA</th>` in both conference table headers (Mecca and Medina).
2. Bump the loading row `colspan` from `6` → `7` in both `<tbody>` loading cells.

Before:
```html
<thead><tr><th style="width:28px">#</th><th>Team</th><th>W</th><th>L</th><th>PF</th><th>PA</th></tr></thead>
<tbody id="mecca-standings"><tr><td colspan="6" class="loading">Loading...</td></tr></tbody>
```

After:
```html
<thead><tr><th style="width:28px">#</th><th>Team</th><th>W</th><th>L</th><th>PF</th><th>PA</th><th>PD</th></tr></thead>
<tbody id="mecca-standings"><tr><td colspan="7" class="loading">Loading...</td></tr></tbody>
```

Apply to both conference blocks (Mecca and Medina).

**How:** In Agent mode:

> Update `index.html` standings table headers to include `<th>PD</th>` after `<th>PA</th>` for both conference tables, and bump their loading `colspan` from 6 to 7.

---

## Step 4 — You: Verify on public site

**Who:** You

**What:** Open the standings tab and confirm:

1. Each conference table has a PD column to the right of PA.
2. Positive differentials display with a `+` prefix (e.g. `+24`).
3. Negative differentials display without prefix (e.g. `-8`).
4. Zero differential shows `0`.
5. Column sort order is unchanged: W descending, then PD as tiebreaker.
6. Loading state shows a single cell spanning all 7 columns without layout breakage.

---

## Step 5 — You: Verify admin site mirrors automatically

**Who:** You

**What:** Open the admin standings tab and confirm the PD column appears there too with no extra changes needed.

This is expected because admin uses the same `renderStandings` render function and the same `index.html`-derived structure via `admin/js/page-templates.js` (which must stay in sync with `index.html`).

**Note:** If the admin page-templates.js contains a hardcoded standings table, update its header and colspan to match the changes in Step 3.

**Verify:** Admin standings shows PD column identical to public. ✓

---

## Summary

| Order | Who   | Step                                                                 |
|-------|-------|----------------------------------------------------------------------|
| 1     | Agent | Confirm `pf` and `pa` are available in `calcStandings` return value  |
| 2     | Agent | Add `<th>PD</th>` and `pd` cell to both branches in `renderStandings`|
| 3     | Agent | Add `<th>PD</th>` and bump `colspan` 6 → 7 in `index.html`          |
| 4     | You   | Verify PD column on public standings tab                             |
| 5     | You   | Verify admin standings mirrors PD automatically                      |
