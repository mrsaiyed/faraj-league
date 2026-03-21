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
  ] = await Promise.all([
    supabase.from('teams').select('*').eq('season_id', seasonId).order('sort_order'),
    supabase.from('players').select('*').eq('season_id', seasonId),
    supabase.from('rosters').select('*'),
    supabase.from('games').select('*').eq('season_id', seasonId).order('week').order('game_index'),
    supabase.from('awards').select('*').eq('season_id', seasonId).order('week'),
    supabase.from('stat_definitions').select('*').order('sort_order'),
    supabase.from('sponsors').select('*').eq('season_id', seasonId),
  ]);

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

  return {
    data: {
      season,
      teams: teamsRes.data,
      players: playersRes.data,
      rosters: rostersRes.data,
      games: gamesRes.data,
      awards: awardsRes.data,
      stat_definitions: statDefsRes.data,
      player_stat_values: playerStatsRes.data,
      sponsors: sponsorsRes.data,
    },
    error: null,
  };
}
