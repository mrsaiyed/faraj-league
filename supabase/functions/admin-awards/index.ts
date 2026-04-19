import { verifyAdminToken, corsHeaders, jsonResponse, createServiceClient } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });

  const auth = await verifyAdminToken(req);
  if (!auth.valid) return jsonResponse({ error: auth.error }, auth.status);

  try {
    const body = await req.json();
    const supabase = await createServiceClient();

    const { season_id, week, akhlaq, akhlaq_post_url, motm1, motm2, motm3, champ, mvp, scoring } = body;
    if (!season_id || week == null) return jsonResponse({ error: 'season_id and week required' }, 400);

    const { data: existing } = await supabase
      .from('awards')
      .select('id')
      .eq('season_id', season_id)
      .eq('week', week)
      .maybeSingle();

    const row = {
      akhlaq: akhlaq ?? null,
      akhlaq_post_url: akhlaq_post_url ?? null,
      motm1: motm1 ?? null,
      motm2: motm2 ?? null,
      motm3: motm3 ?? null,
      champ: champ ?? null,
      mvp: mvp ?? null,
      scoring: scoring ?? null,
    };

    if (existing) {
      const { error } = await supabase.from('awards').update(row).eq('id', existing.id);
      if (error) return jsonResponse({ error: error.message }, 400);
    } else {
      const { error } = await supabase.from('awards').insert({
        season_id,
        week,
        ...row,
      });
      if (error) return jsonResponse({ error: error.message }, 400);
    }
    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ error: err.message || 'Server error' }, 500);
  }
});
