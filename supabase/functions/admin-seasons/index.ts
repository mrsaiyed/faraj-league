import { verifyAdminToken, corsHeaders, jsonResponse, createServiceClient } from '../_shared/auth.ts';

/** Mirrors SEASON_SLUG_RE in lib/seasons.js — the client slugifies, the server still validates. */
const SEASON_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,47}$/;

/**
 * content_blocks keys that describe how a season is laid out rather than what
 * happened in it. Copied when a new season carries settings over.
 * Deliberately excluded: schedule_*, playoffs_*, draft_*, power_rankings_data,
 * mvp_ladder_data, hero_badge, season_tag — all per-season results or copy.
 */
const STRUCTURE_KEYS = [
  'conferences_layout',
  'conf_name_mecca',
  'conf_name_medina',
  'about_text',
  'about_intro',
  'about_secondary',
  'about_conf_taglines',
  'media_top_plays_title',
  'media_baseline_title',
  'media_highlights_title',
  'instagram_url',
  'media_layout',
];

/** content_blocks keys copied alongside the sponsors table. */
const SPONSOR_KEYS = [
  'sponsor_tier_title',
  'sponsor_tier_conf',
  'sponsor_tier_community',
  'sponsor_community_1_name',
  'sponsor_community_1_logo',
  'sponsor_community_1_desc',
  'sponsor_community_2_name',
  'sponsor_community_2_logo',
  'sponsor_community_2_desc',
  'sponsor_community_3_name',
  'sponsor_community_3_logo',
  'sponsor_community_3_desc',
];

type Supa = Awaited<ReturnType<typeof createServiceClient>>;

/** Copy content_blocks rows for the given keys from one season to another. */
async function copyContentBlocks(supabase: Supa, fromId: string, toId: string, keys: string[]) {
  const { data } = await supabase
    .from('content_blocks')
    .select('key, value')
    .eq('season_id', fromId)
    .in('key', keys);
  const rows = (data || []).map((b: { key: string; value: string | null }) => ({
    key: b.key,
    value: b.value ?? '',
    season_id: toId,
  }));
  if (rows.length) await supabase.from('content_blocks').insert(rows);
  return rows.length;
}

/** Copy team rows (no players, no rosters, no games) from one season to another. */
async function copyTeams(supabase: Supa, fromId: string, toId: string) {
  const { data } = await supabase
    .from('teams')
    .select('name, conference, captain, sort_order')
    .eq('season_id', fromId)
    .order('sort_order');
  const rows = (data || []).map((t: Record<string, unknown>) => ({ ...t, season_id: toId }));
  if (rows.length) await supabase.from('teams').insert(rows);
  return rows.length;
}

/** Copy sponsor rows (title + conference tiers) from one season to another. */
async function copySponsors(supabase: Supa, fromId: string, toId: string) {
  const { data } = await supabase
    .from('sponsors')
    .select('type, name, logo_url, label')
    .eq('season_id', fromId);
  const rows = (data || []).map((s: Record<string, unknown>) => ({ ...s, season_id: toId }));
  if (rows.length) await supabase.from('sponsors').insert(rows);
  return rows.length;
}

/** Make one season current and clear the flag on every other season. */
async function setCurrent(supabase: Supa, id: string) {
  // Clear first: a partial unique index (migration 010) allows only one current season.
  const { error: clearErr } = await supabase.from('seasons').update({ is_current: false }).neq('id', id);
  if (clearErr) return clearErr;
  const { error } = await supabase.from('seasons').update({ is_current: true }).eq('id', id);
  return error;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });

  const auth = await verifyAdminToken(req);
  if (!auth.valid) return jsonResponse({ error: auth.error }, auth.status);

  try {
    const body = await req.json();
    const supabase = await createServiceClient();

    // ---- Create a new season -------------------------------------------------
    if (body.create) {
      const label = String(body.label || '').trim();
      const slug = String(body.slug || '').trim().toLowerCase();

      if (!label) return jsonResponse({ error: 'label required' }, 400);
      if (!SEASON_SLUG_RE.test(slug)) {
        return jsonResponse({ error: 'slug must be lowercase letters, numbers and hyphens (e.g. fall2026)' }, 400);
      }

      const { data: clash } = await supabase.from('seasons').select('id').eq('slug', slug).maybeSingle();
      if (clash) return jsonResponse({ error: `A season with the slug "${slug}" already exists` }, 409);

      const totalWeeks = body.total_weeks != null && body.total_weeks !== '' ? Number(body.total_weeks) : null;
      const currentWeek = body.current_week != null && body.current_week !== '' ? Number(body.current_week) : null;
      if (totalWeeks != null && (!Number.isInteger(totalWeeks) || totalWeeks < 1)) {
        return jsonResponse({ error: 'total_weeks must be a positive whole number' }, 400);
      }
      if (currentWeek != null && (!Number.isInteger(currentWeek) || currentWeek < 0)) {
        return jsonResponse({ error: 'current_week must be zero or a positive whole number' }, 400);
      }

      // Insert as non-current, then promote, so the one-current index is never violated.
      const { data: created, error: insertErr } = await supabase.from('seasons').insert({
        slug,
        label,
        is_current: false,
        total_weeks: totalWeeks,
        current_week: currentWeek,
      }).select('id, slug, label').single();

      if (insertErr) return jsonResponse({ error: insertErr.message }, 400);
      const newId = created?.id;
      if (!newId) return jsonResponse({ error: 'Season was not created' }, 500);

      // Carry structure over from an existing season so the new one starts with the
      // same categories (conferences, labels, sponsor tiers) rather than blank.
      const copied = { settings: 0, teams: 0, sponsors: 0 };
      const copyFrom = body.copy_from_season_id ? String(body.copy_from_season_id) : null;
      if (copyFrom && copyFrom !== newId) {
        const { data: src } = await supabase.from('seasons').select('id').eq('id', copyFrom).maybeSingle();
        if (!src) return jsonResponse({ error: 'copy_from_season_id does not match a season' }, 400);
        const opts = body.copy || {};
        if (opts.settings) copied.settings = await copyContentBlocks(supabase, copyFrom, newId, STRUCTURE_KEYS);
        if (opts.teams) copied.teams = await copyTeams(supabase, copyFrom, newId);
        if (opts.sponsors) {
          copied.sponsors = await copySponsors(supabase, copyFrom, newId);
          await copyContentBlocks(supabase, copyFrom, newId, SPONSOR_KEYS);
        }
      }

      if (body.is_current === true) {
        const err = await setCurrent(supabase, newId);
        if (err) return jsonResponse({ error: err.message }, 400);
      }

      return jsonResponse({
        ok: true,
        id: newId,
        slug: created.slug,
        label: created.label,
        is_current: body.is_current === true,
        copied,
      });
    }

    // ---- Update an existing season ------------------------------------------
    const { id, is_current, current_week, total_weeks, label } = body;
    if (!id) return jsonResponse({ error: 'id required' }, 400);

    if (is_current === true) {
      const err = await setCurrent(supabase, id);
      if (err) return jsonResponse({ error: err.message }, 400);
    }

    const patch: Record<string, unknown> = {};
    if (is_current === false) patch.is_current = false;
    if (current_week !== undefined) patch.current_week = current_week;
    if (total_weeks !== undefined) patch.total_weeks = total_weeks;
    if (label != null && String(label).trim()) patch.label = String(label).trim();

    if (Object.keys(patch).length) {
      const { error } = await supabase.from('seasons').update(patch).eq('id', id);
      if (error) return jsonResponse({ error: error.message }, 400);
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ error: err.message || 'Server error' }, 500);
  }
});
