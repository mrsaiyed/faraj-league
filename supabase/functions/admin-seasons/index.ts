import { verifyAdminToken, corsHeaders, jsonResponse, createServiceClient } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });

  const auth = await verifyAdminToken(req);
  if (!auth.valid) return jsonResponse({ error: auth.error }, auth.status);

  try {
    const body = await req.json();
    const { id, is_current, current_week } = body;

    if (!id) return jsonResponse({ error: 'id required' }, 400);

    const supabase = await createServiceClient();

    if (is_current === true) {
      await supabase.from('seasons').update({ is_current: false }).neq('id', id);
    }

    const { error } = await supabase.from('seasons').update({
      is_current: is_current ?? undefined,
      current_week: current_week ?? undefined,
    }).eq('id', id);

    if (error) return jsonResponse({ error: error.message }, 400);
    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ error: err.message || 'Server error' }, 500);
  }
});
