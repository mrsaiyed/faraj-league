import { verifyAdminToken, corsHeaders, jsonResponse, createServiceClient } from '../_shared/auth.ts';

/**
 * Save or delete a game's play-by-play (`game_logs`, migration 013).
 *
 * POST { game_id, events, names }   upserts the log (the tracker sends it on
 *                                   End game, Save, period changes and close)
 * POST { game_id, delete: true }    removes it (clearing a game does this)
 *
 * The log is replaced whole each time: the tracker always holds the complete
 * list, cut at its undo cursor, so there is nothing to merge.
 */

// A full game is a few hundred events. These are far above that, and keep a
// runaway client from storing megabytes in one row.
const MAX_EVENTS = 5000;
const MAX_BYTES = 1_000_000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });

  const auth = await verifyAdminToken(req);
  if (!auth.valid) return jsonResponse({ error: auth.error }, auth.status);

  try {
    const body = await req.json();
    const { game_id, events, names = {} } = body;
    if (!game_id) return jsonResponse({ error: 'game_id required' }, 400);

    const supabase = await createServiceClient();

    if (body.delete) {
      const { error } = await supabase.from('game_logs').delete().eq('game_id', game_id);
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({ ok: true, deleted: true });
    }

    if (!Array.isArray(events)) return jsonResponse({ error: 'events must be an array' }, 400);
    if (events.length > MAX_EVENTS) return jsonResponse({ error: `A log holds at most ${MAX_EVENTS} events` }, 400);
    if (events.some((e: unknown) => !e || typeof e !== 'object' || typeof (e as { type?: unknown }).type !== 'string')) {
      return jsonResponse({ error: 'Every event needs a type' }, 400);
    }
    if (!names || typeof names !== 'object' || Array.isArray(names)) {
      return jsonResponse({ error: 'names must be an object of player id to name' }, 400);
    }

    const log = { version: 1, events, names };
    if (JSON.stringify(log).length > MAX_BYTES) return jsonResponse({ error: 'Game log is too large' }, 413);

    const { data: game } = await supabase.from('games').select('id').eq('id', game_id).maybeSingle();
    if (!game) return jsonResponse({ error: 'Game not found' }, 400);

    const { error } = await supabase
      .from('game_logs')
      .upsert({ game_id, log, updated_at: new Date().toISOString() }, { onConflict: 'game_id' });
    if (error) return jsonResponse({ error: error.message }, 400);

    return jsonResponse({ ok: true, events: events.length });
  } catch (err) {
    return jsonResponse({ error: err?.message || 'Server error' }, 500);
  }
});
