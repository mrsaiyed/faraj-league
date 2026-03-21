# Phase 1 — Foundation (DB schema + public API)

Execute these steps in order. Agent = tasks the Cursor agent does. You = manual steps you perform.

---

## Step 1 — Agent: Project setup

**Who:** Agent

**What:** Create:
- `package.json` with Supabase client dependency
- `.env.example` with `SUPABASE_URL` and `SUPABASE_ANON_KEY`
- `.gitignore` with `.env` and `node_modules/`
- `.env` populated with the Supabase credentials (URL and anon key provided below)

**How:** In Agent mode:

> Do the Phase 1 project setup from phase1.md: add package.json with Supabase client, .env.example, .gitignore, and .env. Create .env with:
> - SUPABASE_URL=https://ruwihxsedobbxqavjrhl.supabase.co
> - SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ1d2loc3hlZG9iYnhxYXZyamhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwNTg3NjUsImV4cCI6MjA4OTYzNDc2NX0.wxQEfLBQOKPnShd8wje4Zbu3myR-JZbjcBaZekKOApg
> Ensure .env is in .gitignore so it is never committed.

---

## Step 2 — Agent: Database migrations

**Who:** Agent

**What:** Create SQL migrations for:
- `seasons` (id, slug, label, is_current, created_at)
- `teams` (id, season_id, name, conference, captain, sort_order)
- `players` (id, season_id, name, jersey_number)
- `rosters` (player_id, team_id) — or embed roster on team
- `games` (id, season_id, week, game_index, home_team_id, away_team_id, home_score, away_score)
- `awards` (id, season_id, week, akhlaq, motm1, motm2, motm3, champ, mvp, scoring)
- `stat_definitions` (id, name, slug, unit, sort_order)
- `player_stat_values` (player_id, stat_definition_id, value)
- `sponsors` (id, season_id, type, name, logo_url, label)

Add RLS policies so public read is allowed for all of these tables.

**How:** In Agent mode:

> Add Phase 1 database migrations from all_phases.md. Create SQL migrations for all tables with public read RLS.

---

## Step 3 — You: Run migrations

**Who:** You

**What:** Apply the migrations to Supabase.

- **If agent uses Supabase CLI:** Run `npx supabase db push` (or `npx supabase migration up`).
- **If agent provides raw SQL:** Supabase Dashboard → SQL Editor → paste and run each migration.

**Verify:** Tables appear in Supabase → Table Editor.

---

## Step 4 — Agent: Seed script

**Who:** Agent

**What:** Create a seed script that inserts:
- Spring 2026 season (`is_current = true`)
- 6 teams (Mecca/Medina conferences)
- Placeholder players and roster assignments
- One empty week of games
- Default stat definition (points)
- Optional sponsor placeholders

**How:** In Agent mode:

> Add the Phase 1 seed script from all_phases.md. Seed Spring 2026 with 6 teams and placeholder data.

---

## Step 5 — You: Run seed script

**Who:** You

**What:** Run the seed script, e.g.:

```bash
node scripts/seed.js
```

(or whatever path/command the agent documents)

**Verify:** Supabase → Table Editor shows rows in `seasons`, `teams`, `players`, etc.

---

## Step 6 — Agent: Public API + README

**Who:** Agent

**What:**
- Document how to query seasons and season data from Supabase (or add a small API/helper module)
- Update README with setup steps: clone, `npm install`, copy `.env.example` → `.env`, run migrations, run seed
- Document the import script step for later (one-time Sheets import)

**How:** In Agent mode:

> Add Phase 1 public API documentation from all_phases.md. Document how to query seasons and season data from Supabase. Update README with setup steps.

---

## Step 7 — You: Enable CORS in Supabase

**Who:** You

**What:** Allow your frontend to call Supabase:

- Supabase Dashboard → **Project Settings** (gear icon) → **API**
- Find CORS / allowed origins (or equivalent)
- Add: `https://farajleague.org`, `https://<your-username>.github.io`, `http://localhost:*`

(Supabase may handle CORS differently—check their docs if the setting isn’t obvious.)

---

## Step 8 — You: Verify Phase 1

**Who:** You

**What:** Confirm:
1. All tables exist and have data
2. You can run a simple `fetch` (browser console or a script) and get JSON back
3. No CORS errors when calling from your domain or localhost

---

## Summary

| Order | Who  | Step                                                              |
|-------|------|--------------------------------------------------------------------|
| 1     | Agent | Project setup (package.json, .env.example, .gitignore, .env)       |
| 2     | Agent | Database migrations (SQL + RLS)                                    |
| 3     | You   | Run migrations in Supabase                                         |
| 4     | Agent | Seed script                                                        |
| 5     | You   | Run seed script                                                    |
| 6     | Agent | Public API documentation + README                                  |
| 7     | You   | Enable CORS in Supabase                                            |
| 8     | You   | Verify data and API access                                         |
