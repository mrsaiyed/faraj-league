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
  renderPowerRankings,
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
  document.querySelectorAll('.nav-season-select').forEach(sel => {
    sel.innerHTML = '';
    (seasons || []).forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.slug;
      opt.textContent = s.label + (s.is_current ? ' · Current' : '');
      sel.appendChild(opt);
    });
    sel.value = defaultSlug || (seasons?.[0]?.slug);
  });
}

function showPage(id, skipPush = false) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
  const pageEl = document.getElementById('page-' + id);
  if (!pageEl) { showPage('home', skipPush); return; }
  pageEl.classList.add('active');
  document.querySelectorAll('.nav-tab').forEach(b => {
    if (b.textContent.toLowerCase().trim() === id.toLowerCase()) b.classList.add('active');
  });
  window.scrollTo(0, 0);
  if (!skipPush) history.pushState({ page: id }, '', '#' + id);
}

window.addEventListener('popstate', e => {
  const id = (e.state && e.state.page) || location.hash.slice(1) || 'home';
  showPage(id, true);
});

function goToTeam(id) {
  showPage('teams');
  setTimeout(() => toggleRoster(id), 80);
}

function navToMatchup(week) {
  showPage('schedule');
  requestAnimationFrame(() => {
    const el = document.querySelector(`#page-schedule [data-week="${week}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

// Delegated click: home matchup cards → schedule tab at that week
document.addEventListener('click', e => {
  if (!e.target.closest('#home-matchups')) return;
  if (e.target.closest('.schedule-expand-btn')) return;
  const card = e.target.closest('.matchup-card');
  if (card && card.dataset.week) navToMatchup(parseInt(card.dataset.week));
});

// Delegated click: home award cards → awards tab
document.addEventListener('click', e => {
  if (e.target.closest('#home-awards')) showPage('awards');
});

async function changeSeason(val) {
  if (!val || val === config.currentSeasonSlug) return;
  clearError();
  const dataRes = await fetchSeasonData(val);
  if (dataRes.error) {
    showError('Could not load season data. Please refresh.');
    return;
  }
  const { season, teams, scores, awards, stats, gameStatValues, statDefinitions, sponsorOverrides, mediaItems, mediaSlots, contentBlocks, draftBank, draftTeamOrder, scheduleWeekLabels } = dataRes.data;
  config.DB = { teams, scores, awards, stats, gameStatValues: gameStatValues || {}, statDefinitions: statDefinitions || [], mediaItems: mediaItems || [], mediaSlots: mediaSlots || {}, contentBlocks: contentBlocks || {}, draftBank: draftBank || [], draftTeamOrder: draftTeamOrder || [], scheduleWeekLabels: scheduleWeekLabels || {} };
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
    config.DB = { teams: [...config.DEFAULT_TEAMS], scores: [], awards: [], stats: [], gameStatValues: {}, statDefinitions: [], mediaItems: [], mediaSlots: {}, contentBlocks: {}, draftBank: [], draftTeamOrder: [], scheduleWeekLabels: {} };
    showError('Could not load seasons. Please refresh.');
    renderAll();
    return;
  }
  const seasons = seasonsRes.data || [];
  const defaultSlug = seasons.find(s => s.is_current)?.slug || seasons[0]?.slug;
  if (!defaultSlug) {
    config.DB = { teams: [...config.DEFAULT_TEAMS], scores: [], awards: [], stats: [], gameStatValues: {}, statDefinitions: [], mediaItems: [], mediaSlots: {}, contentBlocks: {}, draftBank: [], draftTeamOrder: [], scheduleWeekLabels: {} };
    showError('Could not load seasons. Please refresh.');
    renderAll();
    return;
  }

  const dataRes = await fetchSeasonData(defaultSlug);
  if (dataRes.error) {
    console.warn('fetchSeasonData failed', dataRes.error);
    config.DB = { teams: [...config.DEFAULT_TEAMS], scores: [], awards: [], stats: [], gameStatValues: {}, statDefinitions: [], mediaItems: [], mediaSlots: {}, contentBlocks: {}, draftBank: [], draftTeamOrder: [], scheduleWeekLabels: {} };
    showError('Could not load season data. Please refresh.');
    populateSeasonDropdown(seasons, defaultSlug);
    renderAll();
    return;
  }

  const { season, teams, scores, awards, stats, gameStatValues, statDefinitions, sponsorOverrides, mediaItems, mediaSlots, contentBlocks, draftBank, draftTeamOrder, scheduleWeekLabels } = dataRes.data;
  config.DB = { teams, scores, awards, stats, gameStatValues: gameStatValues || {}, statDefinitions: statDefinitions || [], mediaItems: mediaItems || [], mediaSlots: mediaSlots || {}, contentBlocks: contentBlocks || {}, draftBank: draftBank || [], draftTeamOrder: draftTeamOrder || [], scheduleWeekLabels: scheduleWeekLabels || {} };
  applySponsorOverrides(sponsorOverrides);
  const derived = deriveWeeks(scores);
  config.TOTAL_WEEKS = derived.TOTAL_WEEKS;
  config.CURRENT_WEEK = (season?.current_week != null ? season.current_week : derived.CURRENT_WEEK);
  config.currentSeasonLabel = season?.label || 'Spring 2026';
  config.currentSeasonIsCurrent = season?.is_current ?? true;
  config.currentSeasonSlug = season?.slug || defaultSlug;

  populateSeasonDropdown(seasons, defaultSlug);
  renderAll();
  const initialPage = location.hash.slice(1).replace(/[^a-z-]/g, '') || 'home';
  showPage(initialPage, true);
}

window.showPage = showPage;
window.changeSeason = changeSeason;
window.toggleRoster = toggleRoster;
window.closeRoster = closeRoster;
window.closeBoxScoreFullscreen = closeBoxScoreFullscreen;
window.goToTeam = goToTeam;
window.navToMatchup = navToMatchup;
window.toggleAcc = toggleAcc;
window.renderSchedule = renderSchedule;
window.renderScores = renderScores;
window.renderAwards = renderAwards;
window.renderMedia = renderMedia;
window.renderPowerRankings = renderPowerRankings;

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

// Mobile nav drawer
function initNavDrawer() {
  const hamburger = document.getElementById('nav-hamburger');
  const drawer = document.getElementById('nav-drawer');
  const overlay = document.getElementById('nav-drawer-overlay');
  const closeBtn = document.getElementById('nav-drawer-close');
  if (!hamburger || !drawer || !overlay) return;

  function openDrawer() {
    drawer.classList.add('open');
    overlay.classList.add('open');
    hamburger.setAttribute('aria-expanded', 'true');
    drawer.setAttribute('aria-hidden', 'false');
  }
  function closeDrawer() {
    drawer.classList.remove('open');
    overlay.classList.remove('open');
    hamburger.setAttribute('aria-expanded', 'false');
    drawer.setAttribute('aria-hidden', 'true');
  }

  hamburger.addEventListener('click', openDrawer);
  overlay.addEventListener('click', closeDrawer);
  if (closeBtn) closeBtn.addEventListener('click', closeDrawer);

  // Close drawer and sync active state when a drawer item is tapped
  drawer.querySelectorAll('.nav-drawer-item').forEach(item => {
    item.addEventListener('click', () => setTimeout(closeDrawer, 80));
  });
}

// Keep drawer active item in sync with current page
const _origShowPage = window.showPage;
window.showPage = function(id, skipPush) {
  _origShowPage(id, skipPush);
  document.querySelectorAll('.nav-drawer-item').forEach(el => {
    el.classList.toggle('active', el.getAttribute('href') === '#' + id);
  });
};

initNavDrawer();
initBoxScoreFullscreen();
loadAll();
