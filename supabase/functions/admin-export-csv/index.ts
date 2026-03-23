/**
 * Admin export: ZIP of CSVs for current season (full backup).
 * Requires JWT. Uses service_role to fetch all data.
 */

import { verifyAdminToken, corsHeaders, jsonResponse, createServiceClient } from '../_shared/auth.ts';
import JSZip from 'npm:jszip@3.10.1';

function escapeCsv(val: unknown): string {
  if (val == null) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  if (rows.length === 0) return '';
  const cols = columns ?? Object.keys(rows[0] || {});
  const header = cols.map(escapeCsv).join(',');
  const lines = rows.map((r) => cols.map((c) => escapeCsv(r[c])).join(','));
  return [header, ...lines].join('\n');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });

  const auth = await verifyAdminToken(req);
  if (!auth.valid) return jsonResponse({ error: auth.error }, auth.status);

  try {
    const body = await req.json().catch(() => ({}));
    const season_slug = body?.season_slug;
    if (!season_slug || typeof season_slug !== 'string') {
      return jsonResponse({ error: 'season_slug required' }, 400);
    }

    const supabase = await createServiceClient();

    const { data: season, error: seasonErr } = await supabase.from('seasons').select('*').eq('slug', season_slug).single();
    if (seasonErr || !season) {
      return jsonResponse({ error: 'Season not found' }, 400);
    }

    const seasonId = season.id;

    const [
      teamsRes,
      playersRes,
      rostersRes,
      gamesRes,
      awardsRes,
      statDefsRes,
      sponsorsRes,
      mediaRes,
      mediaSlotsRes,
      contentRes,
    ] = await Promise.all([
      supabase.from('teams').select('*').eq('season_id', seasonId).order('sort_order'),
      supabase.from('players').select('*').eq('season_id', seasonId),
      supabase.from('rosters').select('*').order('sort_order', { ascending: true }),
      supabase.from('games').select('*').eq('season_id', seasonId).order('week').order('game_index'),
      supabase.from('awards').select('*').eq('season_id', seasonId).order('week'),
      supabase.from('stat_definitions').select('*').order('sort_order'),
      supabase.from('sponsors').select('*').eq('season_id', seasonId),
      supabase.from('media_items').select('*').eq('season_id', seasonId).order('week').order('sort_order'),
      supabase.from('media_slots').select('*').eq('season_id', seasonId),
      supabase.from('content_blocks').select('*').or(`season_id.eq.${seasonId},season_id.is.null`),
    ]);

    const teams = teamsRes.data || [];
    const players = playersRes.data || [];
    const rosters = rostersRes.data || [];
    const games = gamesRes.data || [];
    const playerIds = players.map((p: { id: string }) => p.id);
    const gameIds = games.map((g: { id: string }) => g.id);

    let playerStats: unknown[] = [];
    let gameStats: unknown[] = [];
    if (playerIds.length > 0) {
      const r = await supabase.from('player_stat_values').select('*').in('player_id', playerIds);
      playerStats = r.data || [];
    }
    if (gameIds.length > 0) {
      const r = await supabase.from('game_stat_values').select('*').in('game_id', gameIds);
      gameStats = r.data || [];
    }

    const teamMap: Record<string, { name: string }> = {};
    teams.forEach((t: { id: string; name: string }) => { teamMap[t.id] = { name: t.name }; });
    const playerMap: Record<string, { name: string }> = {};
    players.forEach((p: { id: string; name: string }) => { playerMap[p.id] = { name: p.name }; });

    const rosterRows = rosters.map((r: { player_id: string; team_id: string; sort_order?: number }) => ({
      player_id: r.player_id,
      team_id: r.team_id,
      sort_order: r.sort_order ?? 0,
      player_name: playerMap[r.player_id]?.name ?? '',
      team_name: teamMap[r.team_id]?.name ?? '',
    }));

    const gameRows = games.map((g: { home_team_id: string; away_team_id: string; [k: string]: unknown }) => ({
      ...g,
      home_team: teamMap[g.home_team_id]?.name ?? '',
      away_team: teamMap[g.away_team_id]?.name ?? '',
    }));

    const zip = new JSZip();
    zip.file('seasons.csv', toCsv([season]));
    zip.file('teams.csv', toCsv(teams));
    zip.file('players.csv', toCsv(players));
    zip.file('rosters.csv', toCsv(rosterRows));
    zip.file('games.csv', toCsv(gameRows));
    zip.file('awards.csv', toCsv(awardsRes.data || []));
    zip.file('game_stat_values.csv', toCsv(gameStats));
    zip.file('player_stat_values.csv', toCsv(playerStats));
    zip.file('stat_definitions.csv', toCsv(statDefsRes.data || []));
    zip.file('media_items.csv', toCsv(mediaRes.data || []));
    zip.file('media_slots.csv', toCsv(mediaSlotsRes.data || []));
    zip.file('content_blocks.csv', toCsv(contentRes.data || []));
    zip.file('sponsors.csv', toCsv(sponsorsRes.data || []));

    const date = new Date().toISOString().slice(0, 10);
    const filename = `faraj-league-export-${season_slug}-${date}.zip`;
    const bytes = await zip.generateAsync({ type: 'uint8array' });

    return new Response(bytes, {
      headers: {
        ...corsHeaders(),
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
      status: 200,
    });
  } catch (err) {
    console.error(err);
    return jsonResponse({ error: err?.message || 'Server error' }, 500);
  }
});
