import { verifyAdminToken, corsHeaders, jsonResponse, createServiceClient } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });

  const auth = await verifyAdminToken(req);
  if (!auth.valid) return jsonResponse({ error: auth.error }, auth.status);

  try {
    const body = await req.json();
    const { game_id, values = [] } = body;

    if (!game_id) return jsonResponse({ error: 'game_id required' }, 400);

    const supabase = await createServiceClient();

    // Fetch game
    const { data: game, error: gameErr } = await supabase
      .from('games')
      .select('id, season_id, home_team_id, away_team_id')
      .eq('id', game_id)
      .single();

    if (gameErr || !game) return jsonResponse({ error: 'Game not found or invalid' }, 400);

    // Fetch rosters for both teams
    const { data: rosters } = await supabase
      .from('rosters')
      .select('player_id, team_id')
      .or(`team_id.eq.${game.home_team_id},team_id.eq.${game.away_team_id}`);

    const rosterPlayerIds = new Set((rosters || []).map((r: { player_id: string }) => r.player_id));
    const homeRosterIds = new Set((rosters || []).filter((r: { team_id: string }) => r.team_id === game.home_team_id).map((r: { player_id: string }) => r.player_id));
    const awayRosterIds = new Set((rosters || []).filter((r: { team_id: string }) => r.team_id === game.away_team_id).map((r: { player_id: string }) => r.player_id));

    // Fetch stat definitions
    const { data: statDefs } = await supabase.from('stat_definitions').select('id, slug');
    const validStatIds = new Set((statDefs || []).map((s: { id: string }) => s.id));
    const pointsDef = (statDefs || []).find((s: { slug: string }) => s.slug === 'points');

    // Validate each value (skip if values is empty - allow empty save)
    for (const v of values) {
      const { player_id, stat_definition_id } = v;
      if (!player_id || !stat_definition_id) return jsonResponse({ error: 'Each value needs player_id and stat_definition_id' }, 400);
      if (!rosterPlayerIds.has(player_id)) return jsonResponse({ error: `Player ${player_id} is not in this game's rosters` }, 400);
      if (!validStatIds.has(stat_definition_id)) return jsonResponse({ error: `Invalid stat_definition_id ${stat_definition_id}` }, 400);
    }

    // Upsert game_stat_values
    for (const v of values) {
      const { player_id, stat_definition_id, value } = v;
      const { error: upsertErr } = await supabase
        .from('game_stat_values')
        .upsert(
          { game_id, player_id, stat_definition_id, value: value ?? 0 },
          { onConflict: 'game_id,player_id,stat_definition_id' }
        );
      if (upsertErr) return jsonResponse({ error: upsertErr.message }, 400);
    }

    // Score derivation: sum points per team, update games
    if (pointsDef && (homeRosterIds.size > 0 || awayRosterIds.size > 0)) {
      const { data: gsv } = await supabase
        .from('game_stat_values')
        .select('player_id, value')
        .eq('game_id', game_id)
        .eq('stat_definition_id', pointsDef.id);

      let homeScore = 0;
      let awayScore = 0;
      (gsv || []).forEach((row: { player_id: string; value: number }) => {
        if (homeRosterIds.has(row.player_id)) homeScore += Number(row.value || 0);
        if (awayRosterIds.has(row.player_id)) awayScore += Number(row.value || 0);
      });

      const { error: updateErr } = await supabase
        .from('games')
        .update({ home_score: homeScore, away_score: awayScore })
        .eq('id', game_id);

      if (updateErr) return jsonResponse({ error: updateErr.message }, 400);
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ error: err?.message || 'Server error' }, 500);
  }
});
