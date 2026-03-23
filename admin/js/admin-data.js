/**
 * Admin data loader — fetches season data and hydrates config for mirror sections.
 */

import { fetchSeasonData, deriveWeeks, applySponsorOverrides } from '../js/data.js';
import { config } from '../js/config.js';

/**
 * Load season data by slug and assign to config. Returns transformed data or null on error.
 * @param {string} slug - Season slug (e.g. from window.adminSeasonSlug)
 * @returns {Promise<object|null>} Transformed data or null
 */
export async function loadAdminSeasonData(slug) {
  if (!slug) return null;

  const dataRes = await fetchSeasonData(slug);
  if (dataRes.error || !dataRes.data) return null;

  const { season, teams, scores, awards, stats, gameStatValues, statDefinitions, sponsorOverrides, mediaItems, mediaSlots, contentBlocks } = dataRes.data;

  config.DB = {
    teams,
    scores,
    awards,
    stats,
    gameStatValues: gameStatValues || {},
    statDefinitions: statDefinitions || [],
    mediaItems: mediaItems || [],
    mediaSlots: mediaSlots || {},
    contentBlocks: contentBlocks || {},
  };

  applySponsorOverrides(sponsorOverrides);

  const derived = deriveWeeks(scores);
  config.TOTAL_WEEKS = derived.TOTAL_WEEKS;
  config.CURRENT_WEEK = season?.current_week != null ? season.current_week : derived.CURRENT_WEEK;
  config.currentSeasonLabel = season?.label || 'Spring 2026';
  config.currentSeasonSlug = season?.slug || slug;
  config.currentSeasonIsCurrent = season?.is_current ?? true;

  const sa = awards?.find(a => a.champ);
  const isPlaceholder = (v) => !v || /^—\s*$|^season in progress$/i.test(String(v).trim()) || /—\s*in progress$/i.test(String(v).trim());
  const isSeasonComplete = (a) => a && !isPlaceholder(a.champ);
  const showHistoric = !config.currentSeasonIsCurrent || isSeasonComplete(sa);
  const hb = document.getElementById('historic-banner');
  if (hb) {
    hb.style.display = showHistoric ? 'block' : 'none';
    if (showHistoric && sa) {
      const hbChamp = document.getElementById('hb-champ');
      const hbMvp = document.getElementById('hb-mvp');
      const hbScoring = document.getElementById('hb-scoring');
      if (hbChamp) hbChamp.textContent = sa.champ || '—';
      if (hbMvp) hbMvp.textContent = sa.mvp || '—';
      if (hbScoring) hbScoring.textContent = sa.scoring || '—';
    }
  }

  return dataRes.data;
}
