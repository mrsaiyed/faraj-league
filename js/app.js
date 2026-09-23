/**
 * Faraj League app — orchestration, event wiring, init.
 */

import { config } from './config.js';
import { fetchSeasons, fetchSeasonData, fetchGameScores, deriveWeeks, applySponsorOverrides } from './data.js';
import { sortSeasons, activeSeasonSlug } from '../lib/seasons.js';
import { liveFingerprint, scoresFingerprint, shouldRepaint, SCORE_POLL_MS, FULL_POLL_MS } from '../lib/live-sync.js';
import { statusLine, isInProgress } from '../lib/game-clock.js';
import {
  renderAll,
  renderSchedule,
  renderScores,
  renderAwards,
  renderMedia,
  renderPowerRankings,
  renderStats,
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

/**
 * Fill every season picker: the active season first, past seasons grouped below it.
 * @param {Array<object>} seasons - rows from the seasons table
 * @param {string} defaultSlug - slug to preselect
 */
function populateSeasonDropdown(seasons, defaultSlug) {
  const ordered = sortSeasons(seasons);
  const current = ordered.filter(s => s.is_current);
  const past = ordered.filter(s => !s.is_current);
  const makeOption = (s) => {
    const opt = document.createElement('option');
    opt.value = s.slug;
    opt.textContent = s.label + (s.is_current ? ' · Current' : '');
    return opt;
  };
  document.querySelectorAll('.nav-season-select').forEach(sel => {
    sel.innerHTML = '';
    // Only group once there is something to contrast the active season with.
    if (current.length && past.length) {
      const curGroup = document.createElement('optgroup');
      curGroup.label = 'Current Season';
      current.forEach(s => curGroup.appendChild(makeOption(s)));
      sel.appendChild(curGroup);
      const pastGroup = document.createElement('optgroup');
      pastGroup.label = 'Past Seasons';
      past.forEach(s => pastGroup.appendChild(makeOption(s)));
      sel.appendChild(pastGroup);
    } else {
      ordered.forEach(s => sel.appendChild(makeOption(s)));
    }
    sel.value = defaultSlug || ordered[0]?.slug || '';
  });
}

function showPage(id, skipPush = false) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
  const pageEl = document.getElementById('page-' + id);
  if (!pageEl) { showPage('home', skipPush); return; }
  pageEl.classList.add('active');
  document.querySelectorAll('.nav-tab').forEach(b => {
    if (b.getAttribute('href') === '#' + id) b.classList.add('active');
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

// Delegated click: schedule team names → team page
document.addEventListener('click', e => {
  const nameEl = e.target.closest('.mc-team-name[data-team-id]');
  if (!nameEl || !nameEl.closest('#page-schedule')) return;
  e.stopPropagation();
  goToTeam(nameEl.dataset.teamId);
});

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

/**
 * Push a `fetchSeasonData` result into `config.DB` and the derived runtime
 * state. Shared by the initial load, the season picker and the live poll so
 * they cannot drift apart.
 */
function applySeasonData(data, slug) {
  const { season, teams, scores, awards, stats, gameStatValues, statDefinitions, sponsorOverrides,
    mediaItems, mediaSlots, contentBlocks, draftBank, draftTeamOrder, scheduleWeekLabels,
    playoffWeeks, totalRegGames } = data;
  config.DB = {
    teams, scores, awards, stats,
    gameStatValues: gameStatValues || {},
    statDefinitions: statDefinitions || [],
    mediaItems: mediaItems || [],
    mediaSlots: mediaSlots || {},
    contentBlocks: contentBlocks || {},
    draftBank: draftBank || [],
    draftTeamOrder: draftTeamOrder || [],
    scheduleWeekLabels: scheduleWeekLabels || {},
    playoffWeeks: playoffWeeks || {},
    totalRegGames: totalRegGames || 0,
  };
  applySponsorOverrides(sponsorOverrides);
  const derived = deriveWeeks(scores, season);
  config.TOTAL_WEEKS = derived.TOTAL_WEEKS;
  config.CURRENT_WEEK = (season?.current_week != null ? season.current_week : derived.CURRENT_WEEK);
  config.currentSeasonLabel = season?.label || 'Spring 2026';
  config.currentSeasonIsCurrent = season?.is_current ?? true;
  config.currentSeasonSlug = season?.slug || slug;
  config.currentSeasonId = season?.id || null;
}

// ---- Live refresh -------------------------------------------------------
// Stats are written by the admin tracker while a game is being played, so the
// page re-reads the season on a timer and repaints only when something moved.
let liveSignature = '';
let scoreSignature = '';
let scoreTimer = null;
let fullTimer = null;
let clockTimer = null;
let polling = false;

/** True while the visitor has something open that a repaint would disturb. */
function pageIsBusy() {
  const overlay = document.getElementById('box-score-fullscreen');
  if (overlay && overlay.style.display === 'flex') return true;
  if (document.getElementById('nav-drawer')?.classList.contains('open')) return true;
  return false;
}

/** Re-read the whole season and repaint if anything a visitor sees has moved. */
async function refreshSeason() {
  const slug = config.currentSeasonSlug;
  if (!slug || polling) return;
  polling = true;
  try {
    const res = await fetchSeasonData(slug);
    if (res.error || !res.data) return;
    // The visitor may have switched seasons while this was in flight.
    if (config.currentSeasonSlug !== slug) return;

    const next = liveFingerprint(res.data);
    if (!shouldRepaint({ previous: liveSignature, next, busy: pageIsBusy() })) {
      if (liveSignature === '') liveSignature = next;
      return;
    }
    liveSignature = next;
    applySeasonData(res.data, slug);
    scoreSignature = scoresFingerprint(res.data.scores);
    renderAll();
    tickLiveClocks();
  } finally {
    polling = false;
  }
}

/**
 * Cheap probe: one small query for this season's scores. Only when it moves is
 * the full season re-read. Lets scores appear within seconds without running a
 * dozen queries every few seconds.
 */
async function probeScores() {
  if (document.hidden || polling) return;
  const seasonId = config.currentSeasonId;
  if (!seasonId) return;
  const res = await fetchGameScores(seasonId);
  if (res.error || !res.data) return;

  const next = scoresFingerprint(res.data);
  if (next === scoreSignature) return;
  if (pageIsBusy()) return;   // picked up on the next probe
  scoreSignature = next;
  await refreshSeason();
}

/** Re-read everything on a slower beat, for changes the probe cannot see. */
async function fullRefresh() {
  if (document.hidden) return;
  await refreshSeason();
  scoreSignature = scoresFingerprint(config.DB.scores);
}

/**
 * Advance the clock on any live game, once a second.
 *
 * Purely local: each card's clock is extrapolated from the anchor the tracker
 * stored, so it ticks smoothly between polls instead of freezing until the
 * next one. No network, no re-render.
 */
function tickLiveClocks() {
  const nodes = document.querySelectorAll('[data-live-clock]');
  if (!nodes.length) return;
  const byId = {};
  (config.DB.scores || []).forEach(g => { if (g.gameId) byId[g.gameId] = g; });
  const now = Date.now();
  nodes.forEach(el => {
    const g = byId[el.dataset.liveClock];
    if (!g || !isInProgress(g)) return;
    const text = statusLine(g, now);
    if (text && el.textContent !== text) el.textContent = text;
  });
}

function startLiveRefresh() {
  clearInterval(scoreTimer);
  clearInterval(fullTimer);
  clearInterval(clockTimer);
  scoreTimer = setInterval(probeScores, SCORE_POLL_MS);
  fullTimer = setInterval(fullRefresh, FULL_POLL_MS);
  clockTimer = setInterval(tickLiveClocks, 1000);

  // Every way a phone comes back to this page. Mobile browsers suspend timers
  // in the background, and iOS restores from the back-forward cache without
  // firing visibilitychange — so pageshow matters as much as the other two.
  const wake = () => { if (!document.hidden) { tickLiveClocks(); probeScores(); } };
  document.addEventListener('visibilitychange', wake);
  window.addEventListener('focus', wake);
  window.addEventListener('pageshow', wake);
}

async function changeSeason(val) {
  if (!val || val === config.currentSeasonSlug) return;
  clearError();
  const dataRes = await fetchSeasonData(val);
  if (dataRes.error) {
    showError('Could not load season data. Please refresh.');
    return;
  }
  applySeasonData(dataRes.data, val);
  // New season, new baseline — otherwise the first poll sees a wholesale
  // "change" and repaints for no reason.
  liveSignature = liveFingerprint(dataRes.data);
  scoreSignature = scoresFingerprint(dataRes.data.scores);
  const { season, awards } = dataRes.data;
  // Keep the desktop nav picker and the mobile drawer picker in step.
  document.querySelectorAll('.nav-season-select').forEach(sel => { sel.value = config.currentSeasonSlug; });
  const sa = awards?.find(a => a.champ);
  const isPlaceholder = (v) => !v || /^—\s*$|^season in progress$/i.test(String(v).trim()) || /—\s*in progress$/i.test(String(v).trim());
  const isSeasonComplete = (a) => a && !isPlaceholder(a.champ);
  const showHistoric = !config.currentSeasonIsCurrent || isSeasonComplete(sa);
  const hb = document.getElementById('historic-banner');
  if (hb) hb.style.display = showHistoric ? 'block' : 'none';
  if (showHistoric) {
    // The banner only carries the champion on the public page; the other fields
    // are optional, so never assume they are in the DOM. Always rewrite so a
    // season with no champion recorded does not keep the previous one's.
    const setBanner = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || '—'; };
    setBanner('hb-champ', sa?.champ);
    setBanner('hb-mvp', sa?.mvp);
    setBanner('hb-scoring', sa?.scoring);
  }
  renderAll();
}

async function loadAll() {
  clearError();
  const initialPage = location.hash.slice(1).replace(/[^a-z-]/g, '') || 'home';
  showPage(initialPage, true);
  const seasonsRes = await fetchSeasons();
  if (seasonsRes.error) {
    console.warn('fetchSeasons failed', seasonsRes.error);
    config.DB = { teams: [...config.DEFAULT_TEAMS], scores: [], awards: [], stats: [], gameStatValues: {}, statDefinitions: [], mediaItems: [], mediaSlots: {}, contentBlocks: {}, draftBank: [], draftTeamOrder: [], scheduleWeekLabels: {}, playoffWeeks: {}, totalRegGames: 0 };
    showError('Could not load seasons. Please refresh.');
    renderAll();
    return;
  }
  const seasons = seasonsRes.data || [];
  const defaultSlug = activeSeasonSlug(seasons);
  if (!defaultSlug) {
    config.DB = { teams: [...config.DEFAULT_TEAMS], scores: [], awards: [], stats: [], gameStatValues: {}, statDefinitions: [], mediaItems: [], mediaSlots: {}, contentBlocks: {}, draftBank: [], draftTeamOrder: [], scheduleWeekLabels: {}, playoffWeeks: {}, totalRegGames: 0 };
    showError('Could not load seasons. Please refresh.');
    renderAll();
    return;
  }

  const dataRes = await fetchSeasonData(defaultSlug);
  if (dataRes.error) {
    console.warn('fetchSeasonData failed', dataRes.error);
    config.DB = { teams: [...config.DEFAULT_TEAMS], scores: [], awards: [], stats: [], gameStatValues: {}, statDefinitions: [], mediaItems: [], mediaSlots: {}, contentBlocks: {}, draftBank: [], draftTeamOrder: [], scheduleWeekLabels: {}, playoffWeeks: {}, totalRegGames: 0 };
    showError('Could not load season data. Please refresh.');
    populateSeasonDropdown(seasons, defaultSlug);
    renderAll();
    return;
  }

  applySeasonData(dataRes.data, defaultSlug);
  liveSignature = liveFingerprint(dataRes.data);
  // Seeded here, not on the first probe: a score that moves in between would
  // otherwise be swallowed as the baseline and never repaint.
  scoreSignature = scoresFingerprint(dataRes.data.scores);

  populateSeasonDropdown(seasons, defaultSlug);
  renderAll();
  startLiveRefresh();
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
window.renderStats = renderStats;

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
