import { verifyAdminToken, corsHeaders, jsonResponse, createServiceClient } from '../_shared/auth.ts';

type Supa = Awaited<ReturnType<typeof createServiceClient>>;

/**
 * Write one content block: update the row(s) holding the key, or insert one.
 *
 * It used to look the key up as "exactly one row", so a key that ever got two
 * rows (two saves at once) found none and inserted another on every save — the
 * draft settings reached 63 copies. Migration 015 removes the copies and allows
 * one row per key per season; updating first works either side of it, and an
 * insert that loses a race to another save updates that row instead.
 */
async function saveBlock(supabase: Supa, key: string, value: string, seasonId: string | null) {
  const update = () => {
    const q = supabase.from('content_blocks').update({ value }).eq('key', key);
    return seasonId ? q.eq('season_id', seasonId) : q.is('season_id', null);
  };
  const { data: updated, error: updateErr } = await update().select('id');
  if (updateErr) return updateErr;
  if (updated && updated.length) return null;

  const { error: insertErr } = await supabase.from('content_blocks').insert({ key, value, season_id: seasonId });
  if (insertErr?.code === '23505') {
    const { error } = await update();
    return error;
  }
  return insertErr;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });

  const auth = await verifyAdminToken(req);
  if (!auth.valid) return jsonResponse({ error: auth.error }, auth.status);

  try {
    const body = await req.json();
    const supabase = await createServiceClient();

    const items = Array.isArray(body) ? body : [body];
    const validKeys = ['about_text', 'about_intro', 'about_secondary', 'about_conf_taglines', 'draft_recap', 'draft_placeholder', 'draft_team_order', 'draft_rounds', 'draft_current_pick', 'draft_running', 'draft_paused', 'draft_remaining_seconds', 'draft_timer_seconds', 'hero_badge', 'season_tag', 'media_top_plays_title', 'media_baseline_title', 'media_highlights_title', 'instagram_url', 'media_layout', 'sponsor_tier_title', 'sponsor_tier_conf', 'sponsor_tier_community', 'sponsor_community_1_name', 'sponsor_community_1_logo', 'sponsor_community_1_desc', 'sponsor_community_2_name', 'sponsor_community_2_logo', 'sponsor_community_2_desc', 'sponsor_community_3_name', 'sponsor_community_3_logo', 'sponsor_community_3_desc', 'conf_name_mecca', 'conf_name_medina', 'conferences_layout', 'schedule_slots_by_week', 'schedule_week_labels', 'schedule_dates_by_week', 'playoffs_by_week', 'playoffs_mvp', 'dpoy', 'power_rankings_data', 'mvp_ladder_data', 'game_rules'];

    for (const item of items) {
      const { key, value, season_id } = item;
      if (!key || !validKeys.includes(key)) continue;
      const err = await saveBlock(supabase, key, value ?? '', season_id || null);
      if (err) return jsonResponse({ error: err.message }, 400);
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ error: err.message || 'Server error' }, 500);
  }
});
