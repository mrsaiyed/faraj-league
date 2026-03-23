import { verifyAdminToken, corsHeaders, jsonResponse, createServiceClient } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });

  const auth = await verifyAdminToken(req);
  if (!auth.valid) return jsonResponse({ error: auth.error }, auth.status);

  try {
    const body = await req.json();
    const supabase = await createServiceClient();

    if (body.type === 'definition') {
      if (body.delete && body.id) {
        const { error } = await supabase.from('stat_definitions').delete().eq('id', body.id);
        if (error) return jsonResponse({ error: error.message }, 400);
        return jsonResponse({ ok: true });
      }
      if (body.id) {
        const { name, slug, unit, sort_order, scope } = body;
        const { error } = await supabase.from('stat_definitions').update({
          ...(name != null && { name }),
          ...(slug != null && { slug }),
          ...(unit != null && { unit }),
          ...(sort_order != null && { sort_order }),
          ...(scope !== undefined && { scope: scope || null }),
        }).eq('id', body.id);
        if (error) return jsonResponse({ error: error.message }, 400);
        return jsonResponse({ ok: true });
      }
      const { name, slug, unit, sort_order, scope } = body;
      if (!name || !slug) return jsonResponse({ error: 'name and slug required' }, 400);
      const { data, error } = await supabase.from('stat_definitions').insert({
        name,
        slug,
        unit: unit ?? null,
        sort_order: sort_order ?? 0,
        scope: scope ?? 'game',
      }).select('id').single();
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({ ok: true, id: data?.id });
    }

    if (body.type === 'value') {
      const { player_id, stat_definition_id, value } = body;
      if (!player_id || !stat_definition_id) return jsonResponse({ error: 'player_id and stat_definition_id required' }, 400);
      const { error } = await supabase.from('player_stat_values').upsert(
        { player_id, stat_definition_id, value: value ?? 0 },
        { onConflict: 'player_id,stat_definition_id' }
      );
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: 'type (definition or value) required' }, 400);
  } catch (err) {
    return jsonResponse({ error: err.message || 'Server error' }, 500);
  }
});
