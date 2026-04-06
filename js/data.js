/**
 * Faraj League data layer — API fetch and transform.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js';
import { getSeasons, getSeasonData } from '../lib/api.js';
import { aggregateStats } from '../lib/stats.js';
import { config } from './config.js';

const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);

function transformSeasonData(raw) {
  const { season, teams: rawTeams, players, rosters, games, game_stat_values, awards, stat_definitions, player_stat_values, sponsors, media_items, media_slots, content_blocks } = raw;
  const teamMap = {};
  (rawTeams || []).forEach(t => { teamMap[t.id] = t; });
  const playerMap = {};
  (players || []).forEach(p => { playerMap[p.id] = p; });

  const teams = (rawTeams || []).map(t => {
    const rosterRows = (rosters || []).filter(r => r.team_id === t.id)
      .map(r => ({ id: r.player_id, name: playerMap[r.player_id]?.name, sort_order: r.sort_order ?? 0 })).filter(r => r.name);
    rosterRows.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const roster = rosterRows.map(r => ({ id: r.id, name: r.name, jersey_number: playerMap[r.player_id]?.jersey_number }));
    const playersList = roster.map(r => r.name);
    return { id: t.id, name: t.name, conf: t.conference || t.conf, captain: t.captain || '', players: playersList, roster, sort_order: t.sort_order ?? 0 };
  });

  const scores = (games || []).map(g => ({
    week: g.week,
    game: g.game_index,
    gameId: g.id,
    t1Id: g.home_team_id,
    t2Id: g.away_team_id,
    t1: teamMap[g.home_team_id]?.name || '',
    s1: g.home_score != null ? String(g.home_score) : '',
    t2: teamMap[g.away_team_id]?.name || '',
    s2: g.away_score != null ? String(g.away_score) : '',
    scheduled_at: g.scheduled_at || null,
  }));

  // gameStatValues: { [gameId]: { [playerId]: { [statDefId]: value } } }
  const gameStatValues = {};
  (game_stat_values || []).forEach(gsv => {
    if (!gameStatValues[gsv.game_id]) gameStatValues[gsv.game_id] = {};
    if (!gameStatValues[gsv.game_id][gsv.player_id]) gameStatValues[gsv.game_id][gsv.player_id] = {};
    gameStatValues[gsv.game_id][gsv.player_id][gsv.stat_definition_id] = Number(gsv.value || 0);
  });

  // stat_definitions for box score columns (scope='game' or null)
  const statDefinitions = (stat_definitions || []).filter(s => s.scope === 'game' || s.scope == null).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  const awardsTransformed = (awards || []).map(a => ({
    week: a.week,
    akhlaq: a.akhlaq || '',
    motm1: a.motm1 || '',
    motm2: a.motm2 || '',
    motm3: a.motm3 || '',
    champ: a.champ || '',
    mvp: a.mvp || '',
    scoring: a.scoring || '',
  }));

  const rosterToTeam = {};
  const playerToTeamId = {};
  (rosters || []).forEach(r => {
    rosterToTeam[r.player_id] = teamMap[r.team_id]?.name || '';
    playerToTeamId[r.player_id] = r.team_id;
  });

  const stats = aggregateStats({
    game_stat_values,
    player_stat_values,
    stat_definitions,
    rosters,
    games,
    players,
    rosterToTeam,
    playerToTeamId,
  });

  const sponsorOverrides = {};
  (sponsors || []).forEach(s => {
    if (s.type === 'title') {
      if (s.name != null && s.name !== '') sponsorOverrides.SP1 = s.name;
      sponsorOverrides.SP1_LOGO = s.logo_url || null;
      sponsorOverrides.SP1_DESC = s.label ?? '';
    }
    if (s.type === 'conference_mecca') {
      if (s.name != null && s.name !== '') sponsorOverrides.SP2A = s.name;
      sponsorOverrides.SP2A_LOGO = s.logo_url || null;
      sponsorOverrides.SP2A_DESC = s.label ?? '';
    }
    if (s.type === 'conference_medina') {
      if (s.name != null && s.name !== '') sponsorOverrides.SP2B = s.name;
      sponsorOverrides.SP2B_LOGO = s.logo_url || null;
      sponsorOverrides.SP2B_DESC = s.label ?? '';
    }
  });

  const contentBlocksMap = {};
  (content_blocks || []).filter(b => !b.season_id).forEach(b => { contentBlocksMap[b.key] = b.value; });
  (content_blocks || []).filter(b => b.season_id === season?.id).forEach(b => { contentBlocksMap[b.key] = b.value; });

  // mediaSlots: { [week]: { [slot_key]: { title, url } } }
  const mediaSlots = {};
  (media_slots || []).forEach(ms => {
    if (!mediaSlots[ms.week]) mediaSlots[ms.week] = {};
    mediaSlots[ms.week][ms.slot_key] = { title: ms.title || null, url: ms.url || null };
  });

  // draftBank: players not in rosters for this season's teams
  const seasonTeamIds = new Set((rawTeams || []).map(t => t.id));
  const draftBank = (players || []).filter(p =>
    !(rosters || []).some(r => r.player_id === p.id && seasonTeamIds.has(r.team_id))
  ).map(p => ({ id: p.id, name: p.name, jersey_number: p.jersey_number }));

  // draftTeamOrder: from content_blocks or derive from teams sort_order; filter to valid IDs
  let draftTeamOrder = [];
  try {
    const raw = contentBlocksMap.draft_team_order;
    if (raw && typeof raw === 'string') {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        draftTeamOrder = parsed.filter(id => seasonTeamIds.has(id));
      }
    }
  } catch (_) {}
  if (draftTeamOrder.length === 0) {
    draftTeamOrder = (rawTeams || []).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).map(t => t.id);
  }

  /** Parsed from content_blocks.schedule_week_labels JSON; keys are week numbers as strings */
  let scheduleWeekLabels = {};
  try {
    const raw = contentBlocksMap.schedule_week_labels;
    if (raw && typeof raw === 'string') {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) scheduleWeekLabels = parsed;
    }
  } catch (_) {}

  return {
    season,
    teams,
    scores,
    awards: awardsTransformed,
    stats,
    gameStatValues,
    statDefinitions,
    sponsorOverrides,
    sponsors: sponsors || [],
    mediaItems: media_items || [],
    mediaSlots,
    contentBlocks: contentBlocksMap,
    draftBank,
    draftTeamOrder,
    scheduleWeekLabels,
  };
}

export async function fetchSeasons() {
  const { data, error } = await getSeasons(supabase);
  if (error) return { data: null, error };
  return { data: data || [], error: null };
}

export async function fetchSeasonData(slug) {
  const { data: raw, error } = await getSeasonData(supabase, slug);
  if (error || !raw) return { data: null, error: error || new Error('Season not found') };
  return { data: transformSeasonData(raw), error: null };
}

export function deriveWeeks(scores, season) {
  const played = (scores || []).filter(g => g.s1 !== '' && g.s2 !== '');
  const latestPlayed = played.length ? Math.max(...played.map(g => g.week)) : 1;
  const maxGameWeek = (scores || []).length ? Math.max(...scores.map(g => g.week)) : 0;
  const derived = Math.max(8, maxGameWeek);
  const totalWeeks = (season?.total_weeks != null && season.total_weeks > 0) ? season.total_weeks : derived;
  return { TOTAL_WEEKS: totalWeeks, CURRENT_WEEK: latestPlayed || 1 };
}

export function applySponsorOverrides(overrides) {
  if (!overrides) return;
  if (overrides.SP1 != null) config.SP1 = overrides.SP1;
  if (overrides.SP1_LOGO !== undefined) config.SP1_LOGO = overrides.SP1_LOGO;
  if (overrides.SP1_DESC !== undefined) config.SP1_DESC = overrides.SP1_DESC;
  if (overrides.SP2A != null) config.SP2A = overrides.SP2A;
  if (overrides.SP2A_LOGO !== undefined) config.SP2A_LOGO = overrides.SP2A_LOGO;
  if (overrides.SP2A_DESC !== undefined) config.SP2A_DESC = overrides.SP2A_DESC;
  if (overrides.SP2B != null) config.SP2B = overrides.SP2B;
  if (overrides.SP2B_LOGO !== undefined) config.SP2B_LOGO = overrides.SP2B_LOGO;
  if (overrides.SP2B_DESC !== undefined) config.SP2B_DESC = overrides.SP2B_DESC;
}
