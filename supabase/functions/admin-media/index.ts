import { verifyAdminToken, corsHeaders, jsonResponse, createServiceClient } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });

  const auth = await verifyAdminToken(req);
  if (!auth.valid) return jsonResponse({ error: auth.error }, auth.status);

  try {
    const body = await req.json();
    const supabase = await createServiceClient();

    if (body.delete && body.id) {
      const { error } = await supabase.from('media_items').delete().eq('id', body.id);
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({ ok: true });
    }

    if (body.id) {
      const { week, title, url, type, sort_order } = body;
      const { error } = await supabase.from('media_items').update({
        ...(week != null && { week }),
        ...(title != null && { title }),
        ...(url != null && { url }),
        ...(type != null && { type }),
        ...(sort_order != null && { sort_order }),
      }).eq('id', body.id);
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({ ok: true });
    }

    const { season_id, week, title, url, type, sort_order } = body;
    if (!season_id || week == null || !title || !url || !type) {
      return jsonResponse({ error: 'season_id, week, title, url, type required' }, 400);
    }

    const { data, error } = await supabase.from('media_items').insert({
      season_id,
      week,
      title,
      url,
      type,
      sort_order: sort_order ?? 0,
    }).select('id').single();

    if (error) return jsonResponse({ error: error.message }, 400);
    return jsonResponse({ ok: true, id: data?.id });
  } catch (err) {
    return jsonResponse({ error: err.message || 'Server error' }, 500);
  }
});
