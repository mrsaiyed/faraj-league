# Phase 3 — Admin v1 (login + CRUD)

Execute these steps in order. **Agent** = tasks the Cursor agent does. **You** = manual steps you perform.

**Prerequisite:** Phase 1, Phase 2, and Phase 2.5 complete. Public site uses Supabase API; code is refactored into `js/` modules (`config.js`, `data.js`, `render.js`, `app.js`). Supabase has seasons, teams, players, rosters, games, awards, stats, sponsors.

---

## Principles

- **Scalability** — Schema and structure support growth (new seasons, teams, stats, media, content blocks). Same pattern as Phase 1/2.
- **Admin editability** — All data users see on the public site is editable via the admin page. No hardcoded or non-editable content.
- **Admin ease of use** — Clear navigation, validation feedback, obvious save/update flows. Prefer simple, direct workflows over complex multi-step wizards.
- **Static deployment** — Public site remains static (no build step). Admin app is also static HTML + JS; writes go through Supabase Edge Functions.
- **Transform at boundary** — Map Supabase response → DB shape in one place; existing render logic stays unchanged.
- **Single config source** — Admin reuses `SUPABASE_URL` and `SUPABASE_ANON_KEY` from the same config for reads; easy to switch dev vs prod.
- **No secrets in client** — Only `SUPABASE_ANON_KEY` in the frontend. Never use `SUPABASE_SERVICE_ROLE_KEY` in client code. Password and JWT validation live in Edge Functions.
- **No public login** — Admin at `/admin` only. No admin link or password visible on the public homepage.

---

## Alignment with all_phases & business goal

- **all_phases.md Phase 3:** Admin app, shared-password login (Edge Function), protected API (JWT + Bearer), schema migrations (games.scheduled_at, seasons.current_week, media_items, content_blocks), CRUD for seasons, teams, players, games, awards, stats, sponsors, media, about, draft — all covered.
- **Business goal:** farajleague.org remains a static site. Admin enables editable content without a traditional backend. Deploy flow (dev repo → fork → farajleague.org) unchanged for static assets; Edge Functions deploy separately to Supabase.
- **Admin password:** Use `ADMIN_PASSWORD` env/secret (e.g. `Faraj2026`). Never commit the password. Set in Supabase Edge Function secrets and `.env` for local dev.

---

## Step 1 — Agent: Schema migration

**Who:** Agent

**What:**

1. **Add columns:**
   - `games.scheduled_at TIMESTAMPTZ` (nullable) — game time
   - `seasons.current_week INT` (nullable) — which week is "current" for the season

2. **Create `media_items` table:**
   - `id` (uuid, PK), `season_id` (FK seasons), `week` (int), `title` (text), `url` (text), `type` (text, e.g. 'highlight' | 'interview'), `sort_order` (int)
   - RLS: public read

3. **Create `content_blocks` table:**
   - `id` (uuid, PK), `key` (text), `value` (text), `season_id` (uuid, nullable)
   - Keys: `about_intro`, `about_secondary`, `draft_recap`, `draft_placeholder`
   - RLS: public read

4. Add RLS policies for public read on `media_items` and `content_blocks`.

**How:** In Agent mode:

> Implement Phase 3 Step 1 from phase3.md: Add games.scheduled_at, seasons.current_week. Create media_items and content_blocks tables with RLS public read.

---

## Step 2 — Agent: Auth Edge Function

**Who:** Agent

**What:**

1. **Create Supabase Edge Function `auth-login`:**
   - Accepts `POST` body `{ "password": "..." }`
   - Compares to `ADMIN_PASSWORD` from `Deno.env.get('ADMIN_PASSWORD')`
   - On match: return `{ "token": "<short-lived JWT>" }` (e.g. 24h expiry)
   - On fail: return 401 `{ "error": "Invalid password" }`
   - Use `jose` or built-in crypto for JWT signing; sign with `ADMIN_PASSWORD` or a dedicated `JWT_SECRET`

2. **JWT payload:** `{ sub: "admin", exp, iat }` — minimal claims.

3. **Document:** User must set `ADMIN_PASSWORD` in Supabase → Project Settings → Edge Functions → Secrets.

4. **Update `.env.example`:** Add `ADMIN_PASSWORD=` (empty, as placeholder). Never put the real password in the repo.

**How:** In Agent mode:

> Implement Phase 3 Step 2 from phase3.md: Create auth-login Edge Function. Accept password, compare to ADMIN_PASSWORD, return JWT on success. Add ADMIN_PASSWORD to .env.example. Document secrets.

---

## Step 3 — Agent: Admin app shell

**Who:** Agent

**What:**

1. **Create `admin/index.html`:**
   - Minimal SPA: login form when unauthenticated; dashboard when authenticated
   - Login form: password field, submit → `POST` to Edge Function `auth-login`
   - On success: store token in `localStorage`, redirect to dashboard

2. **Admin layout:**
   - Sidebar or top nav: Season switcher | Seasons | Teams | Players | Games | Awards | Stats | Sponsors | Media | About | Draft
   - Each section loads when selected; single-page navigation
   - Simple, direct workflows: list → edit inline or modal → save

3. **Config reuse:** Admin uses same `SUPABASE_URL` and `SUPABASE_ANON_KEY` (from shared config or copy) for read-only Supabase calls. No service role key in client.

4. **Token check:** On admin load, if no token or expired, show login. All admin write calls include `Authorization: Bearer <token>` and go through Edge Functions that verify the JWT and use service_role for writes.

5. **Write flow:** Admin UI calls Edge Functions (e.g. `admin-teams`, `admin-games`) with Bearer token. Functions verify JWT, then use Supabase service_role client to perform writes.

**How:** In Agent mode:

> Implement Phase 3 Step 3 from phase3.md: Create admin/index.html with login form and dashboard shell. Reuse SUPABASE_URL/SUPABASE_ANON_KEY for reads. Plan for Edge Functions for writes.

---

## Step 4 — Agent: Admin write API (Edge Functions)

**Who:** Agent

**What:**

1. **Create Edge Functions for admin writes:**
   - Each function: verify `Authorization: Bearer <token>`, validate JWT, then use service_role Supabase client to upsert/delete
   - Functions: `admin-seasons`, `admin-teams`, `admin-players`, `admin-games`, `admin-awards`, `admin-stats`, `admin-sponsors`, `admin-media`, `admin-content`
   - Admin UI calls these with `fetch` + Bearer token

2. **Start with core functions:** `admin-teams`, `admin-games`, `admin-content`; expand to cover all entities.

3. **Error handling:** Return clear errors (401 invalid token, 400 validation, 500 server) for admin UI feedback.

**How:** In Agent mode:

> Implement Phase 3 Step 4 from phase3.md: Add Edge Functions for admin writes. Verify JWT, use service_role for Supabase writes. Cover teams, games, content blocks initially; expand as needed.

---

## Step 5 — Agent: CRUD UI — Seasons

**Who:** Agent

**What:**

1. **Season switcher:** Dropdown to select which season to edit (list from `seasons`).
2. **Seasons section:** Edit `is_current` (toggle; ensure only one current), `current_week` (number input). Save button with success/error feedback.
3. **Simple flow:** One form, one save. No wizard.

**How:** In Agent mode:

> Implement Phase 3 Step 5 from phase3.md: Add Seasons CRUD in admin. Season switcher, is_current toggle, current_week input.

---

## Step 6 — Agent: CRUD UI — Teams

**Who:** Agent

**What:**

1. **Teams section:** List teams for selected season.
2. **Add team:** Form (name, conference, captain); submit creates row.
3. **Edit team:** Inline or modal; update name, conference, captain.
4. **Delete team:** With confirmation.
5. **Simple flow:** List → add/edit form → save.

**How:** In Agent mode:

> Implement Phase 3 Step 6 from phase3.md: Add Teams CRUD in admin. List, add, edit, delete.

---

## Step 7 — Agent: CRUD UI — Players & rosters

**Who:** Agent

**What:**

1. **Players section:** List players for selected season.
2. **Add player:** Form (name, jersey_number); optionally assign to team.
3. **Edit player:** Update name, jersey_number; assign/unassign from team (rosters table).
4. **Delete player:** With confirmation; remove roster entries.
5. **Roster:** When editing team, show roster; add/remove players via rosters. Simple forms, not multi-step wizards.

**How:** In Agent mode:

> Implement Phase 3 Step 7 from phase3.md: Add Players and roster CRUD in admin.

---

## Step 8 — Agent: CRUD UI — Games / Schedule

**Who:** Agent

**What:**

1. **Games section:** List games by week for selected season.
2. **Add game:** Form (week, game_index, home_team_id, away_team_id, home_score, away_score, scheduled_at).
3. **Edit game:** Update scores, scheduled_at (game time), matchup.
4. **Delete game:** With confirmation.
5. **Full schedule management:** Simple add/edit/delete; optional bulk add for a full week.

**How:** In Agent mode:

> Implement Phase 3 Step 8 from phase3.md: Add Games CRUD. Full schedule management, scores, scheduled_at.

---

## Step 9 — Agent: CRUD UI — Awards

**Who:** Agent

**What:**

1. **Awards section:** List by week; edit weekly (akhlaq, motm1, motm2, motm3) and season (champ, mvp, scoring).
2. **Week selector:** Choose week to edit.
3. **Form fields:** All award fields; save updates awards row(s). Direct edit, single save.

**How:** In Agent mode:

> Implement Phase 3 Step 9 from phase3.md: Add Awards CRUD. Weekly and season awards.

---

## Step 10 — Agent: CRUD UI — Stats

**Who:** Agent

**What:**

1. **Stat definitions:** List; add new stat type (name, slug, unit, sort_order).
2. **Player stat values:** List by season; edit values per player per stat.
3. **Simple flow:** List → edit value → save. Optional spreadsheet-style edit for common stats.

**How:** In Agent mode:

> Implement Phase 3 Step 10 from phase3.md: Add Stats CRUD. Stat definitions and player stat values.

---

## Step 11 — Agent: CRUD UI — Sponsors, Media, About, Draft

**Who:** Agent

**What:**

1. **Sponsors:** Edit per season (type, name, logo_url, label).
2. **Media:** List by week; add, edit, delete media items (title, url, type) for Highlights & Interviews.
3. **About:** Edit `about_intro` and `about_secondary` in content_blocks.
4. **Draft:** Edit `draft_recap` and `draft_placeholder` in content_blocks.
5. **Simple flows:** One form per block or entity; obvious save.

**How:** In Agent mode:

> Implement Phase 3 Step 11 from phase3.md: Add Sponsors, Media, About, Draft CRUD in admin.

---

## Step 12 — Agent: Extend public site data layer

**Who:** Agent

**What:**

1. **Extend `fetchSeasonData` (in `js/data.js`):**
   - Include `media_items` and `content_blocks` in the fetch
   - Add to transformed data shape for render functions
   - Include `scheduled_at` in games/scores shape for Schedule tab (Phase 3.5 readiness)

2. **Update render functions (in `js/render.js`):** Use `media_items` for Media page; use `content_blocks` for About and Draft copy. Transform at boundary — map once in data layer.

3. **Preserve behavior:** If media_items or content_blocks are empty, fall back to placeholder/empty state as before.

**How:** In Agent mode:

> Implement Phase 3 Step 12 from phase3.md: Extend fetchSeasonData in js/data.js to include media_items and content_blocks. Update js/render.js for Media, About, Draft. Include scheduled_at in games shape.

---

## Step 13 — You: Set ADMIN_PASSWORD

**Who:** You

**What:**

1. **Supabase Edge Functions secrets:**
   - Dashboard → Project Settings → Edge Functions → Secrets
   - Add `ADMIN_PASSWORD` = `Faraj2026` (or your chosen password)

2. **Local `.env` (for Edge Function local dev):**
   - Add `ADMIN_PASSWORD=Faraj2026` to `.env`
   - Ensure `.env` is in `.gitignore`

3. **GitHub Actions (if used):**
   - Repo → Settings → Secrets and variables → Actions
   - Add `ADMIN_PASSWORD` (e.g. `Faraj2026`)

**Verify:** Never commit the password. `.env.example` lists `ADMIN_PASSWORD=` (empty) as a placeholder only.

---

## Step 14 — You: Deploy Edge Functions

**Who:** You

**What:**

1. Deploy auth and admin Edge Functions:
   ```bash
   npx supabase functions deploy auth-login
   npx supabase functions deploy admin-teams
   # ... etc
   ```
2. Ensure `ADMIN_PASSWORD` is set in Supabase secrets before deploy.

**Verify:** `curl -X POST https://<project>.supabase.co/functions/v1/auth-login -H "Content-Type: application/json" -d '{"password":"Faraj2026"}'` returns a token.

---

## Step 15 — You: Test admin

**Who:** You

**What:**

1. Open `/admin` (or `admin/index.html`) in incognito.
2. Log in with `Faraj2026`.
3. Confirm: season switcher works; edit a team; edit a game score; edit about content.
4. Confirm: no admin UI or password visible on public homepage.

---

## Step 16 — You: Verify Phase 3 complete

**Who:** You

**What:** Confirm:

1. Admin login works; JWT is stored and sent with requests.
2. All CRUD sections work (seasons, teams, players, games, awards, stats, sponsors, media, about, draft).
3. Public site reflects changes (e.g. edit about text in admin → see it on About page).
4. No admin link on public site.
5. Schema has `media_items`, `content_blocks`, `games.scheduled_at`, `seasons.current_week`.

---

## Summary

| Order | Who   | Step                                                                 |
|-------|-------|----------------------------------------------------------------------|
| 1     | Agent | Schema migration (scheduled_at, current_week, media_items, content_blocks) |
| 2     | Agent | Auth Edge Function (auth-login)                                      |
| 3     | Agent | Admin app shell (login, dashboard nav)                               |
| 4     | Agent | Admin write API (Edge Functions)                                     |
| 5     | Agent | CRUD UI — Seasons                                                    |
| 6     | Agent | CRUD UI — Teams                                                      |
| 7     | Agent | CRUD UI — Players & rosters                                          |
| 8     | Agent | CRUD UI — Games                                                      |
| 9     | Agent | CRUD UI — Awards                                                     |
| 10    | Agent | CRUD UI — Stats                                                      |
| 11    | Agent | CRUD UI — Sponsors, Media, About, Draft                              |
| 12    | Agent | Extend public site (media_items, content_blocks in fetchSeasonData)   |
| 13    | You   | Set ADMIN_PASSWORD (Supabase secrets, .env, GitHub)                   |
| 14    | You   | Deploy Edge Functions                                                |
| 15    | You   | Test admin login and CRUD                                            |
| 16    | You   | Verify Phase 3 complete                                              |

---

## Data reference (for Agent)

**New/updated schema:**

| Table/Column         | Shape                                        |
|----------------------|----------------------------------------------|
| games.scheduled_at   | `TIMESTAMPTZ` nullable                       |
| seasons.current_week | `INT` nullable                               |
| media_items          | id, season_id, week, title, url, type, sort_order |
| content_blocks       | id, key, value, season_id (nullable)         |

**Content block keys:** `about_intro`, `about_secondary`, `draft_recap`, `draft_placeholder`
