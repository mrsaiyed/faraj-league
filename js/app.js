/**
 * Faraj League app — orchestration, event wiring, init.
 */

import { config } from './config.js';
import { fetchSeasons, fetchSeasonData, deriveWeeks, applySponsorOverrides } from './data.js';
import {
  renderAll,
  renderScores,
  renderAwards,
  renderMedia,
  toggleRoster,
  closeRoster,
  toggleAcc,
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
  const { season, teams, scores, awards, stats, sponsorOverrides } = dataRes.data;
  config.DB = { teams, scores, awards, stats };
  applySponsorOverrides(sponsorOverrides);
  const { TOTAL_WEEKS: tw, CURRENT_WEEK: cw } = deriveWeeks(scores);
  config.TOTAL_WEEKS = tw;
  config.CURRENT_WEEK = cw;
  config.currentSeasonLabel = season?.label || 'Spring 2026';
  config.currentSeasonIsCurrent = season?.is_current ?? true;
  config.currentSeasonSlug = season?.slug || val;
  const sa = awards?.find(a => a.champ);
  const showHistoric = !config.currentSeasonIsCurrent || (sa && sa.champ);
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
    config.DB = { teams: [...config.DEFAULT_TEAMS], scores: [], awards: [], stats: [] };
    showError('Could not load seasons. Please refresh.');
    renderAll();
    return;
  }
  const seasons = seasonsRes.data || [];
  const defaultSlug = seasons.find(s => s.is_current)?.slug || seasons[0]?.slug;
  if (!defaultSlug) {
    config.DB = { teams: [...config.DEFAULT_TEAMS], scores: [], awards: [], stats: [] };
    showError('Could not load seasons. Please refresh.');
    renderAll();
    return;
  }

  const dataRes = await fetchSeasonData(defaultSlug);
  if (dataRes.error) {
    console.warn('fetchSeasonData failed', dataRes.error);
    config.DB = { teams: [...config.DEFAULT_TEAMS], scores: [], awards: [], stats: [] };
    showError('Could not load season data. Please refresh.');
    populateSeasonDropdown(seasons, defaultSlug);
    renderAll();
    return;
  }

  const { season, teams, scores, awards, stats, sponsorOverrides } = dataRes.data;
  config.DB = { teams, scores, awards, stats };
  applySponsorOverrides(sponsorOverrides);
  const { TOTAL_WEEKS: tw, CURRENT_WEEK: cw } = deriveWeeks(scores);
  config.TOTAL_WEEKS = tw;
  config.CURRENT_WEEK = cw;
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
window.goToTeam = goToTeam;
window.toggleAcc = toggleAcc;
window.renderScores = renderScores;
window.renderAwards = renderAwards;
window.renderMedia = renderMedia;

loadAll();
