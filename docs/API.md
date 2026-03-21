# Faraj League Public API

The backend uses **Supabase** with public read-only access. All queries use the Supabase REST API with the anon key. No custom server is required.

## Base URL

```
https://<your-project-ref>.supabase.co/rest/v1
```

Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `.env` for local development.

---

## API Endpoints (conceptual)

| Endpoint | Description |
|----------|-------------|
| `GET /seasons` | List all seasons |
| `GET /seasons/current` | Get the current season (`is_current = true`) |
| `GET /seasons/:slug/data` | Full season data: teams, players, rosters, games, awards, stats, sponsors |

---

## Supabase Queries

### List seasons (`GET /seasons`)

```javascript
const { data, error } = await supabase
  .from('seasons')
  .select('*')
  .order('created_at', { ascending: false });
```

### Current season (`GET /seasons/current`)

```javascript
const { data, error } = await supabase
  .from('seasons')
  .select('*')
  .eq('is_current', true)
  .single();
```

### Season data by slug (`GET /seasons/:slug/data`)

1. Get the season by slug:

```javascript
const { data: season } = await supabase
  .from('seasons')
  .select('*')
  .eq('slug', 'spring2026')
  .single();
```

2. Fetch related data in parallel (using `season.id`):

```javascript
const seasonId = season.id;

const [teams, players, rosters, games, awards, statDefs, sponsors] = await Promise.all([
  supabase.from('teams').select('*').eq('season_id', seasonId).order('sort_order'),
  supabase.from('players').select('*').eq('season_id', seasonId),
  supabase.from('rosters').select('*'),
  supabase.from('games').select('*').eq('season_id', seasonId).order('week').order('game_index'),
  supabase.from('awards').select('*').eq('season_id', seasonId).order('week'),
  supabase.from('stat_definitions').select('*').order('sort_order'),
  supabase.from('sponsors').select('*').eq('season_id', seasonId),
]);
```

3. For `player_stat_values`, filter by player IDs from this season:

```javascript
const playerIds = players.data.map(p => p.id);
const { data: playerStatValues } = playerIds.length > 0
  ? await supabase.from('player_stat_values').select('*').in('player_id', playerIds)
  : { data: [] };
```

---

## Helper Module

Use the built-in helpers for a simpler API:

```javascript
import { createClient } from '@supabase/supabase-js';
import { getSeasons, getCurrentSeason, getSeasonData } from './lib/api.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// List all seasons
const { data: seasons } = await getSeasons(supabase);

// Current season
const { data: current } = await getCurrentSeason(supabase);

// Full season data
const { data, error } = await getSeasonData(supabase, 'spring2026');
// data: { season, teams, players, rosters, games, awards, stat_definitions, player_stat_values, sponsors }
```

---

## CORS

Before calling from a browser (e.g. `farajleague.org` or `localhost`), add allowed origins in Supabase:

- **Dashboard** → Project Settings → API → CORS
- Add: `https://farajleague.org`, `https://<your-username>.github.io`, `http://localhost:*`

---

## Tables

| Table | Description |
|-------|-------------|
| `seasons` | Season metadata (slug, label, is_current) |
| `teams` | Teams per season (name, conference, captain) |
| `players` | Players per season (name, jersey_number) |
| `rosters` | Player ↔ team assignments |
| `games` | Weekly games (home/away teams, scores) |
| `awards` | Weekly and season awards |
| `stat_definitions` | Stat types (points, etc.) |
| `player_stat_values` | Per-player stat values |
| `sponsors` | Per-season sponsor placeholders |

All tables have RLS policies allowing public `SELECT`.
