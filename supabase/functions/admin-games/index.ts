import { verifyAdminToken, corsHeaders, jsonResponse, createServiceClient } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });

  const auth = await verifyAdminToken(req);
  if (!auth.valid) return jsonResponse({ error: auth.error }, auth.status);

  try {
    const body = await req.json();
    const supabase = await createServiceClient();

    if (body.delete && body.id) {
      const { error } = await supabase.from('games').delete().eq('id', body.id);
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({ ok: true });
    }

    if (body.id) {
      const { week, game_index, home_team_id, away_team_id, home_score, away_score, scheduled_at,
        status, period, clock_seconds, clock_running } = body;

      if (status !== undefined && status !== null &&
          !['scheduled', 'live', 'halftime', 'final'].includes(String(status))) {
        return jsonResponse({ error: 'status must be scheduled, live, halftime or final' }, 400);
      }

      // The clock is stored as "seconds remaining, as of this instant"; viewers
      // extrapolate from clock_updated_at, so it is stamped server-side rather
      // than trusting a scorekeeper's device clock.
      const touchesClock = clock_seconds !== undefined || clock_running !== undefined;

      const { error } = await supabase.from('games').update({
        ...(week != null && { week }),
        ...(game_index != null && { game_index }),
        ...(home_team_id != null && { home_team_id }),
        ...(away_team_id != null && { away_team_id }),
        ...(home_score !== undefined && { home_score }),
        ...(away_score !== undefined && { away_score }),
        ...(scheduled_at !== undefined && { scheduled_at }),
        ...(status !== undefined && { status }),
        ...(period !== undefined && { period }),
        ...(clock_seconds !== undefined && { clock_seconds }),
        ...(clock_running !== undefined && { clock_running: !!clock_running }),
        ...(touchesClock && { clock_updated_at: new Date().toISOString() }),
      }).eq('id', body.id);
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({ ok: true });
    }

    const { season_id, week, game_index, home_team_id, away_team_id, home_score, away_score, scheduled_at } = body;
    if (!season_id || week == null || game_index == null || !home_team_id || !away_team_id) {
      return jsonResponse({ error: 'season_id, week, game_index, home_team_id, away_team_id required' }, 400);
    }

    // DB may add UNIQUE(season_id, week, game_index) later; duplicate inserts would surface as Postgres errors here.
    const { data, error } = await supabase.from('games').insert({
      season_id,
      week,
      game_index,
      home_team_id,
      away_team_id,
      home_score: home_score ?? null,
      away_score: away_score ?? null,
      scheduled_at: scheduled_at || null,
    }).select('id').single();

    if (error) return jsonResponse({ error: error.message }, 400);
    return jsonResponse({ ok: true, id: data?.id });
  } catch (err) {
    return jsonResponse({ error: err.message || 'Server error' }, 500);
  }
});
