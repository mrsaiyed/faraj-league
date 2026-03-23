# Phase 4 — Draft (player bank + drag/drop + autosave) ✅ COMPLETE

> **Status: Complete.** All steps implemented. See "Changes made (summary)" below.

Execute these steps in order. **Agent** = tasks the Cursor agent does. **You** = manual steps you perform.

**Prerequisite:** Phase 1, Phase 2, Phase 2.5, Phase 3, Phase 3.5, Phase 3.6, and Phase 3.7 complete. Public site has Draft page with recap and placeholder; admin mirrors public with edit overlays on draft_recap and draft_placeholder.

---

## Changes made (summary)

All Phase 4 steps (1–8) were implemented. Additional refinements added:

| Area | Implementation |
|------|----------------|
| **Captain drag-and-drop** | Captain slot is a drop zone; drag player chip to assign captain. Captain chip is draggable (to bank, other teams, or other team's captain slot). Clear captain when player moved/deleted. |
| **Captain display logic** | Only show captain when they exist in roster; show "—" for ghost/deleted captains. `admin-players` clears `team.captain` when deleting a player who was captain. |
| **Players tab** | New admin nav tab: list all players, Add/Edit/Delete per player, "Delete all players" bulk action. Enables clearing test data before importing real roster. |
| **Team card styling** | Captain: turquoise-accented boxed section (`#2fa89a`); player rows: gold-accented (`#c8a84b`). Removed "(drop here)" hints. CSS specificity fix so turquoise shows on public site. |
| **Add Players** | Bulk add players via textarea (one per line); new players go to bank. |
| **Draft timer** | Timer, rounds select, start/pause/end, manual prev/next pick; "DRAFTING NOW" indicator on current team. |

---

## Refined business goal

**Replace manual draft with interactive drag-and-drop.** League staff run the draft via admin; public views a read-only draft board. No player bank visible to public — only team slots with assigned players. Admin sees the same layout plus a player bank at the bottom for unassigned players. Team cards are reorderable (admin can drag to swap draft order). Teams are visually distinct via strong dividers.

---

## Principles

- **Use existing schema** — No new tables. Bank = season players with no roster entry; assigned = players in rosters. Draft writes directly to `rosters`. Simpler and scalable.
- **Admin = public + edit overlays** — Draft page follows Phase 3.7: admin uses the exact same layout as public. Same team cards, same structure. Admin adds: player bank (bottom) and drag-and-drop. Edit overlays remain on draft_recap and draft_placeholder.
- **Transform at boundary** — Add `draftBank` and `draftTeamOrder` to transform; render consumes `config.DB`. No render logic changes for other pages.
- **Static deployment** — Public and admin remain static HTML + JS. Writes via Edge Functions.
- **No secrets in client** — Only `SUPABASE_ANON_KEY`. Admin writes use JWT + Edge Functions.

---

## Alignment with all_phases & business goal

- **all_phases.md Phase 4:** Draft data (players by team + bank), Draft API (assign/unassign), Draft UI (player bank, team boxes, drag-and-drop, autosave). Visual mirror: Admin Draft = public Draft + edit overlays.
- **Decisions:** (1) Use rosters directly — bank = players not in rosters. (2) Public sees only team slots, not bank. (3) No pick order — team cards draggable to reorder; team cards are not in the bank. (4) Number of team slots = teams in season (from Teams page / DB). (5) Player bank shows existing season players. (6) Strong dividers between team cards.

---

## Step 1 — Agent: Content block for draft team order ✅

**Who:** Agent

**What:**

1. **Add `draft_team_order` to `admin-content` valid keys:**
   - Extend `validKeys` in `supabase/functions/admin-content/index.ts` to include `draft_team_order`.
   - Value: JSON string `["uuid1","uuid2",...]` — ordered list of team IDs for draft board display.
   - Scoped by `season_id` (per-season draft order).
   - When empty/null: derive order from teams sorted by `sort_order`.

2. **No schema migration** — `content_blocks` already exists; key is free-form.

**How:** In Agent mode:

> Implement Phase 4 Step 1 from phase4.md: Add draft_team_order to admin-content validKeys. Value is JSON array of team IDs for draft board order.

---

## Step 2 — Agent: Data layer — draft bank and team order

**Who:** Agent

**What:**

1. **Extend `js/data.js` `transformSeasonData`:**
   - **draftBank:** Array of players for the season who have no roster entry *for any team in this season*. Shape: `[{ id, name, jersey_number }]`. Compute with roster scoped to current season's teams:
     ```js
     const seasonTeamIds = new Set((rawTeams || []).map(t => t.id));
     const draftBank = (players || []).filter(p =>
       !(rosters || []).some(r => r.player_id === p.id && seasonTeamIds.has(r.team_id))
     ).map(p => ({ id: p.id, name: p.name, jersey_number: p.jersey_number }));
     ```
   - **draftTeamOrder:** Parse `content_blocks.draft_team_order` (season-scoped) as JSON array of team IDs. If null/empty/invalid, use teams sorted by `sort_order`, then map to IDs. **Filter out stale IDs:** only include team IDs that exist in the current season's teams (in case a team was deleted).
   - Attach to returned data and to `config.DB`: `config.DB.draftBank`, `config.DB.draftTeamOrder`.

2. **Ensure teams for draft board** use `draftTeamOrder` when rendering: order team cards by this array (fallback to teams by sort_order).

**How:** In Agent mode:

> Implement Phase 4 Step 2 from phase4.md: Add draftBank (players not in rosters for this season's teams—scope rosters by seasonTeamIds) and draftTeamOrder (from content_blocks or teams sort_order, filtered to valid team IDs) to transformSeasonData and config.DB.

---

## Step 3 — Agent: Public Draft page — draft board (no bank) ✅

**Who:** Agent

**What:**

1. **Replace placeholder with draft board:**
   - **Show draft board** when `config.DB.teams.length > 0` — render team cards.
   - **Show draft_placeholder** (e.g. "Draft board coming soon") when `config.DB.teams.length === 0`.
   - Render **team cards** in a grid or row layout. Number of cards = `config.DB.teams.length` (6, 7, 8, etc. — whatever exists for the season).
   - Order team cards by `config.DB.draftTeamOrder` (fallback: teams by sort_order).

2. **Each team card:**
   - Team name (from team).
   - List of assigned players (from team.roster). Display: name, optional jersey number.
   - **Strong dividers** between cards: e.g. thick border, or `border-left: 4px solid` with distinct separator, or `box-shadow` / `outline` to create clear visual separation. Not different background colors — use strong dividers per user preference.

3. **Empty state:**
   - No teams: show draft_placeholder (content block) or "Draft board coming soon."
   - Teams exist but all rosters empty: show team cards with empty player lists (or "No players yet").

4. **Public never sees bank** — Only team slots with their players.

5. **Preserve draft recap** — Draft recap (content block) stays above the draft board.

**How:** In Agent mode:

> Implement Phase 4 Step 3 from phase4.md: Public Draft page shows team cards with strong dividers, players per team, ordered by draftTeamOrder. No player bank. Preserve draft recap.

---

## Step 4 — Agent: Admin Draft page — player bank + same layout ✅

**Who:** Agent

**What:**

1. **Admin Draft = Public Draft layout + player bank:**
   - Same team cards (same structure, same dividers) as public.
   - Below team cards: **Player Bank** section — "Unassigned Players" or similar label.
   - Player bank lists `config.DB.draftBank`: players with no roster entry. Display name, optional jersey number.

2. **Strong dividers** between team cards (same as public).

3. **Edit overlays** on draft_recap and draft_placeholder remain (from Phase 3.7). No new edit overlays for draft board itself — interactions are drag-and-drop.

4. **Empty bank:** If draftBank is empty, show "All players assigned" or hide bank section.

**How:** In Agent mode:

> Implement Phase 4 Step 4 from phase4.md: Admin Draft shows same team cards + player bank below. Strong dividers. Edit overlays on recap/placeholder preserved.

---

## Step 5 — Agent: Admin Draft — drag-and-drop (players)

**Who:** Agent

**What:**

1. **HTML5 Drag and Drop (or lightweight library):**
   - Use native HTML5 `draggable`, `ondragstart`, `ondragover`, `ondrop` — no new dependency if possible. Or use a small lib (e.g. Sortable.js) only if native is unwieldy for cross-container drag. Prefer native for simplicity.

2. **Draggable elements:**
   - Each **player chip** in the bank is draggable.
   - Each **player chip** in a team card is draggable.

3. **Drop targets:**
   - Each **team card** is a drop zone (accept player).
   - The **player bank** is a drop zone (accept player — unassign from team).

4. **On drop:**
   - Bank → Team: Call `admin-players` with `{ id: player_id, team_id: team_id }`. Insert roster entry.
   - Team → Team: Call `admin-players` with `{ id: player_id, team_id: new_team_id }`. Update roster (existing logic replaces roster entry).
   - Team → Bank: Call `admin-players` with `{ id: player_id, team_id: null }`. Remove roster entry.
   - **Optimistic UI:** Update DOM immediately; revert on error and show feedback ("Error: ...").
   - **Autosave:** No explicit Save button — each drop triggers immediate API call. Show "Saved." toast or inline feedback briefly on success.

5. **Re-fetch or local update:** After successful drop, either re-fetch `fetchSeasonData` and re-render, or update local state (draftBank, team roster) optimistically. Ensure UI stays in sync.

**How:** In Agent mode:

> Implement Phase 4 Step 5 from phase4.md: Add drag-and-drop for players (bank↔team, team↔team). Use admin-players for assign/unassign. Optimistic UI, autosave on drop, revert on error.

---

## Step 6 — Agent: Admin Draft — drag-and-drop (team card order) ✅

**Who:** Agent

**What:**

1. **Team cards reorderable:**
   - Admin can drag a **team card** to swap positions with another team card.
   - Team cards are not dropped into the bank — only swapped with each other.
   - Use native drag-and-drop or Sortable.js for reordering a list of team cards.

2. **On reorder:**
   - Compute new order (array of team IDs).
   - Call `admin-content` with `{ key: 'draft_team_order', value: JSON.stringify([...teamIds]), season_id }`.
   - Optimistic UI: reorder immediately; revert on error.
   - Success feedback: "Saved." or similar.

3. **Persistence:** `draft_team_order` stored in content_blocks; public and admin both use it for display order.

**How:** In Agent mode:

> Implement Phase 4 Step 6 from phase4.md: Team cards draggable to reorder. Save new order to draft_team_order via admin-content. Optimistic UI, revert on error.

---

## Step 7 — Agent: Shared render and structure

**Who:** Agent

**What:**

1. **Shared render function:**
   - `renderDraft(adminMode)` in `js/render.js` — single function used by both public and admin.
   - When `adminMode`: include player bank section, enable drag-and-drop attributes/event handlers.
   - When `!adminMode`: omit bank, no drag handlers.
   - Admin passes `adminMode: true` when rendering Draft; public passes `adminMode: false` (or omit).
   - **Legacy cleanup:** Remove or refactor `admin/js/sections.js` `renderDraft` if it exists — it is a form-based draft editor that conflicts with the visual-mirror approach. Admin should use the shared `js/render.js` `renderDraft` via `renderAll`, as with other pages.

2. **Draft page HTML structure:**
   - Ensure `index.html` and `admin/index.html` Draft page sections have the same container IDs/structure for team cards and (when admin) bank. Use a wrapper div for draft board and bank that renderDraft populates.
   - Replace static placeholder div with dynamic container that `renderDraft` fills.

3. **CSS for strong dividers:**
   - Add or extend `css/main.css` with draft-specific styles: e.g. `.draft-team-card { border-left: 4px solid var(--border-color); }` or similar to create strong visual separation between team cards. Ensure dividers are prominent.

**How:** In Agent mode:

> Implement Phase 4 Step 7 from phase4.md: Shared renderDraft(adminMode), same HTML structure for public/admin, CSS for strong dividers between team cards.

---

## Step 8 — Agent: lib/api and fetchSeasonData ✅

**Who:** Agent

**What:**

1. **Ensure `getSeasonData` returns content_blocks** — Already done in Phase 3. Verify `draft_team_order` is fetched when content_blocks are loaded (key is stored; no special handling needed).

2. **No new API** — Draft uses existing: `getSeasonData` (read), `admin-players` (assign/unassign), `admin-content` (draft_team_order). No new Edge Function.

**How:** In Agent mode:

> Implement Phase 4 Step 8 from phase4.md: Verify getSeasonData includes content_blocks. Confirm no new API needed; admin-players and admin-content cover draft writes.

---

## Step 9 — You: Test draft flow

**Who:** You

**What:**

1. **Setup:** Ensure a season has teams and players. Some players with rosters, some without.
2. **Admin:** Open Draft tab. Confirm player bank shows unassigned players; team cards show assigned. Drag player from bank to team → confirm "Saved." and player moves. Drag player from team to bank → confirm unassign. Drag player between teams → confirm move. Drag team cards to reorder → confirm order persists after refresh.
3. **Public:** Open Draft tab. Confirm no bank visible. Confirm team cards with players; strong dividers between cards. Confirm order matches admin's draft_team_order.
4. **Season switcher:** Change season; confirm draft board reflects correct season's data.

---

## Step 10 — You: Verify Phase 4 complete

**Who:** You

**What:** Confirm:

1. Public Draft: team cards only, strong dividers, players per team, no bank. Draft recap above.
2. Admin Draft: same layout + player bank, drag-and-drop (players: bank↔team, team↔team; teams: reorder). Autosave on drop. Optimistic UI with revert on error.
3. `draft_team_order` in content_blocks; admin-content accepts it.
4. admin-players handles assign (`team_id`) and unassign (`team_id: null`).
5. No new tables; rosters and content_blocks used.
6. Static deployment preserved.

---

## Summary

| Order | Who   | Step                                                                 | Status |
|-------|-------|----------------------------------------------------------------------|--------|
| 1     | Agent | Content block draft_team_order (admin-content validKeys)             | ✅ |
| 2     | Agent | Data layer: draftBank, draftTeamOrder in transform                   | ✅ |
| 3     | Agent | Public Draft: team cards, strong dividers, no bank                   | ✅ |
| 4     | Agent | Admin Draft: same + player bank                                      | ✅ |
| 5     | Agent | Admin Draft: drag-and-drop players (assign/unassign via admin-players)| ✅ |
| 6     | Agent | Admin Draft: drag-and-drop team card order (draft_team_order)        | ✅ |
| 7     | Agent | Shared renderDraft(adminMode), CSS dividers                          | ✅ |
| 8     | Agent | Verify lib/api and fetchSeasonData                                   | ✅ |
| 9     | You   | Test draft flow (admin + public)                                     | — |
| 10    | You   | Verify Phase 4 complete                                              | — |

---

## Data reference (for Agent)

**Draft bank (config.DB.draftBank):**
- `[{ id, name, jersey_number }, ...]` — Players for current season with no roster entry *for any team in this season*. Scope rosters to season's teams to avoid cross-season leakage.

**Draft team order (config.DB.draftTeamOrder):**
- `[teamId1, teamId2, ...]` — Ordered team IDs for draft board display. From content_blocks `draft_team_order` or derived from teams.sort_order. Filter to valid team IDs only (exclude deleted teams).

**Roster assign/unassign (admin-players):**
- Assign: `{ id: player_id, team_id: team_id }` — Replaces roster; adds player to team.
- Unassign: `{ id: player_id, team_id: null }` — Removes player from team (back to bank).
- Delete: `{ delete: true, id: player_id }` — Removes player; clears `team.captain` if that player was captain.

**Captain:** Assign via drag-drop to captain slot; `admin-teams` for `{ id: team_id, captain: player_name }`. Display: only show captain when they exist in roster (ghost captains show "—").

**Team order (admin-content):**
- `{ key: 'draft_team_order', value: JSON.stringify([...teamIds]), season_id }` — Saves draft board team order.

**Team count:** Derived from `config.DB.teams.length` — no separate config. 6 teams → 6 slots; 8 teams → 8 slots.
