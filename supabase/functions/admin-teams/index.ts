import { verifyAdminToken, corsHeaders, jsonResponse, createServiceClient } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });

  const auth = await verifyAdminToken(req);
  if (!auth.valid) return jsonResponse({ error: auth.error }, auth.status);

  try {
    const body = await req.json();
    const supabase = await createServiceClient();

    if (body.delete && body.id) {
      const { error } = await supabase.from('teams').delete().eq('id', body.id);
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({ ok: true });
    }

    if (body.id) {
      const { name, conference, captain, sort_order } = body;
      const { error } = await supabase.from('teams').update({
        ...(name != null && { name }),
        ...(conference != null && { conference }),
        ...(captain != null && { captain }),
        ...(sort_order != null && { sort_order }),
      }).eq('id', body.id);
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({ ok: true });
    }

    const { season_id, name, conference, captain, sort_order } = body;
    if (!season_id || !name) return jsonResponse({ error: 'season_id and name required' }, 400);

    const { data, error } = await supabase.from('teams').insert({
      season_id,
      name,
      conference: conference || 'Mecca',
      captain: captain || null,
      sort_order: sort_order ?? 0,
    }).select('id').single();

    if (error) return jsonResponse({ error: error.message }, 400);
    return jsonResponse({ ok: true, id: data?.id });
  } catch (err) {
    return jsonResponse({ error: err.message || 'Server error' }, 500);
  }
});
