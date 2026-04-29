/**
 * Faraj League render layer — DOM updates.
 */

import { config } from './config.js';
import { confLabel, confShortLabel, getConferences, getBasePath, motmLabel, akhlaqLabel, statsTitle, highlightSponsor } from './config.js';
import { calcStandings as calcStandingsPure, calcSeeds as calcSeedsPure } from '../lib/standings.js';

let activeTeam = null;

function escapeHtmlAttr(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function initials(n) { return n.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase(); }
function pending() { return `<span class="pending">Pending</span>`; }
function getWeeksPlayed() { return new Set(config.DB.scores.filter(g => g.s1 !== '' && g.s2 !== '').map(g => g.week)).size; }
// Returns the week to feature: current week if it has stats entered, otherwise previous week.
function getDisplayWeek() {
  if (!config.CURRENT_WEEK) return 1;
  const currentWeekGames = config.DB.scores.filter(g => g.week === config.CURRENT_WEEK);
  const hasStats = currentWeekGames.some(g => {
    const gsv = config.DB.gameStatValues?.[g.gameId];
    return gsv && Object.keys(gsv).length > 0;
  });
  return hasStats ? config.CURRENT_WEEK : Math.max(1, config.CURRENT_WEEK - 1);
}
// Standings use config.DB.scores (from games.home_score, away_score). Score derivation in
// admin-game-stats Edge Function updates games when stat sheet is saved; getSeasonData brings them in.
export function calcStandings() {
  return calcStandingsPure(config.DB.teams, config.DB.scores);
}
function buildWeekDropdown(elId, includeAll, maxWeek) {
  const max = maxWeek != null ? maxWeek : config.TOTAL_WEEKS;
  const el = document.getElementById(elId); if (!el) return; el.innerHTML = '';
  if (includeAll) el.innerHTML += `<option value="all">All Weeks</option>`;
  for (let w = 1; w <= max; w++) el.innerHTML += `<option value="${w}">Week ${w}${w === config.CURRENT_WEEK ? ' (Current)' : ''}</option>`;
}

function buildScoresWeekDropdown() {
  const el = document.getElementById('scores-week-select');
  if (!el) return;
  const playedWeeks = [...new Set(
    (config.DB.scores || []).filter(g => g.s1 !== '' && g.s2 !== '').map(g => g.week)
  )].sort((a, b) => a - b);
  el.innerHTML = '<option value="all">All Weeks</option>';
  playedWeeks.forEach(w => {
    el.innerHTML += `<option value="${w}">Week ${w}${w === config.CURRENT_WEEK ? ' (Current)' : ''}</option>`;
  });
}

function buildScheduleTeamFilter() {
  const el = document.getElementById('schedule-team-filter'); if (!el) return;
  el.innerHTML = '<option value="">All teams</option>';
  (config.DB.teams || []).forEach(t => { el.innerHTML += `<option value="${t.name}">${t.name}</option>`; });
}

export function renderAll(adminMode = false) {
  const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  const conferences = getConferences();
  conferences.forEach((c, i) => {
    const slug = String(c.id || c.name || '').toLowerCase().replace(/\W+/g, '_') || 'conf_' + i;
    const hdr = document.getElementById('conf-header-' + slug);
    if (hdr) hdr.innerHTML = confLabel(c.id || c.name);
  });
  if (conferences[0]) { const el = document.getElementById('about-mecca-label'); if (el) el.innerHTML = confLabel(conferences[0].id || conferences[0].name); }
  if (conferences[1]) { const el = document.getElementById('about-medina-label'); if (el) el.innerHTML = confLabel(conferences[1].id || conferences[1].name); }
  if (conferences[0]) set('sponsors-conf-label-mecca', confShortLabel(conferences[0].id || conferences[0].name));
  if (conferences[1]) set('sponsors-conf-label-medina', confShortLabel(conferences[1].id || conferences[1].name));
  { const el = document.getElementById('stats-page-title'); if (el) el.innerHTML = statsTitle(); }
  set('home-standings-title', 'Standings');
  set('home-standings-sub', config.currentSeasonLabel);
  set('standings-section-sub', config.currentSeasonLabel);
  const confIds = new Set(conferences.map(c => c.id || c.name));
  const confTeamCount = (config.DB.teams || []).filter(t => confIds.has(t.conf)).length;
  set('teams-section-sub', `${config.currentSeasonLabel} · ${confTeamCount || 6} Teams`);
  set('stats-section-sub', `${config.currentSeasonLabel} · Points Only`);
  set('draft-section-sub', config.currentSeasonLabel);
  set('sponsors-section-sub', config.currentSeasonLabel);
  set('schedule-section-sub', config.currentSeasonLabel);
  set('about-conf-title', `${config.currentSeasonLabel} Structure`);
  const heroBadge = document.getElementById('hero-badge');
  if (heroBadge) heroBadge.textContent = config.DB.contentBlocks?.hero_badge || `${config.currentSeasonLabel} · Inaugural Season`;
  const seasonTag = document.getElementById('season-tag');
  if (seasonTag) {
    if (config.DB.contentBlocks?.season_tag != null) {
      seasonTag.textContent = config.DB.contentBlocks.season_tag;
    } else {
      const confIds = new Set(conferences.map(c => c.id || c.name));
      const teamsCount = (config.DB.teams || []).filter(t => confIds.has(t.conf)).length || 6;
      const playersCount = (config.DB.teams || []).reduce((n, t) => n + (t.roster?.length || 0), 0) ?? 0;
      seasonTag.textContent = `${teamsCount} Teams · ${playersCount} Players · Ages 17–30`;
    }
  }

  const toAssetPath = (url) => {
    if (!url || url.startsWith('http')) return url;
    const path = url.startsWith('/') ? url : '/' + url.replace(/^\//, '');
    return getBasePath() + path;
  };
  const banner = document.getElementById('title-sponsor-banner');
  if (banner) {
    const titleName = config.SP1 && config.SP1 !== '[SPONSOR 1 NAME AND LOGO]' ? config.SP1 : 'Zabiha Family Ranch';
    const titleLogo = config.SP1_LOGO || 'images/zabiha-logo.png';
    const logoSrc = toAssetPath(titleLogo);
  banner.innerHTML = `<div class="title-sponsor-bar"><span class="title-sponsor-eyebrow">Presented by:</span><div class="title-sponsor-logo-wrap"><img src="${logoSrc.replace(/"/g, '&quot;')}" class="title-sponsor-logo" alt="${titleName.replace(/"/g, '&quot;')} logo"></div></div>`;
  }

  const blocks = config.DB.contentBlocks || {};
  const setLogo = (id, url, alt) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (url) el.innerHTML = `<img src="${toAssetPath(url).replace(/"/g, '&quot;')}" alt="${(alt || 'Sponsor').replace(/"/g, '&quot;')} logo">`;
    else el.innerHTML = '<span class="sponsor-logo-placeholder">Add logo</span>';
  };
  const setDesc = (id, text, fallback = '') => {
    const el = document.getElementById(id);
    if (el) el.textContent = text || fallback;
  };
  setLogo('sponsor-title-logo', config.SP1_LOGO || 'images/zabiha-logo.png', config.SP1 && config.SP1 !== '[SPONSOR 1 NAME AND LOGO]' ? config.SP1 : 'Zabiha Family Ranch');
  setDesc('sponsor-title-desc', config.SP1_DESC, '');
  setLogo('sponsor-mecca-logo', config.SP2A_LOGO || 'images/toyomotors-logo.png', config.SP2A && config.SP2A !== '[Sponsor 2A]' ? config.SP2A : 'TOYOMOTORS');
  setDesc('sponsor-mecca-desc', config.SP2A_DESC, '');
  setLogo('sponsor-medina-logo', config.SP2B_LOGO || 'images/wellness-logo.png', config.SP2B && config.SP2B !== '[Sponsor 2B]' ? config.SP2B : 'Xtreme Wellness');
  setDesc('sponsor-medina-desc', config.SP2B_DESC, '');
  const tierTitle = document.querySelector('.tier-title');
  const tierConf = document.querySelector('.tier-conf');
  const tierCommunity = document.querySelector('.tier-community');
  if (tierTitle) tierTitle.textContent = blocks.sponsor_tier_title || 'Title Sponsor';
  if (tierConf) tierConf.textContent = blocks.sponsor_tier_conf || 'Conference Sponsors';
  if (tierCommunity) tierCommunity.textContent = blocks.sponsor_tier_community || 'Community Partners';
  ['1', '2', '3'].forEach(i => {
    const logoUrl = blocks['sponsor_community_' + i + '_logo'] || '';
    const name = blocks['sponsor_community_' + i + '_name'] || ('Community Partner ' + i);
    setLogo('sponsor-community-' + i + '-logo', logoUrl, name);
    setDesc('sponsor-community-' + i + '-desc', blocks['sponsor_community_' + i + '_desc'], '');
  });

  const sa = config.DB.awards?.find(a => a.champ);
  const isPlaceholder = (v) => !v || /^—\s*$|^season in progress$/i.test(String(v).trim()) || /—\s*in progress$/i.test(String(v).trim());
  const isSeasonComplete = (a) => a && !isPlaceholder(a.champ);
  const showHistoric = !config.currentSeasonIsCurrent || isSeasonComplete(sa);
  const hb = document.getElementById('historic-banner');
  if (hb) hb.style.display = showHistoric ? 'block' : 'none';
  if (showHistoric && sa) {
    const hbChamp = document.getElementById('hb-champ');
    const hbMvp = document.getElementById('hb-mvp');
    const hbScoring = document.getElementById('hb-scoring');
    if (hbChamp) hbChamp.textContent = sa.champ || '—';
    if (hbMvp) hbMvp.textContent = sa.mvp || '—';
    if (hbScoring) hbScoring.textContent = sa.scoring || '—';
  }

  buildScoresWeekDropdown();
  buildWeekDropdown('awards-week-select', false);
  const awsel = document.getElementById('awards-week-select');
  if (awsel) awsel.value = String(config.CURRENT_WEEK);
  buildWeekDropdown('media-week-select', true);
  const mws = document.getElementById('media-week-select');
  if (mws) mws.value = String(config.CURRENT_WEEK);
  const sselBefore = document.getElementById('schedule-week-select');
  const prevScheduleWeekVal = sselBefore?.value;
  const prevScheduleWeek = (!prevScheduleWeekVal || prevScheduleWeekVal === 'all')
    ? 'all'
    : (parseInt(prevScheduleWeekVal, 10) >= 1 && parseInt(prevScheduleWeekVal, 10) <= config.TOTAL_WEEKS
      ? parseInt(prevScheduleWeekVal, 10) : 'all');
  const teamFilterBefore = document.getElementById('schedule-team-filter');
  const teamFilterVal = teamFilterBefore?.value || null;
  buildWeekDropdown('schedule-week-select', true);
  const ssel = document.getElementById('schedule-week-select');
  if (ssel) ssel.value = prevScheduleWeek === 'all' ? 'all' : String(Math.min(config.TOTAL_WEEKS, Math.max(1, prevScheduleWeek)));
  buildScheduleTeamFilter();
  const scheduleTeamFilter = document.getElementById('schedule-team-filter');
  if (scheduleTeamFilter && teamFilterVal) scheduleTeamFilter.value = teamFilterVal;
  renderHome();
  renderStandings();
  renderTeams();
  renderStats();
  renderAwards(config.CURRENT_WEEK);
  const scoresDisplayWeek = config.CURRENT_WEEK ? getDisplayWeek() : 1;
  const scoresEl = document.getElementById('scores-week-select');
  if (scoresEl) scoresEl.value = String(scoresDisplayWeek);
  renderScores(scoresDisplayWeek);
  const standingsSub = document.getElementById('standings-section-sub');
  if (standingsSub) standingsSub.textContent = `Week ${scoresDisplayWeek}`;
  const schedWeekVal = ssel?.value;
  const schedFocusWeek = (!schedWeekVal || schedWeekVal === 'all') ? 'all' : parseInt(schedWeekVal, 10);
  renderSchedule(schedFocusWeek, teamFilterVal || null);
  renderMedia(config.CURRENT_WEEK);
  // Power rankings: only current + past weeks in dropdown
  const prevPrWeekVal = document.getElementById('pr-week-select')?.value;
  buildWeekDropdown('pr-week-select', false, config.CURRENT_WEEK);
  const prSel = document.getElementById('pr-week-select');
  const gsvGameIds = new Set(Object.keys(config.DB.gameStatValues || {}));
  const weeksWithStats = (config.DB.scores || []).filter(g => gsvGameIds.has(g.gameId)).map(g => g.week);
  const defaultPrWeek = weeksWithStats.length > 0 ? Math.max(...weeksWithStats) : Math.max(1, config.CURRENT_WEEK - 1);
  if (prSel) {
    const restoredPr = prevPrWeekVal && parseInt(prevPrWeekVal) >= 1 && parseInt(prevPrWeekVal) <= config.CURRENT_WEEK
      ? prevPrWeekVal : String(defaultPrWeek);
    prSel.value = restoredPr;
  }
  renderPowerRankings(parseInt(prSel?.value || defaultPrWeek));
  set('pr-section-sub', config.currentSeasonLabel);
  renderAbout();
  renderDraft(adminMode);
}

export function renderHome() {
  const wp = getWeeksPlayed();
  const weeksPlayedEl = document.getElementById('weeks-played');
  if (weeksPlayedEl) weeksPlayedEl.textContent = wp;
  // Week 0 = show week 1 as upcoming; show current week if stats exist, otherwise fall back to previous week
  const upcoming = config.CURRENT_WEEK === 0;
  const displayWeek = upcoming ? 1 : getDisplayWeek();
  const weekGames = config.DB.scores.filter(g => g.week === displayWeek);
  const wa = config.DB.awards.find(a => a.week === displayWeek) || {};
  const t = config.DB.teams;
  const weekDate = weekGames.find(g => g.scheduled_at)?.scheduled_at;
  const weekDateStr = weekDate ? formatGameDate(weekDate) : '';
  const subLabel = weekDateStr || (upcoming ? 'Upcoming' : (displayWeek < config.CURRENT_WEEK ? 'Previous' : (wp > 0 ? 'Results' : 'Upcoming')));
  const matchupSub = document.getElementById('home-matchup-sub');
  const awardsSub = document.getElementById('home-awards-sub');
  if (matchupSub) matchupSub.textContent = `Week ${displayWeek} · ${subLabel}`;
  if (awardsSub) awardsSub.textContent = `Week ${displayWeek} · ${subLabel}`;

  const rec = calcStandings();
  const seeds = calcSeedsPure(config.DB.teams, config.DB.scores);
  const homeStandings = document.getElementById('home-standings');
  if (!homeStandings) return;
  homeStandings.innerHTML = (getConferences().map(c => c.id || c.name)).map(conf => {
    const idA = (id) => typeof id === 'string' ? `'${String(id).replace(/'/g, "\\'")}'` : id;
    const rows = config.DB.teams.filter(t => t.conf === conf).map(t => ({ ...rec[t.name] || { w: 0, l: 0 }, name: t.name, id: t.id })).sort((a, b) => (seeds[a.name] ?? 999) - (seeds[b.name] ?? 999));
    return `<div class="home-conf-block"><div class="home-conf-title">${confLabel(conf)}</div>${rows.map((r, i) => `<div class="home-stand-row" onclick="goToTeam(${idA(r.id)})"><span class="home-stand-rank">${i + 1}</span><span class="home-stand-name">${r.name}</span><span class="home-stand-rec">${r.w}-${r.l}</span></div>`).join('')}</div>`;
  }).join('');

  const games = weekGames.length ? weekGames : [
    { game: 1, t1: t[0]?.name || 'TBD', t2: t[3]?.name || 'TBD', s1: '', s2: '' },
    { game: 2, t1: t[1]?.name || 'TBD', t2: t[4]?.name || 'TBD', s1: '', s2: '' },
    { game: 3, t1: t[2]?.name || 'TBD', t2: t[5]?.name || 'TBD', s1: '', s2: '' },
  ];
  const homeMatchups = document.getElementById('home-matchups');
  const homeAwards = document.getElementById('home-awards');
  if (homeMatchups) homeMatchups.innerHTML = games.map((g, i) => buildMatchupCard({ ...g, game: g.game || i + 1 }, g.gameId || '')).join('');
  if (homeAwards) {
    const akhlaqPost = wa.akhlaq_post_url ? `<div class="akhlaq-post-wrap" style="margin-top:0.75rem;text-align:center;"><a href="${wa.akhlaq_post_url.replace(/"/g, '&quot;')}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:0.5rem;padding:0.5rem 1.1rem;background:rgba(200,168,75,0.1);border:1px solid rgba(200,168,75,0.3);border-radius:4px;color:#c8a84b;font-size:0.8rem;letter-spacing:0.12em;text-transform:uppercase;text-decoration:none;">▶ Watch on Instagram</a></div>` : '';
    homeAwards.innerHTML = `<div class="award-card akhlaq-card home-award-link"><div class="akhlaq-inner"><div class="akhlaq-medal">☽</div><div><div class="award-label">${akhlaqLabel(displayWeek)}</div><div class="award-winner">${wa.akhlaq || pending()}</div><div class="award-winner-sub">Exemplary character & brotherhood</div></div></div>${akhlaqPost}</div>`;
  }
}

export function renderStandings() {
  const rec = calcStandings();
  const seeds = calcSeedsPure(config.DB.teams, config.DB.scores);
  const idAttr = (id) => typeof id === 'string' ? `'${String(id).replace(/'/g, "\\'")}'` : id;
  const confGrid = document.querySelector('#page-standings .conf-grid, .conf-grid');
  const conferences = getConferences();
  if (confGrid && conferences.length > 0) {
    confGrid.innerHTML = conferences.map(c => {
      const confId = c.id || c.name;
      const slug = String(confId).toLowerCase().replace(/\W+/g, '_');
      const rows = config.DB.teams.filter(t => t.conf === confId).map(t => ({ ...rec[t.name] || { w: 0, l: 0, pf: 0, pa: 0 }, name: t.name, id: t.id })).sort((a, b) => (seeds[a.name] ?? 999) - (seeds[b.name] ?? 999));
      const rowsHtml = rows.map((r, i) => { const pd = (r.pf || 0) - (r.pa || 0); return `<tr><td style="color:#c8c0b0;font-size:0.82rem">${i + 1}</td><td><span class="team-link" onclick="goToTeam(${idAttr(r.id)})">${r.name}</span></td><td>${r.w}</td><td>${r.l}</td><td>${r.pf || '—'}</td><td>${r.pa || '—'}</td><td>${pd > 0 ? '+' + pd : pd}</td></tr>`; }).join('');
      return `<div class="card"><div class="conf-header" id="conf-header-${slug}">${confLabel(confId)}</div><table class="standings-table"><thead><tr><th style="width:28px">#</th><th>Team</th><th>W</th><th>L</th><th>PF</th><th>PA</th><th>PD</th></tr></thead><tbody id="${slug}-standings">${rowsHtml}</tbody></table></div>`;
    }).join('');
  } else {
    conferences.forEach(c => {
      const confId = c.id || c.name;
      const slug = String(confId).toLowerCase().replace(/\W+/g, '_');
      const tbody = document.getElementById(slug + '-standings');
      if (!tbody) return;
      const rows = config.DB.teams.filter(t => t.conf === confId).map(t => ({ ...rec[t.name] || { w: 0, l: 0, pf: 0, pa: 0 }, name: t.name, id: t.id })).sort((a, b) => (seeds[a.name] ?? 999) - (seeds[b.name] ?? 999));
      tbody.innerHTML = rows.map((r, i) => { const pd = (r.pf || 0) - (r.pa || 0); return `<tr><td style="color:#c8c0b0;font-size:0.82rem">${i + 1}</td><td><span class="team-link" onclick="goToTeam(${idAttr(r.id)})">${r.name}</span></td><td>${r.w}</td><td>${r.l}</td><td>${r.pf || '—'}</td><td>${r.pa || '—'}</td><td>${pd > 0 ? '+' + pd : pd}</td></tr>`; }).join('');
    });
  }
}

function formatScheduledAt(scheduledAt) {
  if (!scheduledAt) return 'TBD';
  const d = new Date(scheduledAt);
  if (isNaN(d.getTime())) return 'TBD';
  return d.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}

const DEFAULT_GAME_TIMES = { 1: '10:00 AM', 2: '11:00 AM', 3: '12:00 PM' };

function formatGameTime(scheduledAt, gameIndex) {
  if (!scheduledAt) return DEFAULT_GAME_TIMES[gameIndex] || '10:00 AM';
  const d = new Date(scheduledAt);
  if (isNaN(d.getTime())) return DEFAULT_GAME_TIMES[gameIndex] || '10:00 AM';
  return d.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatGameDate(scheduledAt) {
  if (!scheduledAt) return '';
  const d = new Date(scheduledAt);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric' });
}

const TEAM_LOGOS = {
  ansar: 'ansar.png',
  dukhaan: 'dukhaan.jpg',
  jaysh: 'jaysh.png',
  mujahideen: 'mujahideen.png',
  noor: 'noor.png',
  raad: 'raad.jpg',
};

// Per-team scale factors. Keys must match TEAM_LOGOS keys exactly.
// transform: translate(-50%,-50%) scale(S) on an absolutely-centred img
// inside an overflow:hidden crop div — adjust ±0.05 if edges clip.
const LOGO_SCALE = {
  jaysh: 2.75,
  noor: 2.40,
  dukhaan: 2.50,
  ansar: 1.725,
  mujahideen: [1.85, 2.45],
  raad: 2.30,
};
const DEFAULT_LOGO_SCALE = 1.15;

function teamLogoKey(name) {
  const slug = (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return Object.keys(TEAM_LOGOS).find(k => slug.includes(k) || k.includes(slug)) ?? null;
}

function teamLogoUrl(name) {
  const key = teamLogoKey(name);
  return key ? `${getBasePath()}/images/teams/${TEAM_LOGOS[key]}` : null;
}

function teamEmblemHtml(name) {
  const teamKey = teamLogoKey(name);
  const url = teamKey ? `${getBasePath()}/images/teams/${TEAM_LOGOS[teamKey]}` : null;
  if (url) {
    const s = LOGO_SCALE[teamKey] ?? DEFAULT_LOGO_SCALE;
    const scaleVal = Array.isArray(s) ? `${s[0]}, ${s[1]}` : s;
    return `<div class="team-emblem"><img src="${url}" class="mc-logo-img" alt="${escapeHtmlAttr(name)}" style="transform:scale(${scaleVal})" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span style="display:none;width:100%;height:100%;align-items:center;justify-content:center;">${initials(name)}</span></div>`;
  }
  return `<div class="team-emblem">${initials(name)}</div>`;
}

function teamLogoHtml(name, side) {
  const teamKey = teamLogoKey(name);
  const url = teamKey ? `${getBasePath()}/images/teams/${TEAM_LOGOS[teamKey]}` : null;
  const cls = `mc-logo mc-logo-${side}`;
  if (url) {
    const s = LOGO_SCALE[teamKey] ?? DEFAULT_LOGO_SCALE;
    const scaleVal = Array.isArray(s) ? `${s[0]}, ${s[1]}` : s;
    return `<div class="${cls}"><img src="${url}" class="mc-logo-img" alt="${escapeHtmlAttr(name)}" style="transform:scale(${scaleVal})" onerror="this.closest('.mc-logo').style.display='none';this.closest('.mc-logo').nextElementSibling.style.display='flex'"></div><div class="${cls}" style="display:none">${initials(name || '?')}</div>`;
  }
  return `<div class="${cls}">${initials(name || '?')}</div>`;
}

/**
 * Builds the HTML for a single matchup card.
 * t1 = home (right, teal), t2 = away (left, white).
 * Layout: [away logo | away name] [VS/score + box btn] [home name | home logo]
 */
function buildMatchupCard(g, gameId) {
  const played = g.s1 !== '' && g.s2 !== '';
  const s1 = parseInt(g.s1 || 0), s2 = parseInt(g.s2 || 0);
  const w1 = played && s1 > s2, w2 = played && s2 > s1;

  // Header band: Game N (left) | time (center) | ghost spacer (right to balance)
  const timeStr = played ? '' : formatGameTime(g.scheduled_at, g.game || 1);
  const header = `<div class="mc-header">
    <span class="mc-meta-game">Game ${g.game || 1}</span>
    <span class="mc-meta-time">${timeStr}</span>
    <span class="mc-meta-game" aria-hidden="true" style="visibility:hidden">Game ${g.game || 1}</span>
  </div>`;

  const mid = played
    ? `<div class="mc-mid"><div class="mc-score-row"><span class="mc-score${w2 ? ' winner' : ''}">${g.s2}</span><span class="mc-dash">—</span><span class="mc-score${w1 ? ' winner' : ''}">${g.s1}</span></div></div>`
    : `<div class="mc-mid"><div class="mc-vs-wrap"><span class="mc-vs-deco">VS</span><span class="mc-vs">VS</span></div></div>`;

  const winnerLine = played
    ? `<div class="mc-winner-tag">${s1 > s2 ? escapeHtmlAttr(g.t1) : escapeHtmlAttr(g.t2)} Win</div>`
    : '';

  const viewBoxBtn = gameId
    ? `<button type="button" class="schedule-expand-btn mc-box-btn" data-game-id="${gameId}">View box score</button>`
    : '';

  const boxRow = viewBoxBtn
    ? `<div class="mc-box-row">${viewBoxBtn}</div>`
    : '';

  // Away (t2): logo outer-left, name right of logo toward center
  // Home (t1): name toward center, logo outer-right (DOM order: name then logo)
  return `<div class="matchup-card"${g.week != null ? ` data-week="${g.week}"` : ''}>
    ${header}
    <div class="mc-body">
      <div class="mc-away">${teamLogoHtml(g.t2, 'away')}<span class="mc-team-name mc-away-name"${g.t2Id ? ` data-team-id="${escapeHtmlAttr(g.t2Id)}"` : ''}>${escapeHtmlAttr(g.t2)}</span></div>
      ${mid}
      <div class="mc-home"><span class="mc-team-name mc-home-name"${g.t1Id ? ` data-team-id="${escapeHtmlAttr(g.t1Id)}"` : ''}>${escapeHtmlAttr(g.t1)}</span>${teamLogoHtml(g.t1, 'home')}</div>
    </div>
    ${winnerLine}
    ${boxRow}
  </div>`;
}

function renderBoxScore(game, teams, gameStatValues, statDefinitions) {
  const gameId = game.gameId;
  const t1 = teams?.find(t => t.id === game.t1Id);
  const t2 = teams?.find(t => t.id === game.t2Id);
  const played = game.s1 !== '' && game.s2 !== '';
  const defs = statDefinitions || [];
  const gsv = gameStatValues?.[gameId] || {};
  const roster1 = [...(t1?.roster || [])];
  const roster2 = [...(t2?.roster || [])];
  const pointsDef = defs.find(d => d.slug === 'points');

  const getPoints = (playerId) => {
    if (!pointsDef || !playerId) return 0;
    const v = gsv[playerId]?.[pointsDef.id];
    return typeof v === 'number' ? v : (parseFloat(v) || 0);
  };
  roster1.sort((a, b) => getPoints(b.id) - getPoints(a.id));
  roster2.sort((a, b) => getPoints(b.id) - getPoints(a.id));
  const maxPts1 = roster1.length ? Math.max(...roster1.map(p => getPoints(p.id))) : 0;
  const maxPts2 = roster2.length ? Math.max(...roster2.map(p => getPoints(p.id))) : 0;
  const isTopScorer = (roster, idx, maxPts) => {
    const p = roster[idx];
    return p && maxPts > 0 && getPoints(p.id) === maxPts;
  };

  let rows1 = '';
  let rows2 = '';
  const maxRows = Math.max(roster1.length, roster2.length, 1);
  for (let i = 0; i < maxRows; i++) {
    const p1 = roster1[i];
    const p2 = roster2[i];
    const top1 = isTopScorer(roster1, i, maxPts1);
    const top2 = isTopScorer(roster2, i, maxPts2);
    const rowClass1 = top1 ? ' box-score-row-top' : '';
    const rowClass2 = top2 ? ' box-score-row-top' : '';
    let r1 = `<tr class="box-score-row${rowClass1}"><td class="box-score-player">${p1 ? p1.name : '—'}</td>`;
    let r2 = `<tr class="box-score-row${rowClass2}"><td class="box-score-player">${p2 ? p2.name : '—'}</td>`;
    defs.forEach(d => {
      const isPoints = d.slug === 'points';
      const statClass = `box-score-stat-col${isPoints ? ' box-score-stat-points' : ''}`;
      const v1 = p1 ? (gsv[p1.id]?.[d.id] ?? '—') : '—';
      const v2 = p2 ? (gsv[p2.id]?.[d.id] ?? '—') : '—';
      const disp1 = v1 === '—' || v1 === '' ? '—' : v1;
      const disp2 = v2 === '—' || v2 === '' ? '—' : v2;
      r1 += `<td class="${statClass}">${disp1}</td>`;
      r2 += `<td class="${statClass}">${disp2}</td>`;
    });
    r1 += '</tr>';
    r2 += '</tr>';
    rows1 += r1;
    rows2 += r2;
  }

  const headerCols = defs.map(d => {
    const isPoints = d.slug === 'points';
    const statClass = `box-score-stat-col${isPoints ? ' box-score-stat-points' : ''}`;
    return `<th class="${statClass}">${d.name}</th>`;
  }).join('');
  const emptyMsg = roster1.length === 0 && roster2.length === 0 ? 'Roster TBD' : (played ? '' : 'Stats will appear after the game.');
  const scoreStr = played ? `${game.t1} ${game.s1} – ${game.s2} ${game.t2}` : '— – —';

  let html = `<div class="box-score-wrap"><div class="box-score-game-score">${scoreStr}</div>`;
  if (emptyMsg) {
    html += `<div class="box-score-empty">${emptyMsg}</div>`;
  } else {
    html += `<div class="box-score-grid"><div class="box-score-team"><div class="box-score-team-name">${game.t1 || 'Team 1'}</div><table class="box-score-table"><thead><tr><th class="box-score-player-header">Player</th>${headerCols}</tr></thead><tbody>${rows1}</tbody></table></div><div class="box-score-team"><div class="box-score-team-name">${game.t2 || 'Team 2'}</div><table class="box-score-table"><thead><tr><th class="box-score-player-header">Player</th>${headerCols}</tr></thead><tbody>${rows2}</tbody></table></div></div>`;
  }
  html += '</div>';
  return html;
}

export function openBoxScoreFullscreen(game) {
  const teams = config.DB.teams || [];
  const gameStatValues = config.DB.gameStatValues || {};
  const statDefinitions = config.DB.statDefinitions || [];
  const content = document.getElementById('box-score-fullscreen-content');
  const overlay = document.getElementById('box-score-fullscreen');
  if (!content || !overlay) return;
  content.innerHTML = renderBoxScore(game, teams, gameStatValues, statDefinitions);
  overlay.style.display = 'flex';
  overlay.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

export function closeBoxScoreFullscreen() {
  const overlay = document.getElementById('box-score-fullscreen');
  if (!overlay) return;
  overlay.style.display = 'none';
  overlay.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

function scheduleWeekTitle(w) {
  const labels = config.DB.scheduleWeekLabels || {};
  const c = labels[String(w)] ?? labels[w];
  return (c != null && String(c).trim() !== '') ? String(c).trim() : `Week ${w}`;
}

export function renderSchedule(focusWeek, teamFilter) {
  const allEl = document.getElementById('schedule-all-content');
  const prevEl = document.getElementById('schedule-prev');
  const focusEl = document.getElementById('schedule-focus');
  const nextEl = document.getElementById('schedule-next');
  if (!focusEl && !allEl) return;

  if (!window.scheduleBoxScoreHandlersAttached) {
    window.scheduleBoxScoreHandlersAttached = true;
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.schedule-expand-btn');
      if (!btn) return;
      const gameId = btn.dataset.gameId;
      const game = (config.DB.scores || []).find(s => s.gameId === gameId);
      if (game) openBoxScoreFullscreen(game);
    });
  }

  const renderWeekBlock = (w, label) => {
    let games = (config.DB.scores || []).filter(g => g.week === w);
    if (teamFilter) games = games.filter(g => g.t1 === teamFilter || g.t2 === teamFilter);
    if (!games.length) return `<div class="card" style="text-align:center;padding:1.4rem;margin-bottom:0.9rem;"><div style="font-size:0.9rem;color:#c8c0b0;font-style:italic;">${scheduleWeekTitle(w)} — No games${teamFilter ? ' for this team' : ''}.</div></div>`;
    const weekDate = games.find(g => g.scheduled_at)?.scheduled_at;
    const weekDateStr = weekDate ? ` · ${formatGameDate(weekDate)}` : '';
    const cards = games.map(g => buildMatchupCard(g, g.gameId || ''));
    return `<div data-week="${w}" style="margin-bottom:1.1rem;"><div style="font-family:'Cinzel',serif;font-size:0.84rem;letter-spacing:0.18em;text-transform:uppercase;color:#c8a84b;margin-bottom:0.7rem;">${label}${weekDateStr}</div><div class="matchups-grid">${cards.join('')}</div></div>`;
  };

  const sectionHeader = (label, isCurrent) =>
    `<div class="schedule-section-header${isCurrent ? ' schedule-section-header-current' : ''}"><span>${label}</span></div>`;

  if (focusWeek === 'all') {
    // All-weeks view: Past / Current / Upcoming sections
    if (prevEl) prevEl.style.display = 'none';
    if (focusEl) focusEl.style.display = 'none';
    if (nextEl) nextEl.style.display = 'none';
    if (!allEl) return;
    allEl.style.display = '';
    const cur = config.CURRENT_WEEK;
    const total = config.TOTAL_WEEKS;
    let html = '';
    // Past — collapsible, collapsed by default
    if (cur > 1) {
      html += `<div class="schedule-section-header schedule-section-header-toggle" id="schedule-past-toggle"><span class="schedule-past-arrow">▸</span><span>Past</span></div>`;
      html += `<div id="schedule-past-body" style="display:none;">`;
      for (let w = 1; w < cur; w++) html += renderWeekBlock(w, scheduleWeekTitle(w));
      html += `</div>`;
    }
    // Current
    html += sectionHeader('Current Week', true);
    html += renderWeekBlock(cur, scheduleWeekTitle(cur));
    // Upcoming
    if (cur < total) {
      html += sectionHeader('Upcoming', false);
      for (let w = cur + 1; w <= total; w++) html += renderWeekBlock(w, scheduleWeekTitle(w));
    }
    allEl.innerHTML = html;
    // Wire Past toggle
    const pastToggle = allEl.querySelector('#schedule-past-toggle');
    const pastBody = allEl.querySelector('#schedule-past-body');
    if (pastToggle && pastBody) {
      pastToggle.addEventListener('click', () => {
        const open = pastBody.style.display !== 'none';
        pastBody.style.display = open ? 'none' : '';
        const arrow = pastToggle.querySelector('.schedule-past-arrow');
        if (arrow) arrow.textContent = open ? '▸' : '▾';
      });
    }
  } else {
    // Single-week view
    if (allEl) allEl.style.display = 'none';
    if (prevEl) prevEl.style.display = 'none';
    if (nextEl) nextEl.style.display = 'none';
    if (!focusEl) return;
    focusEl.style.display = '';
    focusEl.innerHTML = renderWeekBlock(focusWeek, `${scheduleWeekTitle(focusWeek)}${focusWeek === config.CURRENT_WEEK ? ' — Current' : ''}`);
  }
}

export function renderScores(week) {
  const el = document.getElementById('scores-content');
  if (!el) return;
  const rw = w => {
    const games = config.DB.scores.filter(g => g.week === w);
    const played = games.filter(g => g.s1 !== '' && g.s2 !== '');
    if (!played.length) return `<div class="card" style="text-align:center;padding:1.4rem;margin-bottom:0.9rem;"><div style="font-size:0.9rem;color:#c8c0b0;font-style:italic;">Week ${w} — No results yet.</div></div>`;
    const weekDate = games.find(g => g.scheduled_at)?.scheduled_at;
    const weekDateStr = weekDate ? ` · ${formatGameDate(weekDate)}` : '';
    const cards = played.map(g => buildMatchupCard(g, g.gameId || ''));
    return `<div style="margin-bottom:1.1rem;"><div style="font-family:'Cinzel',serif;font-size:0.84rem;letter-spacing:0.18em;text-transform:uppercase;color:#c8a84b;margin-bottom:0.7rem;">Week ${w}${w == config.CURRENT_WEEK ? ' — Current' : ''}${weekDateStr}</div><div class="matchups-grid">${cards.join('')}</div></div>`;
  };
  const playedWeeks = [...new Set((config.DB.scores || []).filter(g => g.s1 !== '' && g.s2 !== '').map(g => g.week))].sort((a, b) => a - b);
  el.innerHTML = week === 'all'
    ? playedWeeks.map(w => rw(w)).join('')
    : rw(parseInt(week));
}

export function renderTeams() {
  const teamsGrid = document.getElementById('teams-grid');
  if (!teamsGrid) return;
  const rec = calcStandings();
  const seeds = calcSeedsPure(config.DB.teams, config.DB.scores);
  const idAttr = (id) => typeof id === 'string' ? `'${String(id).replace(/'/g, "\\'")}'` : id;
  const effectiveCaptain = (t) => {
    const cap = (t.captain || '').trim();
    if (!cap) return '';
    const roster = t.roster || [];
    const found = roster.some(p => String(p.name || '').trim().toLowerCase() === cap.toLowerCase());
    return found ? cap : '';
  };
  const teamCard = t => {
    const cap = effectiveCaptain(t);
    const r = rec[t.name];
    const record = r ? `${r.w}-${r.l}` : '0-0';
    const seed = seeds[t.name] ?? 'TBD';
    return `<div class="team-card" id="tc-${t.id}" data-team-id="${t.id}" data-conf="${escapeHtmlAttr(t.conf || '')}" onclick="toggleRoster(${idAttr(t.id)})">${teamEmblemHtml(t.name)}<div class="team-card-info"><div class="team-name">${t.name}</div><div class="team-captain">Capt: ${cap || '—'}</div></div><div class="team-card-stats"><div class="team-stat-row"><span class="team-stat-label">Record</span><span class="team-stat-value team-record-val">${record}</span></div><div class="team-stat-row"><span class="team-stat-label">Seed</span><span class="team-stat-value team-seed-val">${seed}</span></div></div></div>`;
  };
  const confIds = new Set(getConferences().map(c => c.id || c.name));
  const confs = [...getConferences().map(c => c.id || c.name)];
  const unassignedTeams = (config.DB.teams || []).filter(t => !confIds.has(t.conf));
  const sections = confs.map(conf => {
    const slug = String(conf).toLowerCase().replace(/\W+/g, '_');
    return `
    <div class="teams-conf-section" data-conf="${escapeHtmlAttr(conf)}" style="margin-bottom:1.6rem;">
      <div id="teams-conf-header-${slug}" class="teams-conf-header" style="font-family:'Cinzel',serif;font-size:0.82rem;letter-spacing:0.18em;text-transform:uppercase;color:#c8a84b;margin-bottom:0.75rem;padding-bottom:0.35rem;border-bottom:1px solid rgba(200,168,75,0.2);">${confLabel(conf)}</div>
      <div class="teams-grid teams-drop-zone" data-conf="${escapeHtmlAttr(conf)}">${config.DB.teams.filter(t => t.conf === conf).sort((a, b) => (seeds[a.name] ?? 999) - (seeds[b.name] ?? 999)).map(teamCard).join('')}</div>
    </div>`;
  });
  if (unassignedTeams.length > 0) {
    sections.push(`
    <div class="teams-conf-section" data-conf="__unassigned__" style="margin-bottom:1.6rem;">
      <div id="teams-conf-header-_unassigned_" class="teams-conf-header" style="font-family:'Cinzel',serif;font-size:0.82rem;letter-spacing:0.18em;text-transform:uppercase;color:#c87070;margin-bottom:0.75rem;padding-bottom:0.35rem;border-bottom:1px solid rgba(200,112,112,0.3);">${confLabel('__unassigned__')} — assign or delete</div>
      <div class="teams-grid teams-drop-zone" data-conf="__unassigned__">${unassignedTeams.sort((a,b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).map(teamCard).join('')}</div>
    </div>`);
  }
  teamsGrid.innerHTML = sections.join('');
}

export function toggleRoster(id) {
  const panel = document.getElementById('roster-panel');
  if (!panel) return;
  document.querySelectorAll('.team-card').forEach(c => c.classList.remove('selected'));
  if (activeTeam === id) { closeRoster(); return; }
  activeTeam = id;
  const t = config.DB.teams.find(x => x.id === id), rec = calcStandings();
  if (!t) return;
  const tc = document.getElementById('tc-' + id);
  if (tc) tc.classList.add('selected');
  const rosterContent = document.getElementById('roster-content');
  const roster = t.roster || [];
  const captainMatch = roster.find(p => (t.captain || '').trim() && String(p.name || '').trim().toLowerCase() === (t.captain || '').trim().toLowerCase());
  const captain = captainMatch ? captainMatch.name : '';
  const captainNorm = captain.toLowerCase();
  const others = (t.players || []).filter(p => String(p).trim().toLowerCase() !== captainNorm).sort((a, b) => a.localeCompare(b));
  const rosterList = captain ? [captain, ...others] : others;
  const capDisplay = captain || '—';
  if (rosterContent) rosterContent.innerHTML = `<div style="margin-bottom:0.9rem;"><div style="font-family:'Cinzel',serif;font-size:1rem;color:#c8a84b">${t.name}</div><div style="font-size:0.8rem;color:#2fa89a;letter-spacing:0.1em;text-transform:uppercase;margin-top:0.12rem">${confLabel(t.conf)}</div></div>${rosterList.map((p, i) => '<div class="roster-player"><span class="roster-num">' + (i + 1) + '</span>' + p + '</div>').join('')}`;
  if (window.innerWidth <= 768 && tc) {
    tc.insertAdjacentElement('afterend', panel);
  }
  panel.classList.add('open');
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

export function closeRoster() {
  activeTeam = null;
  document.querySelectorAll('.team-card').forEach(c => c.classList.remove('selected'));
  const rosterPanel = document.getElementById('roster-panel');
  if (!rosterPanel) return;
  rosterPanel.classList.remove('open');
  // Restore panel to its default position (after teams-grid) if it was moved for mobile
  const teamsGrid = document.getElementById('teams-grid');
  if (teamsGrid && rosterPanel.previousElementSibling !== teamsGrid) {
    teamsGrid.insertAdjacentElement('afterend', rosterPanel);
  }
}

export function renderStats(teamFilter) {
  const wrap = document.getElementById('stats-table-wrap');
  const leadersWrap = document.getElementById('stats-leaders-wrap');
  const filterWrap = document.getElementById('stats-filter-wrap');
  if (!wrap) return;
  if (teamFilter === undefined) teamFilter = document.getElementById('stats-team-filter')?.value || '';
  const defs = config.DB.statDefinitions || [];
  const sub = document.getElementById('stats-section-sub');
  if (sub) sub.textContent = config.currentSeasonLabel + (defs.length > 1 ? '' : ' · Points Only');
  const allRows = (config.DB.stats || [])
    .filter(s => s.total > 0 || Object.values(s.statValues || {}).some(v => v > 0))
    .sort((a, b) => b.total - a.total);
  if (!defs.length) {
    if (leadersWrap) leadersWrap.innerHTML = '';
    if (filterWrap) filterWrap.innerHTML = '';
    wrap.innerHTML = `<div style="padding:1.8rem;text-align:center;font-style:italic;color:#c8c0b0;font-size:0.9rem;">No stat types defined — add them in the admin Stats tab.</div>`;
    return;
  }
  const standings = calcStandings();
  const teamRec = name => { const s = standings[name]; return s ? ` (${s.w}-${s.l})` : ''; };
  if (filterWrap) {
    const teams = [...new Set(allRows.map(r => r.team).filter(Boolean))].sort();
    const rec = teamFilter ? standings[teamFilter] : null;
    const recSpan = rec ? `<span style="flex:1;text-align:center;color:#c8a84b;font-family:'Cinzel',serif;font-size:0.88rem;letter-spacing:0.06em;">${escapeHtmlAttr(teamFilter)} &middot; ${rec.w}-${rec.l}</span>` : '';
    filterWrap.innerHTML = `<div class="week-dropdown-wrap"><span class="week-dropdown-label">Team</span><select class="week-dropdown" id="stats-team-filter" onchange="renderStats(this.value)"><option value="">All Teams</option>${teams.map(t => `<option value="${escapeHtmlAttr(t)}"${t === teamFilter ? ' selected' : ''}>${escapeHtmlAttr(t)}</option>`).join('')}</select>${recSpan}</div>`;
    const sel = document.getElementById('stats-team-filter');
    if (sel) sel.value = teamFilter;
  }
  const rows = (teamFilter ? allRows.filter(r => r.team === teamFilter) : allRows).slice(0, 15);
  const pointsDef = defs.find(d => d.slug === 'points');
  const calcPpg = r => r.gp > 0 ? (pointsDef ? (r.statValues?.[pointsDef.id] || 0) : r.total) / r.gp : 0;
  if (leadersWrap) {
    const ranked = rows.filter(r => r.gp > 0)
      .map(r => ({ ...r, ppg: calcPpg(r) }))
      .sort((a, b) => b.ppg - a.ppg)
      .slice(0, 3);
    leadersWrap.innerHTML = ranked.map((r, i) => `<div class="stat-leader-card"><div class="slc-rank">#${i + 1}</div><div class="slc-name">${escapeHtmlAttr(r.name)}</div><div class="slc-team">${escapeHtmlAttr(r.team)}${teamFilter ? '' : escapeHtmlAttr(teamRec(r.team))}</div><div class="slc-ppg">${r.ppg.toFixed(1)} PPG</div><div class="slc-sub">${pointsDef ? (r.statValues?.[pointsDef.id] || 0) : r.total} total pts</div></div>`).join('');
  }
  const theadCells = `<th style="padding:0.75rem 1rem;width:36px">#</th><th style="padding:0.75rem 1rem;">Player</th><th style="padding:0.75rem 1rem;">GP</th>${defs.map(d => `<th style="padding:0.75rem 1rem;">${escapeHtmlAttr(d.name)}</th>`).join('')}<th style="padding:0.75rem 1rem;">PPG</th>`;
  const noData = `<tr><td colspan="${3 + defs.length + 1}" style="text-align:center;padding:1.8rem;font-style:italic;color:#c8c0b0;font-size:0.9rem;">No stats yet — season hasn't started.</td></tr>`;
  const tbodyRows = rows.map((r, i) => {
    const ppg = calcPpg(r);
    const defCells = defs.map(d => {
      const val = r.statValues?.[d.id] ?? 0;
      return `<td style="padding:0.7rem 1rem${d.slug === 'points' ? ';color:#c8a84b' : ''}">${val > 0 ? val : '—'}</td>`;
    }).join('');
    return `<tr><td style="padding:0.7rem 1rem;color:#c8c0b0;font-size:0.82rem">${i + 1}</td><td style="padding:0.7rem 1rem"><div style="font-size:0.92rem;color:#f5f0e8;font-weight:600">${escapeHtmlAttr(r.name)}</div><div style="font-size:0.78rem;color:#2fa89a;letter-spacing:0.05em;margin-top:0.1rem">${escapeHtmlAttr(r.team)}${teamFilter ? '' : escapeHtmlAttr(teamRec(r.team))}</div></td><td style="padding:0.7rem 1rem">${r.gp}</td>${defCells}<td style="padding:0.7rem 1rem;color:#2fa89a">${ppg > 0 ? ppg.toFixed(1) : '—'}</td></tr>`;
  }).join('');
  wrap.innerHTML = `<table class="standings-table" style="width:100%;"><thead><tr style="background:rgba(200,168,75,0.04);">${theadCells}</tr></thead><tbody>${rows.length ? tbodyRows : noData}</tbody></table>`;
}

export function renderAwards(week) {
  const awardsGrid = document.getElementById('awards-grid');
  if (!awardsGrid) return;
  const w = parseInt(week, 10), wa = config.DB.awards.find(a => Number(a.week) === w) || {};
  const games = config.DB.scores.filter(g => Number(g.week) === w);
  const g1 = games[0] || { t1: 'TBD', t2: 'TBD' }, g2 = games[1] || { t1: 'TBD', t2: 'TBD' }, g3 = games[2] || { t1: 'TBD', t2: 'TBD' };
  const akhlaqPost = wa.akhlaq_post_url ? `<div class="akhlaq-post-wrap" style="margin-top:0.75rem;text-align:center;"><a href="${wa.akhlaq_post_url.replace(/"/g, '&quot;')}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:0.5rem;padding:0.5rem 1.1rem;background:rgba(200,168,75,0.1);border:1px solid rgba(200,168,75,0.3);border-radius:4px;color:#c8a84b;font-size:0.8rem;letter-spacing:0.12em;text-transform:uppercase;text-decoration:none;">▶ Watch on Instagram</a></div>` : '';
  awardsGrid.innerHTML = `
    <div class="award-card akhlaq-card"><div class="akhlaq-inner"><div class="akhlaq-medal">☽</div><div><div class="award-label">${akhlaqLabel(w)}</div><div class="award-winner" id="award-winner-akhlaq" data-field="akhlaq">${wa.akhlaq || pending()}</div><div class="award-winner-sub">Exemplary character & brotherhood on and off the court</div></div></div>${akhlaqPost}</div>`;
  const sa = config.DB.awards.find(a => a.champ) || {};
  const saChamp = document.getElementById('sa-champ');
  const saMvp = document.getElementById('sa-mvp');
  const saScoring = document.getElementById('sa-scoring');
  if (saChamp) saChamp.textContent = sa.champ || `${config.currentSeasonLabel} — In Progress`;
  if (saMvp) saMvp.textContent = sa.mvp || 'Season in progress';
  if (saScoring) saScoring.textContent = sa.scoring || 'Season in progress';
  renderMvpLadder(w);
}

export function renderMvpLadder(week) {
  const wrap = document.getElementById('awards-mvp-ladder-wrap');
  if (!wrap) return;

  let ladderPlayerIds = null;
  try {
    const raw = config.DB.contentBlocks?.mvp_ladder_data;
    if (raw) {
      const allData = JSON.parse(raw);
      const keys = Object.keys(allData).map(Number).filter(k => k <= week).sort((a, b) => b - a);
      if (keys.length > 0) ladderPlayerIds = allData[String(keys[0])];
    }
  } catch (_) {}

  if (!ladderPlayerIds?.length) { wrap.innerHTML = ''; return; }

  const playerMap = {};
  (config.DB.teams || []).forEach(t => {
    (t.roster || []).forEach(p => { playerMap[p.id] = { name: p.name, team: t.name }; });
  });

  const defs = config.DB.statDefinitions || [];
  const pointsDef = defs.find(d => d.slug === 'points');
  const statsMap = {};
  (config.DB.stats || []).forEach(s => {
    const pts = pointsDef ? (s.statValues?.[pointsDef.id] || 0) : s.total;
    statsMap[s.name] = s.gp > 0 ? pts / s.gp : null;
  });

  const entries = ladderPlayerIds.map((id, i) => {
    const p = playerMap[id];
    if (!p) return null;
    return { rank: i + 1, name: p.name, team: p.team, ppg: statsMap[p.name] ?? null };
  }).filter(Boolean);

  if (!entries.length) { wrap.innerHTML = ''; return; }

  const ppgDisplay = (ppg) => (ppg != null && ppg > 0) ? ppg.toFixed(1) + ' PPG' : '—';
  const top3 = entries.slice(0, 3);
  const rest = entries.slice(3);

  const RANK_META = {
    1: { color: '#c8a84b', shadow: 'rgba(200,168,75,0.35)', label: 'gold' },
    2: { color: '#a8b8c8', shadow: 'rgba(168,184,200,0.3)', label: 'silver' },
    3: { color: '#c8845a', shadow: 'rgba(200,132,90,0.28)', label: 'bronze' },
  };

  // Shield SVG badge: rank number inside a shield shape
  const shieldBadge = (rank) => {
    const m = RANK_META[rank];
    return `<svg viewBox="0 0 60 72" width="40" height="48" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:0 auto 0.3rem;filter:drop-shadow(0 0 8px ${m.shadow});">
      <defs><linearGradient id="sg${rank}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${m.color}" stop-opacity="1"/><stop offset="100%" stop-color="${m.color}" stop-opacity="0.55"/></linearGradient></defs>
      <path d="M30 2 L58 14 L58 36 C58 54 30 70 30 70 C30 70 2 54 2 36 L2 14 Z" fill="url(#sg${rank})" stroke="${m.color}" stroke-width="2"/>
      <text x="30" y="44" text-anchor="middle" dominant-baseline="middle" font-family="Cinzel,serif" font-size="24" font-weight="700" fill="#060f1a">${rank}</text>
    </svg>`;
  };

  // Podium order: 2nd left, 1st center, 3rd right
  const podiumOrder = [top3[1], top3[0], top3[2]].filter(Boolean);
  const podiumHtml = podiumOrder.map(e => {
    const m = RANK_META[e.rank];
    return `<div class="mvp-podium-card mvp-podium-rank${e.rank}" style="border-color:${m.color};box-shadow:0 0 18px ${m.shadow};">
      <div class="mvp-podium-badge">${shieldBadge(e.rank)}</div>
      <div class="mvp-podium-body">
        <div class="mvp-podium-logo">${teamEmblemHtml(e.team)}</div>
        <div class="mvp-podium-info">
          <div class="mvp-podium-player">${escapeHtmlAttr(e.name)}</div>
          <div class="mvp-podium-team mvp-podium-team-desktop" style="color:${m.color};">${escapeHtmlAttr(e.team)}</div>
          <div class="mvp-podium-ppg">${ppgDisplay(e.ppg)}</div>
        </div>
      </div>
    </div>`;
  }).join('');

  const listHtml = rest.map(e =>
    `<div class="mvp-ladder-row"><span class="mvp-ladder-rank">#${e.rank}</span><span class="mvp-ladder-name">${escapeHtmlAttr(e.name)}</span><span class="mvp-ladder-team">${escapeHtmlAttr(e.team)}</span><span class="mvp-ladder-ppg">${ppgDisplay(e.ppg)}</span></div>`
  ).join('');

  wrap.innerHTML = `
    <hr class="section-divider">
    <p class="section-sub">Mid Season Awards</p>
    <h2 class="section-title">Midseason MVP Ranking</h2>
    <div class="section-line"></div>
    <div class="mvp-podium">${podiumHtml}</div>
    ${rest.length ? `<div class="mvp-ladder-list card">${listHtml}</div>` : ''}`;
}

export function renderPowerRankings(week) {
  const el = document.getElementById('pr-content');
  if (!el) return;
  const w = parseInt(week, 10);
  let allData = {};
  try {
    const raw = config.DB.contentBlocks?.power_rankings_data;
    if (raw) allData = JSON.parse(raw);
  } catch (_) {}
  const weekData = allData[String(w)] || allData[w] || [];

  const prevData = allData[String(w - 1)] || allData[w - 1] || [];
  const prevRankMap = {};
  prevData.forEach((entry, i) => { prevRankMap[entry.teamId] = i + 1; });

  const teamMap = {};
  (config.DB.teams || []).forEach(t => { teamMap[t.id] = t; });
  const isLatest = w === Math.max(1, config.CURRENT_WEEK - 1);
  const weekLabel = `Week ${w}${isLatest ? ' · Latest' : ''}`;
  if (!weekData.length) {
    el.innerHTML = `<div class="pr-week-label">${weekLabel}</div><div style="color:#8a8580;font-style:italic;padding:1rem 0;">No rankings for this week yet.</div>`;
    return;
  }
  const rows = weekData.map((entry, i) => {
    const team = teamMap[entry.teamId];
    const name = team?.name || '—';
    const teamKey = teamLogoKey(name);
    const logoUrl = teamKey ? `${getBasePath()}/images/teams/${TEAM_LOGOS[teamKey]}` : null;
    const s = logoUrl ? (LOGO_SCALE[teamKey] ?? DEFAULT_LOGO_SCALE) : null;
    const scaleVal = s != null ? (Array.isArray(s) ? `${s[0]}, ${s[1]}` : s) : null;
    const logoInner = logoUrl
      ? `<img src="${logoUrl}" class="mc-logo-img" alt="${escapeHtmlAttr(name)}" style="transform:scale(${scaleVal})" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span style="display:none;width:100%;height:100%;align-items:center;justify-content:center;">${initials(name)}</span>`
      : initials(name);
    const noteHtml = entry.note ? `<div class="pr-note">${entry.note}</div>` : '';
    const prevRank = prevRankMap[entry.teamId];
    const delta = prevRank != null ? prevRank - (i + 1) : 0;
    const moveHtml = delta > 0
      ? `<div class="pr-move pr-move-up"><span class="pr-move-arrow">▲</span><span class="pr-move-num">${delta}</span></div>`
      : delta < 0
        ? `<div class="pr-move pr-move-dn"><span class="pr-move-arrow">▼</span><span class="pr-move-num">${Math.abs(delta)}</span></div>`
        : `<div class="pr-move"></div>`;
    return `<div class="pr-row">
      <div class="pr-rank">#${i + 1}</div>
      ${moveHtml}
      <div class="pr-logo">${logoInner}</div>
      <div class="pr-info"><div class="pr-team-name">${escapeHtmlAttr(name)}</div>${noteHtml}</div>
    </div>`;
  }).join('');
  el.innerHTML = `<div class="pr-week-label">${weekLabel}</div><div class="pr-list">${rows}</div>`;
}

const BASELINE_SLOTS = [
  { key: 'baseline_ep1', defaultTitle: 'Episode 1' },
  { key: 'baseline_ep2', defaultTitle: 'Episode 2' },
  { key: 'baseline_ep3', defaultTitle: 'Episode 3' },
];
const HIGHLIGHTS_SLOTS = [
  { key: 'highlights_g1', defaultTitle: 'Game 1 Highlights' },
  { key: 'highlights_g2', defaultTitle: 'Game 2 Highlights' },
  { key: 'highlights_g3', defaultTitle: 'Game 3 Highlights' },
];

function getMediaLayout(blocks) {
  let layout = { sections: [] };
  try {
    const parsed = JSON.parse(blocks.media_layout || '{}');
    if (parsed?.sections?.length) {
      layout = parsed;
    } else {
      const legacy = JSON.parse(blocks.media_custom_blocks || '[]');
      if (Array.isArray(legacy) && legacy.length) {
        layout = {
          sections: [{ id: 'legacy_1', title: blocks.media_custom_section_title || 'Custom Media', blocks: legacy }],
        };
      }
    }
  } catch (_) {}
  return layout;
}

export function activateInstagramEmbeds() {}

export function renderMedia(week) {
  const displayWeek = (week && week !== 'all') ? parseInt(week, 10) : config.CURRENT_WEEK;
  const soon = `<div class="video-title" style="font-style:italic;">Coming soon</div>`;
  const blocks = config.DB.contentBlocks || {};
  const el = document.getElementById('media-content');
  if (!el) return;
  const layout = getMediaLayout(blocks);

  const visibleSections = (layout.sections || [])
    .map(sec => ({
      ...sec,
      blocks: (sec.blocks || []).filter(b => b.week == null || b.week === displayWeek),
    }))
    .filter(sec => (sec.week == null || sec.week === displayWeek) && sec.blocks.length > 0);

  if (!visibleSections.length) {
    el.innerHTML = `<div class="media-empty-state" style="text-align:center;padding:3rem 1.5rem;color:#8a8580;font-size:0.95rem;">Add a section to get started.</div>`;
    renderMediaLinks();
    return;
  }

  const sectionHtml = visibleSections.map((sec, si) => {
    const secId = (sec.id || 'sec_' + si).replace(/"/g, '&quot;');
    const secTitle = (sec.title || 'Section').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    const blockCards = sec.blocks.map((b, bi) => {
      const bid = (b.id || 'blk_' + bi).replace(/"/g, '&quot;');
      const btitle = (b.title || 'Media').replace(/</g, '&lt;').replace(/"/g, '&quot;');
      const url = b.url || '';
      const spanStyle = b.width === 'full' ? ' style="grid-column:1/-1;"' : '';
      const dataAttrs = ` data-section-id="${secId}" data-block-id="${bid}"`;
      const cardInner = url
        ? `<a href="${url.replace(/"/g, '&quot;')}" target="_blank" rel="noopener" class="video-card-link" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0.75rem;text-decoration:none;width:100%;height:100%;padding:1.5rem 1rem;box-sizing:border-box;"><div class="video-play-icon" style="width:56px;height:56px;border-radius:50%;background:rgba(200,168,75,0.15);border:2px solid rgba(200,168,75,0.4);display:flex;align-items:center;justify-content:center;font-size:1.4rem;color:#c8a84b;">▶</div><div class="video-label" style="text-align:center;">${btitle}</div><span style="font-size:0.75rem;color:#8a8580;letter-spacing:0.1em;text-transform:uppercase;">Watch on Instagram</span></a>`
        : `<div class="video-icon">▶</div><div class="video-label">${btitle}</div>${soon}`;
      return `<div class="video-card"${dataAttrs}${spanStyle}>${cardInner}</div>`;
    }).join('');
    return `<div class="media-layout-section" data-section-id="${secId}"><div class="media-section-header" style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;"><div class="media-section-title" data-section-id="${secId}" data-editable-title>${secTitle}</div></div><div class="media-grid">${blockCards}</div></div>`;
  }).join('');

  el.innerHTML = `<div class="media-layout-wrap" style="margin-bottom:1.8rem;">${sectionHtml}</div>`;
  renderMediaLinks();
}

function renderMediaLinks() {
  const instaUrl = config.DB?.contentBlocks?.instagram_url || '';
  const followWrap = document.getElementById('media-follow-wrap');
  if (followWrap) {
    const btn = followWrap.querySelector('.insta-btn');
    if (btn) {
      if (instaUrl) {
        const a = document.createElement('a');
        a.href = instaUrl;
        a.target = '_blank';
        a.rel = 'noopener';
        a.className = 'insta-btn';
        a.textContent = btn.textContent;
        btn.replaceWith(a);
      } else {
        const wasBtn = btn.tagName === 'BUTTON';
        if (!wasBtn && btn.tagName === 'A') {
          const b = document.createElement('button');
          b.className = 'insta-btn';
          b.textContent = btn.textContent;
          btn.replaceWith(b);
        }
      }
    }
  }
  document.querySelectorAll('.footer-insta').forEach(el => {
    if (instaUrl) {
      if (el.tagName !== 'A') {
        const a = document.createElement('a');
        a.href = instaUrl;
        a.target = '_blank';
        a.rel = 'noopener';
        a.className = 'footer-insta';
        a.textContent = el.textContent;
        el.replaceWith(a);
      } else {
        el.href = instaUrl;
      }
    } else {
      if (el.tagName === 'A') {
        const span = document.createElement('span');
        span.className = 'footer-insta';
        span.textContent = el.textContent;
        el.replaceWith(span);
      }
    }
  });
}

export function renderAbout() {
  const blocks = config.DB.contentBlocks || {};
  const aboutEl = document.getElementById('about-text');
  if (aboutEl) {
    const raw = blocks.about_text ?? (blocks.about_intro ? (blocks.about_intro + (blocks.about_secondary ? '\n\n' + blocks.about_secondary : '')) : null);
    if (raw != null) aboutEl.innerHTML = String(raw).replace(/\n/g, '<br>');
  }
  const confInfoCard = document.querySelector('#page-about .conf-info-card');
  if (!confInfoCard) return;
  const confAccordionWrap = confInfoCard.querySelector('.conf-accordion')?.parentNode;
  if (!confAccordionWrap) return;
  const conferences = getConferences();
  let taglinesMap = {};
  try {
    const raw = blocks.about_conf_taglines;
    if (raw && typeof raw === 'string') taglinesMap = JSON.parse(raw) || {};
    else if (raw && typeof raw === 'object') taglinesMap = raw;
  } catch (_) {}
  const accordionColors = ['#c8a84b', '#2fa89a', '#a78bfa', '#f59e0b'];
  const accordionsHtml = conferences.map((c, i) => {
    const confId = c.id || c.name;
    const slug = String(confId).toLowerCase().replace(/\W+/g, '_');
    const customTagline = taglinesMap[slug] ?? taglinesMap[confId];
    const defaultTagline = (() => {
      const fullLabel = confLabel(confId);
      const match = fullLabel && fullLabel.match(/^(.+?)\s+(\w+)\s+Conference$/);
      const derivedSponsor = match && match[1] && !/^(Mecca|Medina)$/i.test(match[1]) ? match[1].trim() : null;
      const sp = derivedSponsor || (i === 0 ? config.SP2A : i === 1 ? config.SP2B : null);
      const confName = confShortLabel(confId);
      return sp ? `${confName} Conference — Brought to you by ${sp}` : '';
    })();
    const taglineText = (customTagline != null && String(customTagline).trim() !== '') ? String(customTagline) : defaultTagline;
    const taglineHtml = taglineText ? `<div class="about-conf-tagline" id="about-conf-tagline-${slug}" data-conf-slug="${slug}" style="font-size:0.75rem;color:#c8a84b;font-style:italic;margin-bottom:0.5rem;white-space:pre-wrap;">${highlightSponsor(taglineText).replace(/\n/g, '<br>')}</div>` : `<div class="about-conf-tagline" id="about-conf-tagline-${slug}" data-conf-slug="${slug}" style="font-size:0.75rem;color:#c8a84b;font-style:italic;margin-bottom:0.5rem;min-height:1.2em;"></div>`;
    const teams = (config.DB.teams || []).filter(t => t.conf === confId).map(t => `<div class="conf-team-bullet">${t.name}</div>`).join('');
    const color = accordionColors[i % accordionColors.length];
    return `<div class="conf-accordion"><div class="conf-acc-header" onclick="toggleAcc('${slug}')"><div class="conf-acc-title"><div class="conf-dot" style="background:${color}"></div><span id="about-${slug}-label">${confLabel(confId)}</span></div><span class="conf-acc-arrow" id="arrow-${slug}">▾</span></div><div class="conf-acc-body" id="body-${slug}">${taglineHtml}${teams}</div></div>`;
  }).join('');
  const existingAccordions = confInfoCard.querySelectorAll('.conf-accordion');
  existingAccordions.forEach(el => el.remove());
  confInfoCard.insertAdjacentHTML('beforeend', accordionsHtml);
}

export function renderDraft(adminMode = false) {
  const blocks = config.DB.contentBlocks || {};
  const teams = config.DB.teams || [];
  const draftBank = config.DB.draftBank || [];
  const draftTeamOrder = config.DB.draftTeamOrder || [];
  const confIds = new Set(getConferences().map(c => c.id || c.name));
  const confTeams = teams.filter(t => confIds.has(t.conf));
  const teamMap = {};
  confTeams.forEach(t => { teamMap[t.id] = t; });

  const placeholderEl = document.getElementById('draft-placeholder');
  const placeholderCard = document.getElementById('draft-placeholder-card');
  const boardWrap = document.getElementById('draft-board-wrap');
  const bankEl = document.getElementById('draft-bank');

  if (placeholderEl) placeholderEl.textContent = blocks.draft_placeholder != null ? blocks.draft_placeholder : 'Draft board coming soon.';

  if (confTeams.length === 0) {
    if (placeholderCard) placeholderCard.style.display = 'block';
    if (boardWrap) { boardWrap.innerHTML = ''; boardWrap.style.display = 'none'; }
    if (bankEl) bankEl.style.display = 'none';
    return;
  }

  if (placeholderCard) placeholderCard.style.display = 'none';
  if (boardWrap) boardWrap.style.display = 'block';

  const validOrderIds = [...new Set(draftTeamOrder)].filter(id => teamMap[id]);
  const orderedTeams = validOrderIds.length > 0
    ? validOrderIds.map(id => teamMap[id]).filter(Boolean)
    : confTeams.slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  const teamCardsHtml = orderedTeams.map(t => {
    const roster = t.roster || [];
    const captainName = (t.captain || '').trim();
    const captainPlayer = captainName ? roster.find(p => String(p.name || '').trim().toLowerCase() === captainName.toLowerCase()) : null;
    const captainSlotAttrs = adminMode ? ` data-drop-zone="captain" data-team-id="${escapeHtmlAttr(t.id)}"` : '';
    const captainContent = adminMode
      ? (captainPlayer
        ? `Captain: <span class="draft-player-chip draft-captain-chip" draggable="true" data-player-id="${escapeHtmlAttr(captainPlayer.id)}" data-team-id="${escapeHtmlAttr(t.id)}">${escapeHtmlAttr(captainPlayer.name)}${captainPlayer.jersey_number != null ? escapeHtmlAttr(` #${captainPlayer.jersey_number}`) : ''}</span>`
        : `Captain: <span class="draft-captain-placeholder">—</span>`)
      : `Captain: ${escapeHtmlAttr(captainPlayer ? captainPlayer.name : '—')}`;
    const playerRowsHtml = roster.filter(p => !captainPlayer || p.id !== captainPlayer.id).map(p => {
      const j = p.jersey_number != null ? ` #${p.jersey_number}` : '';
      const drag = adminMode ? ' draggable="true"' : '';
      return `<tr><td><span class="draft-player-chip"${drag} data-player-id="${escapeHtmlAttr(p.id)}" data-team-id="${escapeHtmlAttr(t.id)}">${escapeHtmlAttr(p.name)}${escapeHtmlAttr(j)}</span></td></tr>`;
    }).join('');
    const dropZone = adminMode ? ` data-drop-zone="team" data-team-id="${escapeHtmlAttr(t.id)}"` : '';
    return `<div class="draft-team-card" data-team-id="${escapeHtmlAttr(t.id)}" data-drop-zone="team">
      <div class="draft-team-logo-placeholder"></div>
      <table class="draft-team-table">
        <thead><tr><th class="draft-team-drag-handle" data-team-id="${escapeHtmlAttr(t.id)}">${escapeHtmlAttr(t.name)}</th></tr></thead>
        <tbody${dropZone}>
          <tr class="draft-captain-row"><td${captainSlotAttrs}>${captainContent}</td></tr>
          ${playerRowsHtml || '<tr><td class="box-score-empty">No players yet</td></tr>'}
        </tbody>
      </table>
      <div class="draft-drafting-now" data-team-id="${escapeHtmlAttr(t.id)}" style="display:none;">DRAFTING NOW</div>
    </div>`;
  }).join('');

  boardWrap.innerHTML = `<div class="draft-board">${teamCardsHtml}</div>`;

  if (adminMode) {
    let bankHtml = '<div class="draft-bank"><div class="draft-bank-label">Player Bank</div><div class="draft-bank-chips">';
    if (draftBank.length === 0) {
      bankHtml += '<span class="box-score-empty">All players assigned</span>';
    } else {
      draftBank.forEach(p => {
        const j = p.jersey_number != null ? ` #${p.jersey_number}` : '';
        bankHtml += `<span class="draft-player-chip" draggable="true" data-player-id="${escapeHtmlAttr(p.id)}" data-source="bank">${escapeHtmlAttr(p.name)}${escapeHtmlAttr(j)}</span>`;
      });
    }
    bankHtml += '</div></div>';

    if (bankEl) {
      bankEl.innerHTML = bankHtml;
      bankEl.style.display = 'block';
      bankEl.dataset.dropZone = 'bank';
    }
  } else if (bankEl) {
    bankEl.style.display = 'none';
  }

  updateDraftDisplay(adminMode);
}

function updateDraftDisplay(adminMode) {
  const blocks = config.DB?.contentBlocks || {};
  const running = blocks.draft_running === 'true' && blocks.draft_paused !== 'true';
  const remaining = parseInt(blocks.draft_remaining_seconds, 10);
  const sec = Number.isFinite(remaining) ? Math.max(0, remaining) : 60;
  const currentPick = parseInt(blocks.draft_current_pick, 10) || 0;
  const rounds = parseInt(blocks.draft_rounds, 10) || 7;
  const order = (config.DB?.draftTeamOrder?.length ? config.DB.draftTeamOrder : null)
    || (config.DB?.teams || []).slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).map(t => t.id);
  const teamCount = order.length;
  const totalPicks = teamCount * rounds;
  let currentTeamId = null;
  if (teamCount > 0 && currentPick < totalPicks) {
    const r = Math.floor(currentPick / teamCount);
    const pos = currentPick % teamCount;
    const forward = r % 2 === 0;
    const idx = forward ? pos : teamCount - 1 - pos;
    currentTeamId = order[idx] || null;
  }
  const timerEl = document.getElementById('draft-timer');
  const timerWrap = document.getElementById('draft-timer-wrap');
  const adminControls = document.getElementById('draft-admin-controls');
  const addPlayersWrap = document.getElementById('draft-add-players-wrap');
  if (timerEl) timerEl.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  if (timerWrap) timerWrap.style.display = running ? 'flex' : 'none';
  if (adminControls) adminControls.style.display = adminMode ? 'flex' : 'none';
  if (addPlayersWrap) addPlayersWrap.style.display = adminMode ? 'block' : 'none';
  document.querySelectorAll('.draft-drafting-now').forEach((el) => {
    el.style.display = el.dataset.teamId === currentTeamId && running ? 'block' : 'none';
  });
}

export function toggleAcc(conf) {
  const bodyEl = document.getElementById('body-' + conf);
  const arrowEl = document.getElementById('arrow-' + conf);
  if (bodyEl) bodyEl.classList.toggle('open');
  if (arrowEl) arrowEl.classList.toggle('open');
}
