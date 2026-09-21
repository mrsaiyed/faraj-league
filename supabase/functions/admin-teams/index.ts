import { verifyAdminToken, corsHeaders, jsonResponse, createServiceClient } from '../_shared/auth.ts';

/** Blank input from a form field means "no logo", not the empty string. */
function emptyToNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

/** Mirrors the teams_logo_scale_range CHECK added in migration 011. */
function validateLogoScale(v: unknown): string | null {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0 || n > 10) {
    return 'logo_scale must be a number greater than 0 and at most 10';
  }
  return null;
}

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
      const { name, conference, captain, sort_order, logo_url, logo_scale } = body;
      const scaleErr = validateLogoScale(logo_scale);
      if (scaleErr) return jsonResponse({ error: scaleErr }, 400);
      const { error } = await supabase.from('teams').update({
        ...(name != null && { name }),
        ...(conference != null && { conference }),
        ...(captain != null && { captain }),
        ...(sort_order != null && { sort_order }),
        // Sent explicitly (including null) to clear a logo, so these use
        // !== undefined rather than the != null used by the fields above.
        ...(logo_url !== undefined && { logo_url: emptyToNull(logo_url) }),
        ...(logo_scale !== undefined && { logo_scale: logo_scale === '' || logo_scale === null ? null : Number(logo_scale) }),
      }).eq('id', body.id);
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({ ok: true });
    }

    const { season_id, name, conference, captain, sort_order, logo_url, logo_scale } = body;
    if (!season_id || !name) return jsonResponse({ error: 'season_id and name required' }, 400);
    const scaleErr = validateLogoScale(logo_scale);
    if (scaleErr) return jsonResponse({ error: scaleErr }, 400);

    const { data, error } = await supabase.from('teams').insert({
      season_id,
      name,
      conference: conference || 'Mecca',
      captain: captain || null,
      sort_order: sort_order ?? 0,
      logo_url: emptyToNull(logo_url),
      logo_scale: logo_scale === '' || logo_scale == null ? null : Number(logo_scale),
    }).select('id').single();

    if (error) return jsonResponse({ error: error.message }, 400);
    return jsonResponse({ ok: true, id: data?.id });
  } catch (err) {
    return jsonResponse({ error: err.message || 'Server error' }, 500);
  }
});
