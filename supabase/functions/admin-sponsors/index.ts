import { verifyAdminToken, corsHeaders, jsonResponse, createServiceClient } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });

  const auth = await verifyAdminToken(req);
  if (!auth.valid) return jsonResponse({ error: auth.error }, auth.status);

  try {
    const body = await req.json();
    const supabase = await createServiceClient();

    if (body.delete && body.id) {
      const { error } = await supabase.from('sponsors').delete().eq('id', body.id);
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({ ok: true });
    }

    if (body.id) {
      const { type, name, logo_url, label } = body;
      const { error } = await supabase.from('sponsors').update({
        ...(type != null && { type }),
        ...(name != null && { name }),
        ...(logo_url !== undefined && { logo_url }),
        ...(label !== undefined && { label }),
      }).eq('id', body.id);
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({ ok: true });
    }

    const { season_id, type, name, logo_url, label } = body;
    if (!season_id || !type) return jsonResponse({ error: 'season_id and type required' }, 400);

    const { data, error } = await supabase.from('sponsors').insert({
      season_id,
      type,
      name: name ?? null,
      logo_url: logo_url ?? null,
      label: label ?? null,
    }).select('id').single();

    if (error) return jsonResponse({ error: error.message }, 400);
    return jsonResponse({ ok: true, id: data?.id });
  } catch (err) {
    return jsonResponse({ error: err.message || 'Server error' }, 500);
  }
});
