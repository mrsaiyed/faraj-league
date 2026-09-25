# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm test                              # Run all unit tests (vitest)
npx vitest run tests/standings.test.js  # Run a single test file (also: tests/stats.test.js, tests/seasons.test.js, tests/api.test.js)

npm run seed      # Seed database with placeholder data

# Import a season's player names (idempotent; --sql prints SQL for the Dashboard instead)
node scripts/import-roster.js scripts/rosters/fall2026.json
node scripts/import-roster.js scripts/rosters/fall2026.json --sql > supabase/seed_fall2026_players.sql

# Deploy all Edge Functions at once
npx supabase functions deploy auth-login admin-export-csv admin-seasons admin-teams admin-players admin-games admin-awards admin-stats admin-sponsors admin-media admin-content admin-media-slots admin-game-stats

# Push DB migrations (apply in order: 001–012)
npx supabase db push
```

Tests cover `lib/standings.js` (`calcStandings`, `calcSeeds`), `lib/stats.js` (`aggregateStats`), `lib/seasons.js` (slug/ordering helpers), `lib/team-logos.js` (logo resolution), `lib/draft-bank.js` (player-bank search), `lib/roster.js` (display ordering), `lib/game-tracker.js` (live stat engine), `lib/sponsors.js` (sponsor slots), `lib/live-sync.js` (public live refresh), `lib/game-clock.js` (game status + clock), `lib/season-logo.js` (per-season hero logo), `lib/champion-photo.js` (per-season hero photo) and `lib/trophy.js` (champions trophy cards, slots and card layout) — pure functions only, no DB. `tests/api.test.js` covers `getSeasonData`'s season scoping and `getChampionData`'s cross-season reads against a stub Supabase client.

No build step — this is a static site with ES modules served directly.

## Architecture

**Stack**: Static HTML/CSS/ES modules (no bundler) + Supabase (PostgreSQL + Edge Functions) + GitHub Pages hosting.

### Public Site

`index.html` → `js/app.js` (orchestration) → `js/data.js` (fetch) → `lib/api.js` (Supabase queries) → `js/render.js` (DOM updates).

Data flow:
1. `fetchSeasons()` populates the season dropdown
2. `fetchSeasonData(slug)` fetches all season data in parallel (teams, players, rosters, games, awards, stats, sponsors)
3. `transformSeasonData(raw)` maps Supabase shape → internal `config.DB` shape (run once on fetch)
4. `renderAll()` updates all page sections from `config.DB`
5. `changeSeason(slug)` repeats steps 2–4; `showPage(id)` toggles `.page.active`

### Admin Site

`admin/index.html` is the **public site + edit overlays** — same layout, same width, same nav. Admin logic adds edit controls to every editable region.

`admin/js/admin.js` handles login and `adminFetch(fnName, options)` — all writes go through Supabase Edge Functions with `X-Admin-Token` header (JWT stored in localStorage).

`admin/js/admin-data.js` is the admin counterpart to `js/data.js` — loads season data and hydrates `config.DB` for admin pages.

`admin/js/page-templates.js` contains HTML templates extracted from `index.html` so the admin mirror renders the same DOM structure. **Must stay in sync with `index.html`** — public render functions find elements by ID in these templates. Any structural DOM change in `index.html` (new IDs, section restructuring) must be manually mirrored in `page-templates.js`.

`admin/js/edit-overlays.js` attaches inline Edit buttons to content-block regions and handles the inline/modal editor UI.

`admin/js/sections.js` wires up all CRUD UI (inline edit overlays, modals, floating drawer for season/logout controls).

### Edge Functions (`supabase/functions/`)

All admin writes go through Edge Functions — never direct DB access from the browser:
- `auth-login` — validates password, returns 24h JWT
- `admin-{seasons,teams,players,games,awards,stats,sponsors,media,media-slots,game-stats,content,export-csv}` — CRUD handlers
- `_shared/auth.ts` — JWT verification shared across all admin functions
- `admin-game-stats` — saves `game_stat_values` rows **and** derives/updates `games.home_score`/`away_score` from point totals; this is why scores update when a stat sheet is saved

Public reads use the Supabase anon key directly from `lib/api.js`.

### Key Files

| File | Purpose |
|------|---------|
| `js/config.js` | Supabase URL, anon key, sponsor/conference constants; `config.CURRENT_WEEK` and `config.TOTAL_WEEKS` runtime state; `getConferences()` reads dynamic conference list from `content_blocks.conferences_layout` (falls back to Mecca/Medina); `confShortLabel()` returns abbreviated conference name; `motmLabel(game)`, `akhlaqLabel(week)`, `statsTitle()` are sponsor-branded label helpers that read from `config.SP2A`/`SP2B` |
| `js/data.js` | `fetchSeasons`, `fetchSeasonData`, `transformSeasonData`; `deriveWeeks(scores, season)` derives `TOTAL_WEEKS`/`CURRENT_WEEK` — `seasons.total_weeks` wins when set but is floored at the highest week that has a game (so a stale setting can never hide scheduled or playoff weeks); with no setting the season runs to at least 8 weeks; `applySponsorOverrides(overrides)` mutates `config` SP1/SP2A/SP2B from sponsor rows; `getChampionCards()` reads every season's champion cards once for the whole page (the hero plaque and both trophies share it; a failed read is dropped so the next caller retries), and `loadReigningChampion()` puts the newest one on `config.reigningChampion` |
| `js/render.js` | All DOM updates: `renderAll`, `renderHome`, `renderStandings`, `renderSchedule`, `renderScores`, `renderStats`, `renderAwards`, etc. `buildMatchupCard()` is the shared helper for home/schedule/scores cards; its header is `Game N | time | date`, and a game with no date of its own shows its week's (the date the week heading shows). `TEAM_LOGOS` map + `teamLogoUrl()` serve team logos from `images/teams/` (keyed by lowercase name slug) |
| `scripts/rosters/*.json` | Per-season player lists — the source of truth for an import. Edit the JSON, then regenerate the SQL; never hand-edit `supabase/seed_*.sql` |
| `scripts/import-roster.js` | Imports a roster JSON into one season. Writes via the service role, or `--sql` emits SQL for the Dashboard. Idempotent: skips names already in that season (case-insensitive), so re-running adds nothing |
| `lib/game-tracker.js` | Pure live-tracker engine: `deriveState(events, cursor, config)` derives box score, team score, fouls and on-court lineups from an append-only event log; `appendEvent`/`undo`/`redo` move a cursor rather than editing totals; `toStatValues()` maps totals onto `game_stat_values` rows; `livePlayerSeconds()` adds the stint in progress to banked court time; `bonusFor()` reads the per-half team-foul bonus; `periodLabel()`/`PERIOD_OPTIONS` back the H1/H2/OT1-3 period picker |
| `lib/game-clock.js` | Pure game status and clock: `gameStatus()` (NULL status + scores = final, so pre-012 seasons are unaffected), `displayClockSeconds()` extrapolates a running clock from its stored anchor, `statusLine()` renders `H1 12:34` / `Half time` |
| `lib/live-sync.js` | Pure `liveFingerprint(data)` (scores + every stat value, order-independent) and `shouldRepaint()` for the public site's live poll |
| `admin/js/game-reset.js` | `clearGame()` returns a game to "not played": deletes its stat rows, empties DNP, then **nulls** the score. Zeroing is not enough — every "played" check is `score !== ''`, which `'0'` passes |
| `admin/js/live-tracker.js` | The live tracker UI. **Admin only** — imported on demand from `sections.js`, styled by `admin/css/live-tracker.css`; the public site references neither |
| `admin/js/tracker-sound.js` | The bonus horn, synthesised with Web Audio rather than shipped as an audio file (no build step, no asset pipeline). The `AudioContext` is built on first use — inside the tap that recorded the foul — because iOS Safari only starts audio from a gesture |
| `lib/sponsors.js` | Pure sponsor-slot helpers: `SPONSOR_SLOTS` (title / mecca / medina), `sponsorOverridesFrom(rows)` builds a **complete** override set so applying it resets slots a season has no row for, and `highlightSponsorNames()` colours the season's own sponsor names in one pass |
| `lib/team-logos.js` | Pure logo resolution: `resolveTeamLogo(team, name, seasonSlug)` prefers that season's `teams.logo_url`, then a logo committed for that season's team (`SEASON_TEAM_LOGOS`), then the files committed in `images/teams/` matched loosely by name. `logoScaleCss()` renders the per-logo zoom (some are `[x, y]`) |
| `lib/season-logo.js` | Pure `seasonLogo(slug)` for the home hero: `SEASON_LOGOS` maps a season slug to `{ src, variant, alt }` — `spring2026` keeps the original badge (`faraj-logo.png`), `fall2026` is the City Edition (`images/logos/fall2026-city-edition.svg`), and any other season gets `DEFAULT_LOGO`, the newest edition. `variant` selects `.hero-league-logo--badge` / `--mark` in `css/main.css` |
| `lib/champion-photo.js` | Pure `championPhoto(slug)` for the home hero's photo: `CHAMPION_PHOTOS` maps a season slug to its winners' photo (`{ base, widths, height, alt }`, files `images/champions/<slug>-<width>.jpg`); a season with no entry — one still being played — gets `DEFAULT_PHOTO`, the newest (last) entry. `photoSources()` builds the `<img>`'s `src`/`srcset`/`width`/`height` |
| `lib/trophy.js` | Pure champions-trophy logic: `buildChampionCards()` (one card per season with a champion, oldest first), `cardLines()` (the engraving: `Team Season`, `Captain: …`, the rest two to a line in draft order), `slotForIndex()` (front, then right, back, left; six slots each), `layoutCard()` (type size and pitch measured off the real plate, shared by the 3D texture and the enlarged HTML card), `reigningChampion()` (the newest season's card, for the hero) |
| `js/trophy.js` | The 3D champions trophy — at the top of the awards page and again as the home page's last section (three.js from esm.sh, imported only when one of them is about to be seen). Scroll-driven camera, drag/arrow turning, hover loupe, tap/click full-screen card, WebGL-less and reduced-motion fallbacks. Styled by `css/trophy.css`; the plaque's engraved badge is `images/trophy/plaque-logo.png` |
| `js/champion-card.js` | The HTML champions card (`cardElement()`, same lines and layout maths as the 3D plate), the card font (`loadCardFont()`), and the hover loupe and full-screen view (`overlays()`, one shared set). Split out of `js/trophy.js` so the home hero's plaque never loads three.js |
| `lib/draft-bank.js` | Pure `filterBankPlayers(players, query)` for the admin draft search — prefix match on the whole name or any word in it, original order preserved |
| `lib/seasons.js` | Pure season helpers: `slugifySeasonLabel('Fall 2026')` → `'fall2026'`, `isValidSeasonSlug()`, `sortSeasons()` (active season first, then newest-first), `activeSeasonSlug()`. `SEASON_SLUG_RE` is mirrored server-side in `admin-seasons` |
| `lib/standings.js` | Pure functions: `calcStandings(teams, scores)` → W/L/PF/PA (ties = loss for both); `calcSeeds(teams, scores)` → per-conf seed numbers with tiebreakers (conf record → H2H → PD → PF); returns `'TBD'` for all when no scored games |
| `lib/stats.js` | Pure function: `aggregateStats()` → player stat aggregation; prefers `game_stat_values` (per-game sheet), falls back to `player_stat_values` (manual season totals) when no game stats exist |
| `admin/js/sections.js` | All admin CRUD section renderers — one `renderX(content, ctx)` per entity; wires modals, inline overlays, and the season/logout drawer |
| `admin/js/draft-drag-drop.js` | Drag-and-drop for draft UI |
| `admin/js/draft-timer.js` | Draft timer and round management |

### Non-obvious Behaviours

**Seasons**: `seasons.is_current` marks the active season — the public site loads it by default (`activeSeasonSlug()` falls back to the newest season if none is flagged). Migration 010 adds a partial unique index so only one season can be current; `admin-seasons` therefore always clears the flag on every other season *before* setting it, never the other way round.

**Creating a season**: the admin drawer's "New season" form posts `{ create: true, label, slug, is_current, total_weeks, copy_from_season_id, copy: { settings, teams, sponsors } }` to `admin-seasons`. The copy options carry `content_blocks` structure keys, team rows (names/conferences/captains, no players or rosters) and sponsor rows across from an existing season, so a new season starts with the same categories rather than blank. Per-season results (schedule, playoffs, draft, power rankings, awards, hero/season tag copy) are never copied.

**Roster imports are season-scoped by construction**: the generated SQL `CROSS JOIN`s the VALUES list against `seasons` filtered by slug, so a wrong or missing slug inserts zero rows rather than writing players into another season. The duplicate check is `season_id` + `lower(name)`, so the same person can appear in several seasons (they get one `players` row per season) while a re-run never doubles up within one.

**Live stat tracker (admin only)**: the "Live stats" button on a game opens `admin/js/live-tracker.js`. It records an append-only event log (score / foul / stat / sub / lineup / period) and derives everything from it, so undo and redo are just a cursor and can never drift from the totals. The log is held in `localStorage` per game (`faraj_live_tracker_<gameId>`), so a refresh or a locked tablet mid-game loses nothing. Saving derives totals and posts them through the **existing** `admin-game-stats` function, which already recomputes the final score — so the tracker needs no new table, Edge Function or migration. Only stats with a matching `stat_definitions.slug` are saved; the rest are named in a warning. Roster players who never appeared are sent as `dnp_player_ids`. Input works by dragging a token onto a player *or* tapping the token then the player — Pointer Events, not HTML5 drag-and-drop, because iOS Safari does not fire the latter.

**Team fouls and the bonus are per half, and the badge goes on the other team**: `teams[id].fouls` is the whole game (the box score); `teams[id].halfFouls` is what the bonus runs on, and a `period` event clears it for both teams. `bonusLevel()` is 1 at `BONUS_FOULS` (7) and 2 at `DOUBLE_BONUS_FOULS` (10). `bonusFor(state, teamId, opponentId)` deliberately returns two different things: `penalty` is that team's *own* foul trouble, which is what makes their count grow on screen, while `bonus` is what they *shoot* and comes from the **opponent's** fouls. Reading one for the other puts the "Single Bonus" badge on the team that committed the fouls, which is backwards. The `period` reset is guarded on the number actually changing, so a repeated "we are in period 2" event cannot wipe fouls already committed in it.

The horn sounds on the **crossing only**: the tracker keeps the level it last painted per team and fires only when it rises, so a repaint at 8 fouls is silent while the 7th sounds. It is primed after the first paint, so reopening a game already in the double bonus shows the badge without blaring. Half time lowers the level in silence, and the next 7th foul sounds again. Because the horn is a nicety and the badge is the real signal, every audio path swallows its own errors and a flash message names the team as well.

**The live tracker's phone-landscape layout is CSS-only**: `openLiveTracker()` already supports tap-to-score as well as drag (arm a token or a bench player, then tap the target — see the interaction rules atop `admin/js/live-tracker.js`), so a phone in landscape needed no JS change, only room to show both courts without scrolling. The `@media (orientation:landscape) and (max-height:500px)` block at the end of `admin/css/live-tracker.css` turns `.lt-panel` into a fixed-height flex column — header and token strip stay in view, each `.lt-court` scrolls internally — and is placed **after** the width-based stacking rule so it wins on a narrow-but-landscape phone (e.g. 667px wide lying down) that would otherwise still get the stacked, portrait layout. The play log and hint text are hidden at this size to give the courts the room; nothing is lost, they reappear once the panel isn't this short.

**The period picker is a jump, not a rewind — undo is what actually goes back**: the tracker's `<select id="lt-period">` (`PERIOD_OPTIONS` in `lib/game-tracker.js`: H1, H2, OT1, OT2, OT3) lets a scorekeeper pick any period directly, including straight to OT without stepping through every period between. Picking one **appends** a `period` event the same way scoring or a foul does — it never moves the undo cursor — so nothing already recorded is erased by a period change in either direction; Undo is the only thing that removes events, including a period change made by mistake.

This is also the fix for a real bug: `session.period` used to be a plain counter the old advance-button only ever incremented, so undoing back out of a period it had moved into rolled the score back correctly but left the picker — and the period stamped on every event recorded after — stuck on wherever it had last been pushed forward to. `render()` now re-derives `session.period` from `deriveState(...).period` on every paint instead, so it always matches whatever the undo cursor is currently pointing at, exactly like the score and fouls already did. `bonusFor()` was never affected by this, since it already read `halfFouls` off the derived state rather than off `session`.

Clearing a game (see below) resets this local `session` too — period, clock and status all back to blank, keeping only a deliberately customized period length — or a freshly cleared game would still show whatever period/clock it was left on, which reads as if the clear hadn't worked even though the database is correctly reset.

**The hero is the champions' photo**: the home hero is `.hero-photo` — a season's champions, from `images/champions/` (which season's: below) — with `.hero-top` laid over its upper edge: the season badge, then `.hero-lockup`, the league logo and the title sponsor side by side ("Presented by" and the sponsor's logo, behind a thin gold rule). The hadith and the Reigning Champs plaque sit below it in `.hero-content`. Navy gradients fade the photo into the page at the top (so the logos read on the bright gym wall), the sides and the bottom, and a soft navy pool sits behind the lockup only. On desktop the band is 1180x620 with `object-fit:cover`; under 900px a band that tall would crop the outer players, so the photo is shown whole at full width and `.hero-top` moves up to straddle its top edge. The logo sizes (mark 118px, sponsor logo within 150x72, badge 124px) are the approved mock's at 390px wide; narrower than that they shrink with the screen (the `min(…, vw)` terms), or they land on the players' heads. The gold rule is `#title-sponsor-banner:not(:empty)::before`, so a season with no title sponsor shows the league logo on its own.

**Each season shows its own winners; the season being played shows the newest**: `renderAll()` sets `#hero-champions-photo` from `championPhoto(config.currentSeasonSlug)` (`lib/champion-photo.js`), next to the hero logo and with the same resolved-URL guard, so live polls never touch it. A season listed in `CHAMPION_PHOTOS` shows its own champions; any other season — which is every season while it is being played — shows `DEFAULT_PHOTO`, the newest entry. So when a season is won and its winners' photo is added, it replaces the old photo on that season's page and carries over to the next season, while every earlier season keeps its own. The choice is deliberately by listed photo, not by `config.reigningChampion`: the champion is set in the admin, but there is no photo until someone supplies it, and a season with neither keeps showing the newest photo rather than an empty band.

Adding a season's winners: crop the photo to the same 2345:1623 framing (the players' heads about a third of the way down — the logos sit over the top and the under-900px `aspect-ratio` in `css/main.css` is fixed to it), export `images/champions/<slug>-<width>.jpg` at 800/1200/1600px and full width, add the entry at the **end** of `CHAMPION_PHOTOS`, and ship it in all three copies of the hero (`index.html`, `admin/index.html`, `admin/js/page-templates.js`: `src`, `srcset`, `width`/`height`, `alt`), since the HTML ships `DEFAULT_PHOTO` so the current season never flashes. `tests/champion-photo.test.js` checks every listed file's real width and framing and pins the three copies to `DEFAULT_PHOTO`; `tests/hero.test.js` pins them to one markup. The Spring 2026 JPEGs are the supplied 2560x1710 photo cropped to the approved mock's framing; `sizes` says 1300px, not 1180px, because of the desktop `html{zoom:1.1}`. In the admin the badge's Edit overlay shrinks to the badge's width, so `admin/css/admin-overlays.css` puts the button beside it (under it on phones) instead of over its text.

**The hero logo is per season, set in code**: `renderAll()` sets `#hero-league-logo` from `seasonLogo(config.currentSeasonSlug)` in the hero's lockup, in the public page and the admin mirror alike. It lives in `lib/season-logo.js` rather than the database because each mark needs its own treatment, not just a URL — the original badge is a solid disc screened onto the navy (`mix-blend-mode:screen`), the City Edition an airy calligraphic shape with an intrinsic aspect ratio — and that is a `variant` class, not something a stored URL can carry. A new season gets the newest edition (`DEFAULT_LOGO`) until it is given its own entry, so creating one never reverts the site to the inaugural badge.

All three copies of the hero `<img>` (`index.html`, `admin/index.html`, `admin/js/page-templates.js`) **ship `DEFAULT_LOGO` in their HTML**, so visitors landing on the active season never see a logo swap as the season loads; only switching to a season with a different mark changes it. A test pins the three copies to `DEFAULT_LOGO`, so changing the default means changing all three. `renderAll()` runs on every live poll, so it compares resolved URLs and only touches the image when the season's logo actually differs.

`images/logos/fall2026-city-edition.svg` is traced from the supplied artwork (only 288x240) so it stays sharp at hero size on phones, and recoloured with a light-to-dark blue gradient because the artwork's own blue (#015284) is barely 2.4:1 against the navy hero. "BASKETBALL LEAGUE" beneath it is part of the same file: Lato Black converted to outlines and tracked so its ink spans exactly the mark's ink (x 3.4 to 223.8 in the 227-wide viewBox), in the same gradient. Outlines, not `<text>`, because an SVG loaded as an `<img>` cannot use the page's web fonts, and because it keeps the span exact at every size. The SVG's header comment has the colours and the font.

**Link previews show the logo, not the photo**: `index.html`'s `og:image` / `twitter:image` is `images/logos/fall2026-city-edition-share.png` — the City Edition mark on the hero's navy and lattice, 1200x630, rendered from the SVG in Chromium with the logo 420px tall so a square crop (WhatsApp's thumbnail) still holds all of it. Without these tags iMessage and WhatsApp show the largest image on the page, which is the champions photo. The URLs are absolute on `https://farajleague.org/` because crawlers need them absolute, so previews of the dev site point at production too. Apps cache previews per link: one already sent keeps its old picture, and a changed image should get a new file name rather than overwrite this one. A test in `tests/season-logo.test.js` pins the tags to a committed 1200x630 PNG.

**The champions trophy (awards page and home page)**: the same section appears twice — `#trophy-scroll` at the top of the awards page and `#home-trophy-scroll` as the home page's last section, just above its footer — and a test pins the two copies to identical markup apart from the id, so a change to one must be made to both. `js/app.js`'s `mountTrophyIn(section)` builds each copy once: the awards one when `showPage('awards')` first runs, the home one when `watchHomeTrophy()`'s IntersectionObserver sees it come within about a screen (900px) of the window. The two share one `js/trophy.js` import and one `getChampionCards()` read (with the hero's plaque, below), and the hover loupe, full-screen card and its Escape handler are created once by `overlays()` in `js/champion-card.js` and shared, so switching pages never stacks a second set.

The home observer is attached only after `loadAll()` settles. Before the season loads, the home page is short enough that its last section sits inside the look-ahead margin, and three.js would load on every visit rather than for those who scroll down.

The cards span **every** season — `getChampionData()` reads all seasons' awards, then only the champion teams' rosters and players — because the trophy accumulates, so the Fall 2026 page still shows Spring 2026's winners. A season's champion is decided exactly as the rest of the site decides it (first awards row by week with a `champ`, not a placeholder), and its card appears on its own the moment one is set. The admin mirror does not include the trophy.

Several things about it are not obvious:

- **The stage is pinned by JavaScript, not `position:sticky`**, and that is because `position:sticky` does nothing anywhere on this site: `body{overflow-x:hidden}` makes body a scroll container that never scrolls, so sticky descendants never stick — the nav's own `position:sticky` is inert for the same reason. `readScroll()` toggles `is-pinned` / `is-past` on every scroll event.
- **Until the stage pins, part of it is below the window**: at the top of the awards page by the nav's height, and at the bottom of the home page by however much has yet to scroll into view. `placeCamera()` shifts the shot (`setViewOffset`) to centre the ball on the visible part, capped so the ball never rises past the stage's top edge. The scroll cue rides up with the bottom of the window (`--trophy-pre`), and `--cue-room` fades it out while the ball still reaches down over it — otherwise "Scroll" is printed across the ball as the home trophy arrives.
- **The desktop `html{zoom:1.1}`** makes `getBoundingClientRect()` values 10% larger than `offsetHeight` and leaves `100vh` 10% taller than the window. Scroll progress converts to rect units, and the stage height comes from `innerHeight` when the zoom is active.
- **Each material gets the environment map itself.** With `scene.environment`, three.js (r186) overwrites every material's `envMapIntensity` with `scene.environmentIntensity`, so the matte-black base reflected the whole studio as charcoal grey.
- **Engraving ink is occluded** (R channel of the plate's packed occlusion/roughness/metalness texture): even near-black metal picks up a colour-independent Fresnel sheen, which lit the letters from inside.
- **Cards open on `click`, not `pointerup`.** On touch the browser fires its click after the finger lifts, at whatever is under it by then; opening on pointerup put the overlay there first, and the click closed it instantly.
- **The card font must be loaded before textures are drawn.** `loadCardFont()` waits for the Jost stylesheet itself before `document.fonts.load()` — one shared wait, since the hero plaque and a trophy can both ask at page load and the second caller must not find the `<link>` already there and skip ahead; without the `@font-face` rule, `fonts.load()` resolves at once and the plates get engraved in the fallback font (the HTML card, which re-renders when a font arrives, would still look right).
- **One import only.** three.js's add-ons import `'three'` themselves; to rule out a CDN ever loading two copies, the studio environment is built in (`studioScene()`) and the base uses plain boxes.
- **The ball's seams are fitted to the photo of the real trophy.** `BALL_SEAMS` in `js/trophy.js`: two great circles (`cross`, `middle`, nearly perpendicular) and two side rings (`upper`, `lower`), each "asin(n.p) = lat + k (m.p)^2" — a circle round an axis, squeezed slightly along one direction, which is what lets the lower ring run off the bottom right as the real one does rather than curling back. The photo's four seam lines were traced and the curves fitted so the site's **upright front view** draws them in the same places (appearance, matched through the site's own camera, not the photo's lower, closer viewpoint); the sides, back and top follow from the same curves. Keep them in the trophy's frame (+x right, +y up, +z out of the front).
- Jost stands in for the real plates' Futura; `CARD_TRACKING` (0.035em) makes up Futura's extra width so line lengths match the real card. Card and plaque proportions were measured off the photo of the real trophy.

Testing it locally needs three.js and Jost served in place of esm.sh and Google Fonts. Without a GPU, Chromium's software WebGL takes roughly 0.4 s a frame at 1x and 6 s at 2x, so browser tests should wait for the trophy to settle rather than sleep a fixed time.

**The hero's "Reigning Champs" plaque**: the line under the hadith (below the champions' photo) that used to read "6 Teams · 42 Players · Ages 17–30" (`#season-tag`, the `season_tag` content block) is now `#hero-champs`: "Reigning Champs:" in the old line's teal lettering, then the newest champions' card drawn small (107x34px, 88x28 below 360px wide) on the same line, opening the shared full-screen view on a click or tap. It is the newest season's champion (`reigningChampion()`), not the viewed season's, so it reads the same from every season's page. `renderHeroChamps()` paints it from `config.reigningChampion`, which `loadReigningChampion()` fills at startup — in `js/app.js` alongside the season load, and in the admin's `setupDashboard()`: undefined while loading (the row keeps its height, empty, so nothing below jumps), null when no season has a champion yet (the row goes). `renderAll()` calls it on every render and live poll, so it repaints only when the card actually changes. The row is identical in the three copies of the hero (`index.html`, `admin/index.html`, `admin/js/page-templates.js`) and a test pins that; the admin now links `css/trophy.css` for the card and the full-screen view. The old `season_tag` block and its admin edit overlays are gone.

**A game is only "won" when it is final**: `games.status` (migration 012) distinguishes scheduled / live / halftime / final. Before it, a card showed a winner the moment either team scored, so a live game read as finished as soon as one side led. `gameStatus()` treats a NULL status with scores as final, so everything recorded before 012 still shows its result. While live, the winner tag's slot carries the period and clock instead; `js/app.js` ticks those once a second from `displayClockSeconds()`, which extrapolates from `clock_updated_at`, so the tracker writes the clock only on start/pause/period/end rather than every second. The tracker marks a game live on its first recorded event, halftime at the first-half buzzer, and final via its **End game** button; `clearGame()` resets the status too, or a cleared game would keep showing a running clock.

**The probe selects `*` deliberately**: naming columns there makes the entire query fail against a database that has not run a migration yet — PostgREST answers "Could not find the 'clock_running' column of 'games' in the schema cache" — and since `probeScores()` bails on any error, live refresh dies completely and silently. Only a manual reload works, because the full read already used `select('*')`. Never name a newly added column in the probe. The tracker likewise treats a schema-cache error from its clock push as "this database predates migration 012", stops pushing, and says so once instead of flashing a save failure over the stats status, which is saving fine.

**The two fingerprints must agree**: `scoresFingerprint()` decides whether the probe re-reads, `liveFingerprint()` decides whether to repaint. `liveFingerprint` is built on top of `scoresFingerprint` for exactly this reason — when they diverged, a game going live, a period ending or the final whistle was fetched and then silently dropped, because the score itself had not moved. A test pins them to the same set of changes.

**Live scores on the public site**: the tracker pushes to `admin-game-stats` ~0.9s after the last tap (and on undo/redo), sending **only the rows that changed** since its last successful write — the function upserts sequentially, one round-trip per row, so resending the whole zero-filled roster every tap would take seconds. The public site runs a cheap probe (`getGameScores`, one small `select('*')`) every `SCORE_POLL_MS` while the tab is visible, and re-reads the whole season only when `scoresFingerprint()` moves; a slower `FULL_POLL_MS` sweep catches changes the probe cannot see (rebounds, a corrected box score). Measured end to end at about 4s from tap to a viewer's screen. It holds off while a box score or the nav drawer is open. Neither side needs a new Edge Function or migration.

`scoresFingerprint()` accepts raw `games` rows and transformed `config.DB.scores` alike and yields the same string for the same game. That matters: the probe's baseline is seeded from the data already loaded, not from the first probe — seeding on the first probe silently swallows any score that changes between page load and it.

Two traps this depends on. `toStatValues()` takes the full roster so it can emit explicit zeros — without them, undoing a player's only basket drops them from `state.players`, no row is sent, and the stale total survives on the server. And `hasRecordedStats()` gates every push, because zero-filled rows are never empty and setting lineups alone puts players in the map with court time: pushing those would write 0-0, which the site reads as played.

**Clearing a game**: emptying a stat sheet and saving leaves the score at 0-0, and since every "has this been played?" test is `score !== ''`, `'0'` still counts — the game stays complete and scores as a tie. `clearGame()` in `admin/js/game-reset.js` is the way back: it deletes the stat rows (by naming the whole roster as DNP, which is the only delete lever `admin-game-stats` exposes), empties `game_dnp` again, then nulls `games.home_score`/`away_score` via `admin-games`. All three functions are already deployed, so this needs no new backend. The tracker runs it when you save with nothing recorded; the stat sheet has a "Clear game" button.

**Minutes played** are derived from an `elapsed` stamp (cumulative seconds the clock has actually run) carried on every tracker event, not from the countdown — so setting the clock by hand never rewrites anyone's minutes. A stint is banked when the player leaves the floor; `livePlayerSeconds()` adds the open stint so a starter who is never subbed does not read as zero. Minutes are shown only inside the tracker and are deliberately absent from `STAT_SLUGS`, so they are never written to `game_stat_values`.

**Sponsors are per-season, with no code-level fallback**: `sponsors` rows are season-scoped, and a season with no row for a slot shows a neutral placeholder — the renderer no longer falls back to any particular brand name or logo file. `applySponsorOverrides()` assigns **every** slot unconditionally (resetting to the placeholder when absent) because `config` is a module singleton reused across season switches; skipping absent slots used to leave the previously loaded season's sponsor on screen. `highlightSponsor()` likewise colours only the names the current season actually has, via slot-keyed classes (`brand-sponsor-title/-a/-b`); the old brand-named classes remain in CSS only so previously saved rich text still renders. Admin: the Sponsors tab has a "Manage sponsors" panel (add / edit / **remove**), and the inline logo and description overlays now create a row when the slot is empty instead of silently doing nothing.

Removing a sponsor removes it everywhere it is referenced, which is easy to underestimate: the `conference_mecca` row is what puts a name on the **Akhlaq award label** (`akhlaqLabel()`) and the conference headings, and `conference_medina` is what brands the stats page title. Deleting a season's conference sponsors clears all of those; deleting its `title` row also removes the hero banner and the sponsors-page title logo, since there is no code fallback any more.

**Team logos are per-season**: `teams.logo_url` (migration 011) holds the logo for that season's team row, so renaming a team keeps its logo and two seasons can show different logos for the same club. `teams.logo_scale` is the zoom inside the circular crop (default 1.15) — custom logos usually need one. When `logo_url` is empty, `resolveTeamLogo()` falls back to matching the name against `images/teams/`, which is what pre-011 seasons rely on; that fuzzy match is intentionally unchanged, so setting `logo_url` is how you override a wrong match. Admin: the Teams page team cards each get a "Set logo" button.

`SEASON_TEAM_LOGOS` gives one season's team a committed logo without a database write — Fall 2026's Nasr gets `nasr-fall2026.png`, which is how it went live when this sandbox could not reach Supabase. It is keyed by season slug, so no other season's team of that name picks it up, and it applies only while the team row has no `logo_url`, so the admin's "Set logo" still replaces it (the dialog's preview shows the committed logo while the URL is blank, rather than claiming "initials"). The name must contain the key, never the reverse, so a team called "N" does not inherit Nasr's logo. A test checks every file it names is a committed square PNG. `nasr-fall2026.png` is the supplied artwork re-framed as a 512px square on its own flat tan (which fills the circle), sized so the whole emblem sits inside the circle at the default 1.15 zoom — its farthest tip at 94% of the visible radius — and centred on the emblem's visual weight rather than its bounding box. It is set with the Zoom left blank.

**Season scoping**: `rosters`, `player_stat_values`, `game_stat_values` and `game_dnp` have no `season_id` — they are reached through `team_id`/`player_id`/`game_id`. `getSeasonData` therefore runs in two passes: season-scoped tables first, then those tables filtered by the ids it just fetched. Anything querying them must do the same or it will read across seasons (and eventually hit PostgREST's 1000-row cap). `stat_definitions` is deliberately global — every season shares the same stat categories.

**`confLabel()` vs `confLabelRaw()`**: `confLabel()` returns HTML with brand-name `<span>` highlights — use only in `innerHTML` contexts. `confLabelRaw()` returns plain text — use in `textContent`/attributes. `highlightSponsor()` only wraps three specific brand names (TOYOMOTORS, XTREME, Wellness).

**`scheduled_at` timezone**: `datetime-local` inputs in the admin produce naive `YYYY-MM-DDTHH:mm` strings (no timezone). `scheduledAtInputToIso()` in `sections.js` converts them to full ISO strings using the browser's local timezone offset, so times are stored correctly in UTC.

**`content_blocks` key precedence**: `transformSeasonData` applies global (null `season_id`) blocks first, then season-specific blocks, so season-level entries override global ones for the same key.

**`getBasePath()`**: Returns `/faraj-league` on GitHub Pages project sites (hostname contains `github.io`), otherwise `''`. Used when constructing image URLs so assets resolve correctly in both environments.

**Standings PD column**: `calcStandings()` returns `{ w, l, pf, pa }` — it does NOT include point differential. The PD column in the standings table is computed at render time in `renderStandings()` as `pf - pa`.

**Stats display limits**: `renderStats()` caps the table at 15 players (sorted by total points). A separate top-3 PPG leaders widget (`#stats-leaders-wrap`) is rendered above the table, sorted by points-per-game. Both respect the team filter.

**`config.DB` scores shape** (after `transformSeasonData`): `{ week, game, gameId, t1Id, t2Id, t1, s1, t2, s2, scheduled_at }`. The `t1`/`t2` fields are team names (used for display and standings lookups); `t1Id`/`t2Id` are DB UUIDs.

### Database Tables

`seasons`, `teams`, `players`, `rosters`, `games`, `game_stat_values`, `awards`, `stat_definitions`, `player_stat_values`, `sponsors`, `media_items`, `media_slots`, `content_blocks`, `login_attempts` (rate limiting).

Season-scoped (`season_id` column): `teams`, `players`, `games`, `awards`, `sponsors`, `media_items`, `media_slots`, `content_blocks` (null `season_id` = global). Global: `stat_definitions`, `login_attempts`.

RLS allows public read on all tables; writes are enforced by Edge Function JWT validation, not RLS policies.

`config.DB` extended shape after `transformSeasonData`: `gameStatValues` (`{ [gameId]: { [playerId]: { [statDefId]: value } } }`), `statDefinitions` (game-scoped stat columns), `draftBank` (unrostered players), `draftTeamOrder` (from `content_blocks.draft_team_order` or team sort order).

`content_blocks` stores freeform JSON values by key. Schedule-specific keys: `schedule_week_labels` (week heading text), `schedule_slots_by_week` (per-week game slots), `schedule_dates_by_week` (per-week date strings). Conference keys: `conferences_layout` (JSON with `conferences[]` array), `conf_name_mecca`, `conf_name_medina`. Other keys: `hero_badge`, `about_text`, `draft_recap`, `draft_team_order`, `media_layout`, sponsor tier labels.

### Environment

```
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ADMIN_PASSWORD=
```

Copy `.env.example` to `.env` for local development. The seed script and Edge Functions use `SUPABASE_SERVICE_ROLE_KEY`; the browser uses only `SUPABASE_ANON_KEY`.

### Deploy Flow

**Two-repo model**: develop and test in this dev repo, then sync/PR into the production fork. GitHub Pages serves the fork's `main` branch at `farajleague.org`. Edge Functions deploy separately to Supabase (not via GitHub Pages). Migrations run via Supabase dashboard or `npx supabase db push` (apply in order 001–012).

`js/config.js` has Supabase URL and anon key baked in — dev and prod share the same Supabase project, so no config change is needed when syncing to the fork.
