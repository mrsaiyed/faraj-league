import { verifyAdminToken, corsHeaders, jsonResponse, createServiceClient } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });

  const auth = await verifyAdminToken(req);
  if (!auth.valid) return jsonResponse({ error: auth.error }, auth.status);

  try {
    const body = await req.json();
    const supabase = await createServiceClient();

    const items = Array.isArray(body) ? body : [body];
    const validKeys = ['about_text', 'about_intro', 'about_secondary', 'about_conf_taglines', 'draft_recap', 'draft_placeholder', 'draft_team_order', 'draft_rounds', 'draft_current_pick', 'draft_running', 'draft_paused', 'draft_remaining_seconds', 'draft_timer_seconds', 'hero_badge', 'season_tag', 'media_top_plays_title', 'media_baseline_title', 'media_highlights_title', 'instagram_url', 'media_layout', 'sponsor_tier_title', 'sponsor_tier_conf', 'sponsor_tier_community', 'sponsor_community_1_name', 'sponsor_community_1_logo', 'sponsor_community_1_desc', 'sponsor_community_2_name', 'sponsor_community_2_logo', 'sponsor_community_2_desc', 'sponsor_community_3_name', 'sponsor_community_3_logo', 'sponsor_community_3_desc', 'conf_name_mecca', 'conf_name_medina', 'conferences_layout', 'schedule_slots_by_week', 'schedule_week_labels', 'schedule_dates_by_week', 'power_rankings_data', 'mvp_ladder_data'];

    for (const item of items) {
      const { key, value, season_id } = item;
      if (!key || !validKeys.includes(key)) continue;

      const q = supabase.from('content_blocks').select('id').eq('key', key);
      const { data: existing } = season_id
        ? await q.eq('season_id', season_id).maybeSingle()
        : await q.is('season_id', null).maybeSingle();

      if (existing) {
        await supabase.from('content_blocks').update({ value: value ?? '' }).eq('id', existing.id);
      } else {
        await supabase.from('content_blocks').insert({ key, value: value ?? '', season_id: season_id || null });
      }
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ error: err.message || 'Server error' }, 500);
  }
});
