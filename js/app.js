/**
 * Faraj League app — orchestration, event wiring, init.
 */

import { config } from './config.js';
import { fetchSeasons, fetchSeasonData, deriveWeeks, applySponsorOverrides } from './data.js';
import {
  renderAll,
  renderSchedule,
  renderScores,
  renderAwards,
  renderMedia,
  toggleRoster,
  closeRoster,
  toggleAcc,
  closeBoxScoreFullscreen,
} from './render.js';

function showError(msg) {
  const el = document.getElementById('api-error-banner');
  if (el) { el.style.display = 'block'; document.getElementById('api-error-message').textContent = msg; }
}

function clearError() {
  const el = document.getElementById('api-error-banner');
  if (el) el.style.display = 'none';
}

function populateSeasonDropdown(seasons, defaultSlug) {
  const sel = document.querySelector('.nav-season-select');
  if (!sel) return;
  sel.innerHTML = '';
  (seasons || []).forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.slug;
    opt.textContent = s.label + (s.is_current ? ' · Current' : '');
    sel.appendChild(opt);
  });
  sel.value = defaultSlug || (seasons?.[0]?.slug);
}

function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  document.querySelectorAll('.nav-tab').forEach(b => {
    if (b.textContent.toLowerCase().trim() === id.toLowerCase()) b.classList.add('active');
  });
  window.scrollTo(0, 0);
}

function goToTeam(id) {
  showPage('teams');
  setTimeout(() => toggleRoster(id), 80);
}

async function changeSeason(val) {
  if (!val || val === config.currentSeasonSlug) return;
  clearError();
  const dataRes = await fetchSeasonData(val);
  if (dataRes.error) {
    showError('Could not load season data. Please refresh.');
    return;
  }
  const { season, teams, scores, awards, stats, gameStatValues, statDefinitions, sponsorOverrides, mediaItems, mediaSlots, contentBlocks, draftBank, draftTeamOrder } = dataRes.data;
  config.DB = { teams, scores, awards, stats, gameStatValues: gameStatValues || {}, statDefinitions: statDefinitions || [], mediaItems: mediaItems || [], mediaSlots: mediaSlots || {}, contentBlocks: contentBlocks || {}, draftBank: draftBank || [], draftTeamOrder: draftTeamOrder || [] };
  applySponsorOverrides(sponsorOverrides);
  const derived = deriveWeeks(scores);
  config.TOTAL_WEEKS = derived.TOTAL_WEEKS;
  config.CURRENT_WEEK = (season?.current_week != null ? season.current_week : derived.CURRENT_WEEK);
  config.currentSeasonLabel = season?.label || 'Spring 2026';
  config.currentSeasonIsCurrent = season?.is_current ?? true;
  config.currentSeasonSlug = season?.slug || val;
  const sa = awards?.find(a => a.champ);
  const isPlaceholder = (v) => !v || /^—\s*$|^season in progress$/i.test(String(v).trim()) || /—\s*in progress$/i.test(String(v).trim());
  const isSeasonComplete = (a) => a && !isPlaceholder(a.champ);
  const showHistoric = !config.currentSeasonIsCurrent || isSeasonComplete(sa);
  const hb = document.getElementById('historic-banner');
  if (hb) hb.style.display = showHistoric ? 'block' : 'none';
  if (showHistoric && sa) {
    document.getElementById('hb-champ').textContent = sa.champ || '—';
    document.getElementById('hb-mvp').textContent = sa.mvp || '—';
    document.getElementById('hb-scoring').textContent = sa.scoring || '—';
  }
  renderAll();
}

async function loadAll() {
  clearError();
  const seasonsRes = await fetchSeasons();
  if (seasonsRes.error) {
    console.warn('fetchSeasons failed', seasonsRes.error);
    config.DB = { teams: [...config.DEFAULT_TEAMS], scores: [], awards: [], stats: [], gameStatValues: {}, statDefinitions: [], mediaItems: [], mediaSlots: {}, contentBlocks: {}, draftBank: [], draftTeamOrder: [] };
    showError('Could not load seasons. Please refresh.');
    renderAll();
    return;
  }
  const seasons = seasonsRes.data || [];
  const defaultSlug = seasons.find(s => s.is_current)?.slug || seasons[0]?.slug;
  if (!defaultSlug) {
    config.DB = { teams: [...config.DEFAULT_TEAMS], scores: [], awards: [], stats: [], gameStatValues: {}, statDefinitions: [], mediaItems: [], mediaSlots: {}, contentBlocks: {}, draftBank: [], draftTeamOrder: [] };
    showError('Could not load seasons. Please refresh.');
    renderAll();
    return;
  }

  const dataRes = await fetchSeasonData(defaultSlug);
  if (dataRes.error) {
    console.warn('fetchSeasonData failed', dataRes.error);
    config.DB = { teams: [...config.DEFAULT_TEAMS], scores: [], awards: [], stats: [], gameStatValues: {}, statDefinitions: [], mediaItems: [], mediaSlots: {}, contentBlocks: {}, draftBank: [], draftTeamOrder: [] };
    showError('Could not load season data. Please refresh.');
    populateSeasonDropdown(seasons, defaultSlug);
    renderAll();
    return;
  }

  const { season, teams, scores, awards, stats, gameStatValues, statDefinitions, sponsorOverrides, mediaItems, mediaSlots, contentBlocks, draftBank, draftTeamOrder } = dataRes.data;
  config.DB = { teams, scores, awards, stats, gameStatValues: gameStatValues || {}, statDefinitions: statDefinitions || [], mediaItems: mediaItems || [], mediaSlots: mediaSlots || {}, contentBlocks: contentBlocks || {}, draftBank: draftBank || [], draftTeamOrder: draftTeamOrder || [] };
  applySponsorOverrides(sponsorOverrides);
  const derived = deriveWeeks(scores);
  config.TOTAL_WEEKS = derived.TOTAL_WEEKS;
  config.CURRENT_WEEK = (season?.current_week != null ? season.current_week : derived.CURRENT_WEEK);
  config.currentSeasonLabel = season?.label || 'Spring 2026';
  config.currentSeasonIsCurrent = season?.is_current ?? true;
  config.currentSeasonSlug = season?.slug || defaultSlug;

  populateSeasonDropdown(seasons, defaultSlug);
  renderAll();
}

window.showPage = showPage;
window.changeSeason = changeSeason;
window.toggleRoster = toggleRoster;
window.closeRoster = closeRoster;
window.closeBoxScoreFullscreen = closeBoxScoreFullscreen;
window.goToTeam = goToTeam;
window.toggleAcc = toggleAcc;
window.renderSchedule = renderSchedule;
window.renderScores = renderScores;
window.renderAwards = renderAwards;
window.renderMedia = renderMedia;

// Box score fullscreen: close on drag-hint click, Escape, swipe-down
function initBoxScoreFullscreen() {
  const overlay = document.getElementById('box-score-fullscreen');
  const dragHint = document.getElementById('box-score-drag-hint');
  if (!overlay || !dragHint) return;
  dragHint.onclick = closeBoxScoreFullscreen;
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.style.display === 'flex') closeBoxScoreFullscreen();
  });
  let touchStartY = 0;
  overlay.addEventListener('touchstart', (e) => { touchStartY = e.touches[0].clientY; }, { passive: true });
  overlay.addEventListener('touchmove', (e) => {
    if (overlay.scrollTop <= 0 && e.touches[0].clientY - touchStartY > 50) {
      closeBoxScoreFullscreen();
    }
  }, { passive: true });
  overlay.addEventListener('wheel', (e) => {
    if (overlay.scrollTop <= 0 && e.deltaY > 0) {
      e.preventDefault();
      closeBoxScoreFullscreen();
    }
  }, { passive: false });
}

initBoxScoreFullscreen();
loadAll();
