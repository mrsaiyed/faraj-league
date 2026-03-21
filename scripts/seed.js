/**
 * Phase 1 seed script: Spring 2026 season with 6 teams, placeholder players, and initial data.
 * Run: npm run seed  (or node scripts/seed.js)
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env (from Supabase Dashboard → Settings → API → service_role).
 * The anon key cannot insert; RLS only allows public read.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.\n' +
      'Get the service_role key from Supabase Dashboard → Settings → API → service_role (secret).'
  );
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

const TEAMS = [
  { name: 'Team Alpha', conference: 'Mecca', captain: 'Captain 1' },
  { name: 'Team Beta', conference: 'Mecca', captain: 'Captain 2' },
  { name: 'Team Gamma', conference: 'Mecca', captain: 'Captain 3' },
  { name: 'Team Delta', conference: 'Medina', captain: 'Captain 4' },
  { name: 'Team Epsilon', conference: 'Medina', captain: 'Captain 5' },
  { name: 'Team Zeta', conference: 'Medina', captain: 'Captain 6' },
];

async function seed() {
  // 1. Delete existing spring2026 data (cascade will clean children)
  const { data: existing } = await supabase.from('seasons').select('id').eq('slug', 'spring2026').single();
  if (existing) {
    const { error } = await supabase.from('seasons').delete().eq('slug', 'spring2026');
    if (error) {
      console.error('Failed to clear existing spring2026:', error);
      process.exit(1);
    }
    console.log('Cleared existing spring2026 data.');
  }

  // 2. Insert season
  const { data: season, error: seasonErr } = await supabase
    .from('seasons')
    .insert({ slug: 'spring2026', label: 'Spring 2026', is_current: true })
    .select('id')
    .single();
  if (seasonErr) {
    console.error('Failed to insert season:', seasonErr);
    process.exit(1);
  }
  const seasonId = season.id;
  console.log('Inserted season spring2026');

  // 3. Insert teams
  const { data: teams, error: teamsErr } = await supabase
    .from('teams')
    .insert(
      TEAMS.map((t, i) => ({
        season_id: seasonId,
        name: t.name,
        conference: t.conference,
        captain: t.captain,
        sort_order: i + 1,
      }))
    )
    .select('id');
  if (teamsErr) {
    console.error('Failed to insert teams:', teamsErr);
    process.exit(1);
  }
  console.log('Inserted 6 teams');

  // 4. Insert players (7 per team, 42 total)
  const playerRows = [];
  for (let t = 0; t < 6; t++) {
    for (let p = 1; p <= 7; p++) {
      playerRows.push({
        season_id: seasonId,
        name: `Player ${(t * 7) + p}`,
        jersey_number: p,
      });
    }
  }
  const { data: players, error: playersErr } = await supabase
    .from('players')
    .insert(playerRows)
    .select('id');
  if (playersErr) {
    console.error('Failed to insert players:', playersErr);
    process.exit(1);
  }
  console.log('Inserted 42 players');

  // 5. Insert roster assignments (player i is on team floor(i/7))
  const rosterRows = [];
  for (let i = 0; i < 42; i++) {
    rosterRows.push({
      player_id: players[i].id,
      team_id: teams[Math.floor(i / 7)].id,
    });
  }
  const { error: rostersErr } = await supabase.from('rosters').insert(rosterRows);
  if (rostersErr) {
    console.error('Failed to insert rosters:', rostersErr);
    process.exit(1);
  }
  console.log('Inserted roster assignments');

  // 6. Insert stat definition (points) — idempotent, shared across seasons
  const { data: existingPoints } = await supabase.from('stat_definitions').select('id').eq('slug', 'points').single();
  let pointsId;
  if (existingPoints) {
    pointsId = existingPoints.id;
    console.log('Stat definition "points" already exists');
  } else {
    const { data: statDef, error: statErr } = await supabase
      .from('stat_definitions')
      .insert({ name: 'Points', slug: 'points', unit: 'pts', sort_order: 0 })
      .select('id')
      .single();
    if (statErr) {
      console.error('Failed to insert stat_definitions:', statErr);
      process.exit(1);
    }
    pointsId = statDef.id;
    console.log('Inserted stat definition: points');
  }

  // 7. Insert empty week 1 games (Alpha vs Delta, Beta vs Epsilon, Gamma vs Zeta)
  const { error: gamesErr } = await supabase.from('games').insert([
    {
      season_id: seasonId,
      week: 1,
      game_index: 1,
      home_team_id: teams[0].id,
      away_team_id: teams[3].id,
      home_score: null,
      away_score: null,
    },
    {
      season_id: seasonId,
      week: 1,
      game_index: 2,
      home_team_id: teams[1].id,
      away_team_id: teams[4].id,
      home_score: null,
      away_score: null,
    },
    {
      season_id: seasonId,
      week: 1,
      game_index: 3,
      home_team_id: teams[2].id,
      away_team_id: teams[5].id,
      home_score: null,
      away_score: null,
    },
  ]);
  if (gamesErr) {
    console.error('Failed to insert games:', gamesErr);
    process.exit(1);
  }
  console.log('Inserted week 1 games (empty scores)');

  // 8. Insert awards row for week 1 (empty)
  const { error: awardsErr } = await supabase.from('awards').insert({
    season_id: seasonId,
    week: 1,
    akhlaq: null,
    motm1: null,
    motm2: null,
    motm3: null,
    champ: null,
    mvp: null,
    scoring: null,
  });
  if (awardsErr) {
    console.error('Failed to insert awards:', awardsErr);
    process.exit(1);
  }
  console.log('Inserted awards row for week 1');

  // 9. Optional: placeholder sponsors
  const { error: sponsorsErr } = await supabase.from('sponsors').insert([
    { season_id: seasonId, type: 'title', name: null, logo_url: null, label: 'Title Sponsor' },
    { season_id: seasonId, type: 'conference_mecca', name: null, logo_url: null, label: 'Mecca Conference' },
    { season_id: seasonId, type: 'conference_medina', name: null, logo_url: null, label: 'Medina Conference' },
  ]);
  if (sponsorsErr) {
    console.error('Failed to insert sponsors:', sponsorsErr);
    process.exit(1);
  }
  console.log('Inserted sponsor placeholders');

  console.log('\nSeed complete. Verify in Supabase Table Editor.');
}

seed();
