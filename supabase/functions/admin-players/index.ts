import { verifyAdminToken, corsHeaders, jsonResponse, createServiceClient } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });

  const auth = await verifyAdminToken(req);
  if (!auth.valid) return jsonResponse({ error: auth.error }, auth.status);

  try {
    const body = await req.json();
    const supabase = await createServiceClient();

    if (body.delete && body.id) {
      const { data: player } = await supabase.from('players').select('name, season_id').eq('id', body.id).single();
      await supabase.from('rosters').delete().eq('player_id', body.id);
      if (player?.name && player?.season_id) {
        const { data: teamsWithCaptain } = await supabase.from('teams').select('id').eq('season_id', player.season_id).eq('captain', player.name);
        if (teamsWithCaptain?.length) {
          for (const team of teamsWithCaptain) {
            await supabase.from('teams').update({ captain: null }).eq('id', team.id);
          }
        }
      }
      const { error } = await supabase.from('players').delete().eq('id', body.id);
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({ ok: true });
    }

    if (body.id) {
      const { name, jersey_number, team_id } = body;
      await supabase.from('players').update({
        ...(name != null && { name }),
        ...(jersey_number != null && { jersey_number }),
      }).eq('id', body.id);

      if (team_id !== undefined) {
        await supabase.from('rosters').delete().eq('player_id', body.id);
        if (team_id) {
          const { data: rows } = await supabase.from('rosters').select('sort_order').eq('team_id', team_id).order('sort_order', { ascending: false }).limit(1);
          const maxOrder = (rows?.[0] as { sort_order?: number } | undefined)?.sort_order ?? -1;
          const nextOrder = maxOrder + 1;
          await supabase.from('rosters').insert({ player_id: body.id, team_id, sort_order: nextOrder });
        }
      }
      return jsonResponse({ ok: true });
    }

    const { season_id, name, jersey_number, team_id } = body;
    if (!season_id || !name) return jsonResponse({ error: 'season_id and name required' }, 400);

    const { data: player, error: err1 } = await supabase.from('players').insert({
      season_id,
      name,
      jersey_number: jersey_number ?? null,
    }).select('id').single();

    if (err1) return jsonResponse({ error: err1.message }, 400);
    if (team_id && player?.id) {
      const { data: rows } = await supabase.from('rosters').select('sort_order').eq('team_id', team_id).order('sort_order', { ascending: false }).limit(1);
      const maxOrder = (rows?.[0] as { sort_order?: number } | undefined)?.sort_order ?? -1;
      const nextOrder = maxOrder + 1;
      await supabase.from('rosters').insert({ player_id: player.id, team_id, sort_order: nextOrder });
    }
    return jsonResponse({ ok: true, id: player?.id });
  } catch (err) {
    return jsonResponse({ error: err.message || 'Server error' }, 500);
  }
});
