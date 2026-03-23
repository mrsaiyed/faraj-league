import { verifyAdminToken, corsHeaders, jsonResponse, createServiceClient } from '../_shared/auth.ts';

const VALID_SLOT_KEYS = ['top_plays_default', 'baseline_ep1', 'baseline_ep2', 'baseline_ep3', 'highlights_g1', 'highlights_g2', 'highlights_g3'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });

  const auth = await verifyAdminToken(req);
  if (!auth.valid) return jsonResponse({ error: auth.error }, auth.status);

  try {
    const body = await req.json();
    const supabase = await createServiceClient();

    const items: { season_id: string; week: number; slot_key: string; title?: string; url?: string }[] = body.bulk
      ? body.bulk
      : body.season_id != null && body.week != null && body.slot_key
      ? [body]
      : [];

    if (items.length === 0) {
      return jsonResponse({ error: 'Provide { season_id, week, slot_key } or { bulk: [...] }' }, 400);
    }

    for (const item of items) {
      const { season_id, week, slot_key, title, url } = item;
      if (!slot_key || !VALID_SLOT_KEYS.includes(slot_key)) {
        return jsonResponse({ error: `Invalid slot_key. Must be one of: ${VALID_SLOT_KEYS.join(', ')}` }, 400);
      }
      if (!season_id || week == null || week < 1) {
        return jsonResponse({ error: 'season_id and week (>= 1) required' }, 400);
      }

      const { data: season } = await supabase.from('seasons').select('id').eq('id', season_id).single();
      if (!season) return jsonResponse({ error: 'Season not found' }, 400);
    }

    for (const item of items) {
      const { season_id, week, slot_key, title, url } = item;
      const { error } = await supabase
        .from('media_slots')
        .upsert(
          { season_id, week, slot_key, title: title ?? null, url: url ?? null },
          { onConflict: 'season_id,week,slot_key' }
        );
      if (error) return jsonResponse({ error: error.message }, 400);
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ error: err.message || 'Server error' }, 500);
  }
});
