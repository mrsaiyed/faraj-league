# Faraj League

Public site for the Faraj League (`farajleague.org`). A static web app backed by Supabase for seasons, teams, games, awards, and stats.

---

## Setup

1. **Clone the repo**
   ```bash
   git clone <repo-url>
   cd faraj-league
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and add:
   - `SUPABASE_URL` — from Supabase Dashboard → Settings → API
   - `SUPABASE_ANON_KEY` — anon/public key
   - `SUPABASE_SERVICE_ROLE_KEY` — for seed script and Edge Functions; **required for auth-login** (rate limiting uses `login_attempts` table)
   - `ADMIN_PASSWORD` — for admin login (set in Supabase Edge Function secrets; not in `.env` for production)

4. **Run migrations**
   - Open Supabase Dashboard → SQL Editor
   - Run migrations in order: 001, 002, 003, 004, 005, 006
   - Phase 5 adds `006_phase5_login_attempts.sql` for rate limiting
   - Or use Supabase CLI: `npx supabase db push`

5. **Seed the database**
   ```bash
   npm run seed
   ```
   Verify in Supabase → Table Editor: `seasons`, `teams`, `players`, etc.

6. **Enable CORS** (for browser access)
   - Supabase Dashboard → Project Settings → API
   - Add allowed origins: `https://farajleague.org`, `http://localhost:*`, `https://<your-username>.github.io`

7. **Admin:** Set secrets and deploy Edge Functions
   - Dashboard → Project Settings → Edge Functions → Secrets: add `ADMIN_PASSWORD` (e.g. `Faraj2026`) and `SUPABASE_SERVICE_ROLE_KEY`
   - Run migration 006 before deploying auth-login
   - Deploy all functions:
     ```bash
     npx supabase functions deploy auth-login admin-export-csv admin-seasons admin-teams admin-players admin-games admin-awards admin-stats admin-sponsors admin-media admin-content admin-media-slots admin-game-stats
     ```

---

## Fork sync workflow

1. Develop and test in your dev repo.
2. When ready: sync or pull from dev to fork (or create a PR).
3. Merge so the fork's main branch has your changes.
4. farajleague.org (served from the fork) reflects the merge after GitHub Pages rebuilds.
5. Edge Functions deploy separately to Supabase (not via the fork).

---

## Running tests

```bash
npm test
```

Runs unit tests for standings calculation and stat aggregation. Tests are development-only; they do not affect static deployment.

---

## Data import (one-time)

When migrating from Google Sheets, a one-time import script will populate the database from your existing CSV/Sheets data. That script will be added in a later phase. Run it once after setup when your Sheets data is ready.

---

## Project structure

- `index.html` — Static site (Home, Standings, Teams, Stats, Awards, etc.)
- `lib/api.js` — Helpers for querying seasons and season data from Supabase
- `scripts/seed.js` — Seed script for Spring 2026 placeholder data
- `supabase/migrations/` — SQL migrations
- `docs/API.md` — Public API documentation
- `docs/PROJECT.md` — Overview, phases, and current priorities
- `docs/schedule_tab_fix.md` — Schedule tab & Edit Full Schedule initiative (complete)

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run seed` | Seed database with placeholder season data |
| `npm test` | Run unit tests (standings, stats) |
