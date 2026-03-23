# Phase 3.6 — Game stat sheets (Stats + Games)

Execute these steps in order. **Agent** = tasks the Cursor agent does. **You** = manual steps you perform.

**Prerequisite:** Phase 1, Phase 2, Phase 2.5, Phase 3, and Phase 3.5 complete. Public site has Schedule tab; admin has Games and Stats CRUD; `games.scheduled_at` and `seasons.current_week` exist; `config.DB.scores` includes `scheduled_at`.

---

## Principles

- **Replace paper** — Digital stat sheets mirror paper workflows: one game, two teams, players × stats grid. Admin enters during or after games.
- **Transform at boundary** — Add `game_stat_values` to API fetch; map to app shape in `transformSeasonData`. Render logic consumes `config.DB.gameStatValues` or scores with embedded box-score data.
- **Static deployment** — Public site remains static. Fans see updates on refresh ("live" = near-live via refresh).
- **Consistency** — Box score styling matches matchup cards; expandable UX is consistent across Schedule and Standings/Scores.
- **Score derivation** — Game scores derived from sum of points stat when available; admin can override manually in Games CRUD.

---

## Alignment with all_phases & business goal

- **all_phases.md Phase 3.6:** Schema (`game_stat_values`), admin stat sheet per game, score derivation, public expandable box score, Stats tab aggregation from game stats.
- **Business goal:** Replace paper stat sheets with digital ones. Fill out during/after games. Track points, fouls, admin-configurable stats per player per game. Enable fans to follow along (scores + box scores).

---

## Step 1 — Agent: Schema migration

**Who:** Agent

**What:**

1. **Create `game_stat_values` table:**
   - `game_id UUID NOT NULL` REFERENCES games(id) ON DELETE CASCADE
   - `player_id UUID NOT NULL` REFERENCES players(id) ON DELETE CASCADE
   - `stat_definition_id UUID NOT NULL` REFERENCES stat_definitions(id) ON DELETE CASCADE
   - `value NUMERIC NOT NULL DEFAULT 0`
   - PRIMARY KEY (game_id, player_id, stat_definition_id)
   - RLS: public read; admin writes via Edge Function (service_role)

2. **Add `scope` to `stat_definitions` (optional):**
   - `scope TEXT` nullable — values: `'game'` (used in stat sheets) or `'season'` (season aggregates only). If null, treat as `'game'` for backward compatibility.
   - Default: all existing stats are game-scoped. Admin can add new stat types with scope.

3. **RLS policy:** Public SELECT on `game_stat_values`. No direct insert/update from client.

**How:** In Agent mode:

> Implement Phase 3.6 Step 1 from phase3.6.md: Create game_stat_values table (game_id, player_id, stat_definition_id, value). Optionally add scope to stat_definitions. RLS public read.

---

## Step 2 — Agent: Edge Function for game stat values

**Who:** Agent

**What:**

1. **Create `admin-game-stats` Edge Function** (or extend `admin-games`):
   - Accepts `POST` with `Authorization: Bearer <token>`
   - Body: `{ game_id, player_id, stat_definition_id, value }` for single upsert, or `{ game_id, values: [{ player_id, stat_definition_id, value }, ...] }` for bulk
   - Upsert into `game_stat_values` using service_role
   - On success: optionally recalc game scores from points stat and update `games.home_score` / `games.away_score` (see Step 3)

2. **Validation:** Verify `game_id` exists and belongs to the season; `player_id` is in the game's rosters (home or away team); `stat_definition_id` exists. Return 400 with clear message on validation failure.

3. **Score derivation logic (in Edge Function):**
   - When saving game stat values: if stat is "points" (slug), sum points per team (home vs away from game's home_team_id, away_team_id + rosters) and update `games.home_score`, `games.away_score`.
   - **Score derivation vs manual override:** Stat sheet save overwrites game scores with derived values. Admin can manually correct scores in Games Edit; the next stat sheet save will overwrite them again. Document in admin UI: "Scores auto-update from points when stat sheet is saved. Use Games Edit to override if needed."

**How:** In Agent mode:

> Implement Phase 3.6 Step 2 from phase3.6.md: Create admin-game-stats Edge Function. Upsert game_stat_values. Optionally derive game scores from points stat on save.

---

## Step 3 — Agent: Data layer — fetch and transform game_stat_values

**Who:** Agent

**What:**

1. **Extend `lib/api.js` `getSeasonData`:**
   - After fetching games, fetch `game_stat_values` for all game IDs in the season
   - Add `game_stat_values` to returned data

2. **Extend `js/data.js` `transformSeasonData`:**
   - Add `gameId` to each score in the scores array: `{ week, game, gameId: g.id, t1, t2, t1Id, t2Id, s1, s2, scheduled_at }` (t1Id, t2Id = home_team_id, away_team_id for roster lookup)
   - Build `gameStatValues` map: `{ [gameId]: { [playerId]: { [statDefId]: value } } }` or array of `{ gameId, playerId, statDefId, value }`
   - Attach to config: `config.DB.gameStatValues`
   - Ensure teams include roster with player IDs: e.g. `roster: [{ id, name }]` per team for box score rows

3. **Ensure scores shape includes `gameId`, `t1Id`, `t2Id`** (team IDs) for roster lookup. Teams need `roster` or `rosterPlayerIds` for box score.

**How:** In Agent mode:

> Implement Phase 3.6 Step 3 from phase3.6.md: Extend getSeasonData to fetch game_stat_values. Add gameId to scores in transformSeasonData. Build gameStatValues map for render.

---

## Step 4 — Agent: Admin Games UI — Stat sheet entry

**Who:** Agent

**What:**

1. **Games list:** Add "Stat sheet" button next to each game (alongside Edit, Delete).

2. **Stat sheet view (modal or inline panel):**
   - Header: "Team A vs Team B — Week X, Game Y"
   - Two sections (or two tables side by side): Home team roster, Away team roster
   - Columns: Player name | [stat columns from stat_definitions with scope='game' or all]
   - Input fields for each cell (number inputs)
   - Save button: bulk submit all values to `admin-game-stats`
   - Success/error feedback ("Saved." or error message). Optional: optimistic UI (update display before response; revert on error).
   - **Empty roster:** If roster is empty for either team, show message: "Add players to teams in Players tab first."

3. **Roster source:** Use rosters for home_team_id and away_team_id. Include captain + roster players. Up to 7 players per team (or configurable); show all roster players.

4. **Stat columns:** Use `stat_definitions` where scope is 'game' or null. Order by sort_order. At minimum: points, fouls if defined.

5. **Score display:** Show current game score (home_score, away_score). After save, scores update if derived from points. Allow manual override in main Games Edit form.

**How:** In Agent mode:

> Implement Phase 3.6 Step 4 from phase3.6.md: Add Stat sheet button to each game in admin Games. Stat sheet view: Team A vs Team B, roster players, input cells per stat. Save to admin-game-stats. Show game score.

---

## Step 5 — Agent: Admin Stats UI — Stat definitions for stat sheets

**Who:** Agent

**What:**

1. **Stat definitions:** Ensure admin can add stat types (points, fouls, rebounds, etc.). Existing Stats CRUD already supports this.

2. **Scope (if added):** When adding a stat definition, allow setting scope: "game" (for stat sheets) or "season" (season aggregates only). Default: game.

3. **Stat sheet columns:** Stat sheet in Games uses only game-scoped stats (or all if scope not used).

**How:** In Agent mode:

> Implement Phase 3.6 Step 5 from phase3.6.md: Ensure stat definitions support game scope. Stat sheet uses game-scoped stats for columns.

---

## Step 6 — Agent: Public Schedule — expandable matchup cards with box score

**Who:** Agent

**What:**

1. **Expandable matchup cards:**
   - Each matchup card in `renderSchedule` gets a clickable area (e.g. chevron or "View box score") to expand.
   - Expanded state toggles on click. Use data attribute or inline state (e.g. `data-expanded="gameId"` on container).

2. **Played games — full box score:**
   - When expanded: show team score (t1 s1 – t2 s2), then two tables (or one combined): Team 1 players with PTS, Fouls, etc.; Team 2 players.
   - Data from `config.DB.gameStatValues` keyed by gameId. Roster from teams (captain + players).
   - If no game stat values yet, show empty cells or "—".

3. **Unplayed games — skeleton:**
   - When expanded: show "Team A vs Team B", empty score line "— – —", roster player names with empty stat columns, or message "Stats will appear after the game."
   - **Empty roster:** If roster is empty for an unplayed game, show team names and "Roster TBD" or similar.
   - Scheduled time if available.

4. **Styling:** Reuse `.matchup-card`, `.matchups-grid`. Box score in a nested `.box-score` div with table or grid. Match Standings/Scores aesthetic.

5. **Implementation note:** Structure the box score logic so it can be extracted into a shared `renderBoxScore()` helper in Step 7 for reuse by `renderScores`.

6. **Scores shape:** Scores must include `gameId` for lookup. Teams must include roster (captain + players) for box score rows.

**How:** In Agent mode:

> Implement Phase 3.6 Step 6 from phase3.6.md: Make Schedule matchup cards expandable. Played games: full box score (team score + per-player stats). Unplayed: skeleton. Use gameId from scores, gameStatValues for data.

---

## Step 7 — Agent: Public Standings/Scores — expandable box score

**Who:** Agent

**What:**

1. **Refactor and reuse:** Extract the box score logic from Step 6 into a shared helper (e.g. `renderBoxScore(gameId, game, teams, gameStatValues)`) and use it in both `renderSchedule` and `renderScores`. Step 6 created the logic; this step centralizes it.

2. **Standings page Scores section:** Matchup cards in `renderScores` get expandable box score (same behavior as Schedule) using the shared helper.

3. **Consistency:** Same expand UX, same box score layout. Empty roster and skeleton handling from Step 6 apply here too.

**How:** In Agent mode:

> Implement Phase 3.6 Step 7 from phase3.6.md: Add expandable box score to Standings Scores section. Reuse box score render helper from Schedule.

---

## Step 8 — Agent: Stats tab — aggregate from game stats

**Who:** Agent

**What:**

1. **Aggregation:** Season stats (PPG, total points, etc.) are computed from `game_stat_values` for games in the season. Sum points per player across games; count games played (GP) from games with at least one stat.

2. **Fallback:** If `game_stat_values` is empty, fall back to existing `player_stat_values` (season-level) for Stats tab. Document: game stats take precedence when available.

3. **Optional link:** Add "View box scores" link or similar that navigates to Schedule (or filtered view). Low priority; can skip initially.

**How:** In Agent mode:

> Implement Phase 3.6 Step 8 from phase3.6.md: Stats tab aggregates from game_stat_values. GP from games played. Fallback to player_stat_values if no game stats.

---

## Step 9 — Agent: Standings derivation from game stats

**Who:** Agent

**What:**

1. **Standings:** Continue to use `games.home_score` and `games.away_score` for W-L, PF, PA. These are updated by score derivation when stat sheet is saved (or manually in Games CRUD).

2. **No change to standings calc** if scores are kept in sync. Ensure `calcStandings` uses config.DB.scores (which reflect games table).

**How:** In Agent mode:

> Implement Phase 3.6 Step 9 from phase3.6.md: Confirm standings use games.home_score/away_score. Score derivation updates these on stat save.

---

## Step 10 — You: Deploy Edge Function

**Who:** You

**What:**

1. Deploy `admin-game-stats` (or updated admin-games):
   ```bash
   npx supabase functions deploy admin-game-stats
   ```
2. Ensure `ADMIN_PASSWORD` (and JWT verification) work for the new function.

**Verify:** Admin can save stat sheet and see "Saved." feedback.

---

## Step 11 — You: Test stat sheet entry

**Who:** You

**What:**

1. Open admin → Games. Select a game that has been played (or create one with scores).
2. Click "Stat sheet". Enter points for a few players on each team.
3. Save. Confirm "Saved." and scores update if derived from points.
4. Refresh public site. Confirm Schedule expandable shows box score with entered stats.

---

## Step 12 — You: Test public box score

**Who:** You

**What:**

1. Public Schedule: expand a played game. Confirm full box score (team score + player stats).
2. Expand an unplayed game. Confirm skeleton (empty rows or "Stats will appear after the game").
3. Standings Scores: same behavior.
4. Stats tab: confirm season aggregates reflect game stat values.

---

## Step 13 — You: Verify Phase 3.6 complete

**Who:** You

**What:** Confirm:

1. `game_stat_values` table exists; RLS allows public read.
2. Admin Games has Stat sheet per game; save works.
3. Scores derive from points when stat sheet saved (or manual override works).
4. Public Schedule and Standings Scores have expandable matchup cards.
5. Played games show full box score; unplayed show skeleton.
6. Stats tab aggregates from game stats.
7. No new build step; static deployment preserved.

---

## Summary

| Order | Who   | Step                                                                 |
|-------|-------|----------------------------------------------------------------------|
| 1     | Agent | Schema migration (game_stat_values, stat_definitions scope)          |
| 2     | Agent | Edge Function admin-game-stats (upsert, score derivation)            |
| 3     | Agent | Data layer: fetch game_stat_values, add gameId to scores, transform  |
| 4     | Agent | Admin Games UI — Stat sheet entry                                    |
| 5     | Agent | Admin Stats — stat definitions scope for stat sheets                 |
| 6     | Agent | Public Schedule — expandable box score                               |
| 7     | Agent | Public Standings/Scores — expandable box score                       |
| 8     | Agent | Stats tab — aggregate from game_stat_values                          |
| 9     | Agent | Standings derivation (confirm scores in sync)                        |
| 10    | You   | Deploy admin-game-stats Edge Function                                |
| 11    | You   | Test stat sheet entry                                                |
| 12    | You   | Test public box score                                                |
| 13    | You   | Verify Phase 3.6 complete                                            |

---

## Data reference (for Agent)

**game_stat_values:**

| Column            | Type   | Notes                    |
|-------------------|--------|--------------------------|
| game_id           | UUID   | FK games                 |
| player_id         | UUID   | FK players               |
| stat_definition_id| UUID   | FK stat_definitions      |
| value             | NUMERIC| Per-game, per-player val |

**Scores shape (extended):**

| Field        | Type   | Notes                                    |
|--------------|--------|------------------------------------------|
| gameId       | string | UUID of games row (new)                  |
| t1Id, t2Id   | string | home_team_id, away_team_id for roster   |
| week         | int    | Week number                              |
| game         | int    | Game index                               |
| t1, t2       | string | Team names                               |
| s1, s2       | string | Scores                                   |
| scheduled_at | string | ISO or null                              |

**gameStatValues (config.DB):**

- Map: `{ [gameId]: { [playerId]: { [statDefId]: value } } }` or array `{ gameId, playerId, statDefId, value }[]`
- Lookup by gameId to render box score for a game

**Teams (for box score):** Each team needs `roster: [{ id, name }]` (player ID + name) for box score rows. Extend transform if needed.

**Score derivation:** Sum `game_stat_values` where stat_definitions.slug = 'points' for each team's roster; update games.home_score, games.away_score. Stat sheet save overwrites game scores; manual override in Games Edit persists until next stat sheet save.
