/**
 * Faraj League public API helpers.
 * Use with a Supabase client created with SUPABASE_URL + SUPABASE_ANON_KEY.
 * RLS allows public read on all tables.
 *
 * API shape (matches all_phases.md):
 * - getSeasons()     → GET /seasons (list)
 * - getCurrentSeason() → GET /seasons/current
 * - getSeasonData(slug) → GET /seasons/:slug/data
 */

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<{ data: object[] | null, error: object | null }>}
 */
export async function getSeasons(supabase) {
  return supabase.from('seasons').select('*').order('created_at', { ascending: false });
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<{ data: object | null, error: object | null }>}
 */
export async function getCurrentSeason(supabase) {
  return supabase
    .from('seasons')
    .select('*')
    .eq('is_current', true)
    .single();
}

/**
 * Fetch full season data: teams, players, rosters, games, awards, stats, sponsors.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} slug - Season slug (e.g. 'spring2026')
 * @returns {Promise<{ data: object | null, error: object | null }>}
 *   data: { season, teams, players, rosters, games, awards, stat_definitions, player_stat_values, sponsors }
 */
export async function getSeasonData(supabase, slug) {
  const { data: season, error: seasonErr } = await supabase
    .from('seasons')
    .select('*')
    .eq('slug', slug)
    .single();

  if (seasonErr || !season) {
    return { data: null, error: seasonErr || new Error('Season not found') };
  }

  const seasonId = season.id;

  const [
    teamsRes,
    playersRes,
    rostersRes,
    gamesRes,
    awardsRes,
    statDefsRes,
    sponsorsRes,
    mediaRes,
    mediaSlotsRes,
    contentRes,
  ] = await Promise.all([
    supabase.from('teams').select('*').eq('season_id', seasonId).order('sort_order'),
    supabase.from('players').select('*').eq('season_id', seasonId),
    supabase.from('rosters').select('*').order('sort_order', { ascending: true }),
    supabase.from('games').select('*').eq('season_id', seasonId).order('week').order('game_index'),
    supabase.from('awards').select('*').eq('season_id', seasonId).order('week'),
    supabase.from('stat_definitions').select('*').order('sort_order'),
    supabase.from('sponsors').select('*').eq('season_id', seasonId),
    supabase.from('media_items').select('*').eq('season_id', seasonId).order('week').order('sort_order'),
    supabase.from('media_slots').select('*').eq('season_id', seasonId),
    supabase.from('content_blocks').select('*').or(`season_id.eq.${seasonId},season_id.is.null`),
  ]);

  const mediaItems = mediaRes?.error ? [] : (mediaRes?.data || []);
  const media_slots = mediaSlotsRes?.error ? [] : (mediaSlotsRes?.data || []);
  const contentBlocks = contentRes?.error ? [] : (contentRes?.data || []);

  const err =
    teamsRes.error ||
    playersRes.error ||
    rostersRes.error ||
    gamesRes.error ||
    awardsRes.error ||
    statDefsRes.error ||
    sponsorsRes.error;

  if (err) {
    return { data: null, error: err };
  }

  const playerIds = (playersRes.data || []).map((p) => p.id);
  let playerStatsRes = { data: [], error: null };
  if (playerIds.length > 0) {
    playerStatsRes = await supabase
      .from('player_stat_values')
      .select('*')
      .in('player_id', playerIds);
  }

  if (playerStatsRes.error) {
    return { data: null, error: playerStatsRes.error };
  }

  // Fetch game_stat_values for games in this season
  const gameIds = (gamesRes.data || []).map((g) => g.id);
  let gameStatValuesRes = { data: [], error: null };
  if (gameIds.length > 0) {
    gameStatValuesRes = await supabase
      .from('game_stat_values')
      .select('*')
      .in('game_id', gameIds);
  }
  const game_stat_values = gameStatValuesRes.error ? [] : (gameStatValuesRes?.data || []);

  return {
    data: {
      season,
      teams: teamsRes.data,
      players: playersRes.data,
      rosters: rostersRes.data,
      games: gamesRes.data,
      game_stat_values,
      awards: awardsRes.data,
      stat_definitions: statDefsRes.data,
      player_stat_values: playerStatsRes.data,
      sponsors: sponsorsRes.data,
      media_items: mediaItems,
      media_slots,
      content_blocks: contentBlocks,
    },
    error: null,
  };
}
