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
   - `SUPABASE_SERVICE_ROLE_KEY` — for seed script only (Dashboard → Settings → API → service_role)

4. **Run migrations**
   - Open Supabase Dashboard → SQL Editor
   - Paste and run the SQL from `supabase/migrations/001_initial_schema.sql`
   - Or use Supabase CLI: `npx supabase db push`

5. **Seed the database**
   ```bash
   npm run seed
   ```
   Verify in Supabase → Table Editor: `seasons`, `teams`, `players`, etc.

6. **Enable CORS** (for browser access)
   - Supabase Dashboard → Project Settings → API
   - Add allowed origins: `https://farajleague.org`, `http://localhost:*`, `https://<your-username>.github.io`

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

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run seed` | Seed database with placeholder season data |
