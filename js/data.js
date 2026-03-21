/**
 * Faraj League data layer — API fetch and transform.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js';
import { getSeasons, getSeasonData } from '../lib/api.js';
import { config } from './config.js';

const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);

function transformSeasonData(raw) {
  const { season, teams: rawTeams, players, rosters, games, awards, stat_definitions, player_stat_values, sponsors } = raw;
  const teamMap = {};
  (rawTeams || []).forEach(t => { teamMap[t.id] = t; });
  const playerMap = {};
  (players || []).forEach(p => { playerMap[p.id] = p; });

  const teams = (rawTeams || []).map(t => {
    const rosterPlayers = (rosters || []).filter(r => r.team_id === t.id)
      .map(r => playerMap[r.player_id]?.name).filter(Boolean);
    rosterPlayers.sort((a, b) => {
      const pa = players?.find(p => p.name === a), pb = players?.find(p => p.name === b);
      return (pa?.jersey_number || 0) - (pb?.jersey_number || 0);
    });
    return { id: t.id, name: t.name, conf: t.conference || t.conf, captain: t.captain || '', players: rosterPlayers };
  });

  const scores = (games || []).map(g => ({
    week: g.week,
    game: g.game_index,
    t1: teamMap[g.home_team_id]?.name || '',
    s1: g.home_score != null ? String(g.home_score) : '',
    t2: teamMap[g.away_team_id]?.name || '',
    s2: g.away_score != null ? String(g.away_score) : '',
  }));

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

  const pointsDef = (stat_definitions || []).find(s => s.slug === 'points');
  const stats = [];
  if (pointsDef) {
    const psvByPlayer = {};
    (player_stat_values || []).filter(psv => psv.stat_definition_id === pointsDef.id).forEach(psv => {
      psvByPlayer[psv.player_id] = (psvByPlayer[psv.player_id] || 0) + Number(psv.value || 0);
    });
    const rosterToTeam = {};
    (rosters || []).forEach(r => { rosterToTeam[r.player_id] = teamMap[r.team_id]?.name || ''; });
    Object.entries(psvByPlayer).forEach(([pid, total]) => {
      const p = playerMap[pid];
      if (p) stats.push({ name: p.name, team: rosterToTeam[pid] || '', gp: 0, total });
    });
  }

  const sponsorOverrides = {};
  (sponsors || []).forEach(s => {
    if (s.name != null && s.name !== '') {
      if (s.type === 'title') { sponsorOverrides.SP1 = s.name; sponsorOverrides.SP1_LOGO = s.logo_url || null; }
      if (s.type === 'conference_mecca') sponsorOverrides.SP2A = s.name;
      if (s.type === 'conference_medina') sponsorOverrides.SP2B = s.name;
    }
  });

  return { season, teams, scores, awards: awardsTransformed, stats, sponsorOverrides };
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

export function deriveWeeks(scores) {
  if (!scores?.length) return { TOTAL_WEEKS: 8, CURRENT_WEEK: 1 };
  const maxWeek = Math.max(...scores.map(g => g.week));
  const played = scores.filter(g => g.s1 !== '' && g.s2 !== '');
  const latestPlayed = played.length ? Math.max(...played.map(g => g.week)) : 1;
  return { TOTAL_WEEKS: Math.max(8, maxWeek), CURRENT_WEEK: latestPlayed || 1 };
}

export function applySponsorOverrides(overrides) {
  if (!overrides) return;
  if (overrides.SP1 != null) config.SP1 = overrides.SP1;
  if (overrides.SP1_LOGO !== undefined) config.SP1_LOGO = overrides.SP1_LOGO;
  if (overrides.SP2A != null) config.SP2A = overrides.SP2A;
  if (overrides.SP2B != null) config.SP2B = overrides.SP2B;
}
