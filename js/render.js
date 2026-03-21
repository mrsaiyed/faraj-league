/**
 * Faraj League render layer — DOM updates.
 */

import { config } from './config.js';
import { confLabel, motmLabel, akhlaqLabel, statsTitle } from './config.js';

let activeTeam = null;

function initials(n) { return n.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase(); }
function pending() { return `<span class="pending">Pending</span>`; }
function getWeeksPlayed() { return new Set(config.DB.scores.filter(g => g.s1 !== '' && g.s2 !== '').map(g => g.week)).size; }
function calcStandings() {
  const rec = {};
  config.DB.teams.forEach(t => { rec[t.name] = { w: 0, l: 0, pf: 0, pa: 0, conf: t.conf, id: t.id }; });
  config.DB.scores.forEach(g => {
    if (!g.s1 || !g.s2 || !rec[g.t1] || !rec[g.t2]) return;
    const s1 = parseInt(g.s1), s2 = parseInt(g.s2);
    rec[g.t1].pf += s1; rec[g.t1].pa += s2; rec[g.t2].pf += s2; rec[g.t2].pa += s1;
    if (s1 > s2) { rec[g.t1].w++; rec[g.t2].l++; } else { rec[g.t2].w++; rec[g.t1].l++; }
  });
  return rec;
}
function buildWeekDropdown(elId, includeAll) {
  const el = document.getElementById(elId); if (!el) return; el.innerHTML = '';
  if (includeAll) el.innerHTML += `<option value="all">All Weeks</option>`;
  for (let w = 1; w <= config.TOTAL_WEEKS; w++) el.innerHTML += `<option value="${w}">Week ${w}${w === config.CURRENT_WEEK ? ' (Current)' : ''}</option>`;
}

export function renderAll() {
  const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  set('conf-header-mecca', confLabel('Mecca'));
  set('conf-header-medina', confLabel('Medina'));
  set('stats-page-title', statsTitle());
  set('about-mecca-label', confLabel('Mecca'));
  set('about-medina-label', confLabel('Medina'));
  set('home-standings-title', 'Standings');
  set('home-standings-sub', config.currentSeasonLabel);
  set('standings-section-sub', config.currentSeasonLabel);
  set('teams-section-sub', `${config.currentSeasonLabel} · ${config.DB.teams?.length || 6} Teams`);
  set('stats-section-sub', `${config.currentSeasonLabel} · Points Only`);
  set('draft-section-sub', config.currentSeasonLabel);
  set('sponsors-section-sub', config.currentSeasonLabel);
  set('about-conf-title', `${config.currentSeasonLabel} Structure`);
  const heroBadge = document.getElementById('hero-badge');
  if (heroBadge) heroBadge.textContent = `${config.currentSeasonLabel} · Inaugural Season`;

  const banner = document.getElementById('title-sponsor-banner');
  if (banner) {
    if (config.SP1) banner.innerHTML = `<div class="title-sponsor-bar">${config.SP1_LOGO ? `<img src="${config.SP1_LOGO}" class="title-sponsor-logo" alt="${config.SP1} logo">` : ''}  <div><div class="title-sponsor-eyebrow">Presented by</div><div class="title-sponsor-name">${config.SP1}</div></div></div>`;
    else banner.innerHTML = `<p class="hero-sub">Mecca & Medina Conferences</p>`;
  }

  set('sponsor-title-name', config.SP1 || 'Sponsor name');
  set('sponsor-title-desc', config.SP1 ? 'Details, social media, and website link will appear here once confirmed.' : 'Details, social media, and website link will appear here once confirmed.');
  set('sponsor-mecca-name', config.SP2A || 'Conference Sponsor 1');
  set('sponsor-mecca-desc', config.SP2A ? 'Details, social media, and website link will appear here once confirmed.' : 'Details, social media, and website link will appear here once confirmed.');
  set('sponsor-medina-name', config.SP2B || 'Conference Sponsor 2');
  set('sponsor-medina-desc', config.SP2B ? 'Details, social media, and website link will appear here once confirmed.' : 'Details, social media, and website link will appear here once confirmed.');

  const sa = config.DB.awards?.find(a => a.champ);
  const showHistoric = !config.currentSeasonIsCurrent || (sa && sa.champ);
  const hb = document.getElementById('historic-banner');
  if (hb) hb.style.display = showHistoric ? 'block' : 'none';
  if (showHistoric && sa) {
    document.getElementById('hb-champ').textContent = sa.champ || '—';
    document.getElementById('hb-mvp').textContent = sa.mvp || '—';
    document.getElementById('hb-scoring').textContent = sa.scoring || '—';
  }

  buildWeekDropdown('scores-week-select', true);
  buildWeekDropdown('awards-week-select', false);
  buildWeekDropdown('media-week-select', true);
  document.getElementById('media-week-select').value = String(config.CURRENT_WEEK);
  renderHome();
  renderStandings();
  renderTeams();
  renderStats();
  renderAwards(config.CURRENT_WEEK);
  renderScores('all');
  renderMedia(config.CURRENT_WEEK);
  renderAbout();
}

export function renderHome() {
  const wp = getWeeksPlayed();
  document.getElementById('weeks-played').textContent = wp;
  const dw = wp > 0 ? wp : 1;
  const weekGames = config.DB.scores.filter(g => g.week === dw);
  const wa = config.DB.awards.find(a => a.week === dw) || {};
  const t = config.DB.teams;
  document.getElementById('home-matchup-sub').textContent = `Week ${dw} · ${wp > 0 ? 'Results' : 'Upcoming'}`;
  document.getElementById('home-awards-sub').textContent = `Week ${dw} · Latest`;

  const rec = calcStandings();
  document.getElementById('home-standings').innerHTML = ['Mecca', 'Medina'].map(conf => {
    const rows = config.DB.teams.filter(t => t.conf === conf).map(t => ({ ...rec[t.name] || { w: 0, l: 0 }, name: t.name })).sort((a, b) => b.w - a.w || (b.pf - b.pa) - (a.pf - a.pa));
    return `<div class="home-conf-block"><div class="home-conf-title">${confLabel(conf)}</div>${rows.map((r, i) => `<div class="home-stand-row"><span class="home-stand-rank">${i + 1}</span><span class="home-stand-name">${r.name}</span><span class="home-stand-rec">${r.w}-${r.l}</span></div>`).join('')}</div>`;
  }).join('');

  const games = weekGames.length ? weekGames : [
    { game: 1, t1: t[0]?.name || 'TBD', t2: t[3]?.name || 'TBD', s1: '', s2: '' },
    { game: 2, t1: t[1]?.name || 'TBD', t2: t[4]?.name || 'TBD', s1: '', s2: '' },
    { game: 3, t1: t[2]?.name || 'TBD', t2: t[5]?.name || 'TBD', s1: '', s2: '' },
  ];
  document.getElementById('home-matchups').innerHTML = games.map((g, i) => {
    const played = g.s1 !== '' && g.s2 !== '';
    const s1 = parseInt(g.s1 || 0), s2 = parseInt(g.s2 || 0), w1 = played && s1 > s2, w2 = played && s2 > s1;
    return `<div class="matchup-card"><div class="matchup-game-label">Game ${g.game || i + 1}</div><div class="matchup-row"><span class="matchup-team ${w1 ? 'winner' : ''}">${g.t1}</span><span class="matchup-score ${w1 ? 'winner' : ''}">${played ? g.s1 : 'TBD'}</span></div><div class="matchup-mid"></div><div class="matchup-row"><span class="matchup-team ${w2 ? 'winner' : ''}">${g.t2}</span><span class="matchup-score ${w2 ? 'winner' : ''}">${played ? g.s2 : 'TBD'}</span></div><div class="winner-tag" style="${played ? '' : 'color:#c8c0b0;font-style:italic'}">${played ? (s1 > s2 ? g.t1 + ' Win' : g.t2 + ' Win') : 'Not yet played'}</div></div>`;
  }).join('');
  document.getElementById('home-awards').innerHTML = `
    <div class="award-card akhlaq-card"><div class="akhlaq-inner"><div class="akhlaq-medal">☽</div><div><div class="award-label">${akhlaqLabel(dw)}</div><div class="award-winner">${wa.akhlaq || pending()}</div><div class="award-winner-sub">Exemplary character & brotherhood</div></div></div></div>
    ${games.map((g, i) => `<div class="award-card"><div class="award-label">${motmLabel(g.game || i + 1)}</div><div class="award-game">${g.t1} vs ${g.t2}</div><div class="award-winner">${wa['motm' + (g.game || i + 1)] || pending()}</div></div>`).join('')}`;
}

export function renderStandings() {
  const rec = calcStandings();
  const idAttr = (id) => typeof id === 'string' ? `'${String(id).replace(/'/g, "\\'")}'` : id;
  ['Mecca', 'Medina'].forEach(conf => {
    const tbody = document.getElementById(conf.toLowerCase() + '-standings');
    const rows = config.DB.teams.filter(t => t.conf === conf).map(t => ({ ...rec[t.name] || { w: 0, l: 0, pf: 0, pa: 0 }, name: t.name, id: t.id })).sort((a, b) => b.w - a.w || (b.pf - b.pa) - (a.pf - a.pa));
    tbody.innerHTML = rows.map((r, i) => `<tr><td style="color:#c8c0b0;font-size:0.82rem">${i + 1}</td><td><span class="team-link" onclick="goToTeam(${idAttr(r.id)})">${r.name}</span></td><td>${r.w}</td><td>${r.l}</td><td>${r.pf || '—'}</td><td>${r.pa || '—'}</td></tr>`).join('');
  });
}

export function renderScores(week) {
  const el = document.getElementById('scores-content');
  const rw = w => {
    const games = config.DB.scores.filter(g => g.week === w);
    if (!games.length || games.every(g => !g.s1 && !g.s2)) return `<div class="card" style="text-align:center;padding:1.4rem;margin-bottom:0.9rem;"><div style="font-size:0.9rem;color:#c8c0b0;font-style:italic;">Week ${w} — No results yet.</div></div>`;
    return `<div style="margin-bottom:1.1rem;"><div style="font-family:'Cinzel',serif;font-size:0.84rem;letter-spacing:0.18em;text-transform:uppercase;color:#c8a84b;margin-bottom:0.7rem;">Week ${w}${w == config.CURRENT_WEEK ? ' — Current' : ''}</div><div class="matchups-grid">${games.map(g => { const played = g.s1 !== '' && g.s2 !== ''; const s1 = parseInt(g.s1 || 0), s2 = parseInt(g.s2 || 0), w1 = played && s1 > s2, w2 = played && s2 > s1; return `<div class="matchup-card"><div class="matchup-game-label">Game ${g.game}</div><div class="matchup-row"><span class="matchup-team ${w1 ? 'winner' : ''}">${g.t1}</span><span class="matchup-score ${w1 ? 'winner' : ''}">${played ? g.s1 : '—'}</span></div><div class="matchup-mid"></div><div class="matchup-row"><span class="matchup-team ${w2 ? 'winner' : ''}">${g.t2}</span><span class="matchup-score ${w2 ? 'winner' : ''}">${played ? g.s2 : '—'}</span></div><div class="winner-tag" style="${played ? '' : 'color:#c8c0b0'}">${played ? (s1 > s2 ? g.t1 + ' Win' : g.t2 + ' Win') : 'Not played'}</div></div>`; }).join('')}</div></div>`;
  };
  el.innerHTML = week === 'all' ? Array.from({ length: config.TOTAL_WEEKS }, (_, i) => rw(i + 1)).join('') : rw(parseInt(week));
}

export function renderTeams() {
  const rec = calcStandings();
  const idAttr = (id) => typeof id === 'string' ? `'${String(id).replace(/'/g, "\\'")}'` : id;
  const teamCard = t => `<div class="team-card" id="tc-${t.id}" onclick="toggleRoster(${idAttr(t.id)})"><div class="team-emblem">${initials(t.name)}</div><div class="team-name">${t.name}</div><div class="team-captain">Capt: ${t.captain}</div><div class="team-record">${rec[t.name] ? rec[t.name].w + '-' + rec[t.name].l : '0-0'}</div></div>`;
  document.getElementById('teams-grid').innerHTML = ['Mecca', 'Medina'].map(conf => `
    <div style="margin-bottom:1.6rem;">
      <div style="font-family:'Cinzel',serif;font-size:0.82rem;letter-spacing:0.18em;text-transform:uppercase;color:#c8a84b;margin-bottom:0.75rem;padding-bottom:0.35rem;border-bottom:1px solid rgba(200,168,75,0.2);">${confLabel(conf)}</div>
      <div class="teams-grid">${config.DB.teams.filter(t => t.conf === conf).map(teamCard).join('')}</div>
    </div>`).join('');
}

export function toggleRoster(id) {
  const panel = document.getElementById('roster-panel');
  document.querySelectorAll('.team-card').forEach(c => c.classList.remove('selected'));
  if (activeTeam === id) { closeRoster(); return; }
  activeTeam = id;
  const t = config.DB.teams.find(x => x.id === id), rec = calcStandings();
  if (!t) return;
  const tc = document.getElementById('tc-' + id);
  if (tc) tc.classList.add('selected');
  document.getElementById('roster-content').innerHTML = `<div style="margin-bottom:0.9rem;"><div style="font-family:'Cinzel',serif;font-size:1rem;color:#c8a84b">${t.name}</div><div style="font-size:0.8rem;color:#2fa89a;letter-spacing:0.1em;text-transform:uppercase;margin-top:0.12rem">${t.conf} Conference · Capt: ${t.captain} · ${rec[t.name] ? rec[t.name].w + '-' + rec[t.name].l : '0-0'}</div></div>${[t.captain, ...(t.players || [])].map((p, i) => '<div class="roster-player"><span class="roster-num">' + (i + 1) + '</span>' + p + '</div>').join('')}`;
  panel.classList.add('open');
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

export function closeRoster() {
  activeTeam = null;
  document.querySelectorAll('.team-card').forEach(c => c.classList.remove('selected'));
  document.getElementById('roster-panel').classList.remove('open');
}

export function renderStats() {
  const tbody = document.getElementById('stats-body');
  const rows = config.DB.stats.filter(s => s.total > 0).sort((a, b) => b.total - a.total);
  if (!rows.length) { tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:1.8rem;font-style:italic;color:#c8c0b0;font-size:0.9rem;">No stats yet — season hasn't started.</td></tr>`; return; }
  tbody.innerHTML = rows.map((r, i) => `<tr><td style="padding:0.7rem 1rem;color:#c8c0b0;font-size:0.82rem">${i + 1}</td><td style="padding:0.7rem 1rem;color:#f5f0e8">${r.name}</td><td style="padding:0.7rem 1rem">${r.team}</td><td style="padding:0.7rem 1rem">${r.gp}</td><td style="padding:0.7rem 1rem;color:#c8a84b">${r.gp ? (r.total / r.gp).toFixed(1) : '0.0'}</td><td style="padding:0.7rem 1rem">${r.total}</td></tr>`).join('');
}

export function renderAwards(week) {
  const w = parseInt(week), wa = config.DB.awards.find(a => a.week === w) || {};
  const games = config.DB.scores.filter(g => g.week === w);
  const g1 = games[0] || { t1: 'TBD', t2: 'TBD' }, g2 = games[1] || { t1: 'TBD', t2: 'TBD' }, g3 = games[2] || { t1: 'TBD', t2: 'TBD' };
  document.getElementById('awards-grid').innerHTML = `
    <div class="award-card akhlaq-card"><div class="akhlaq-inner"><div class="akhlaq-medal">☽</div><div><div class="award-label">${akhlaqLabel(w)}</div><div class="award-winner">${wa.akhlaq || pending()}</div><div class="award-winner-sub">Exemplary character & brotherhood on and off the court</div></div></div></div>
    <div class="award-card"><div class="award-label">${motmLabel(1)}</div><div class="award-game">${g1.t1} vs ${g1.t2}</div><div class="award-winner">${wa.motm1 || pending()}</div></div>
    <div class="award-card"><div class="award-label">${motmLabel(2)}</div><div class="award-game">${g2.t1} vs ${g2.t2}</div><div class="award-winner">${wa.motm2 || pending()}</div></div>
    <div class="award-card"><div class="award-label">${motmLabel(3)}</div><div class="award-game">${g3.t1} vs ${g3.t2}</div><div class="award-winner">${wa.motm3 || pending()}</div></div>`;
  const sa = config.DB.awards.find(a => a.champ) || {};
  document.getElementById('sa-champ').textContent = sa.champ || `${config.currentSeasonLabel} — In Progress`;
  document.getElementById('sa-mvp').textContent = sa.mvp || 'Season in progress';
  document.getElementById('sa-scoring').textContent = sa.scoring || 'Season in progress';
}

export function renderMedia(week) {
  const ws = week === 'all' ? Array.from({ length: config.TOTAL_WEEKS }, (_, i) => i + 1) : [parseInt(week)];
  const soon = `<div class="video-title" style="font-style:italic;">Coming soon</div>`;
  document.getElementById('media-content').innerHTML = ws.map(w => `<div style="margin-bottom:1.8rem;"><div class="media-week-label">Week ${w}${w === config.CURRENT_WEEK ? ' — Current' : ''}</div><div class="media-section-title">Top Plays of the Week</div><div class="media-grid" style="grid-template-columns:1fr;"><div class="video-card"><div class="video-icon">▶</div><div class="video-label">Top Plays · Week ${w}</div>${soon}<button class="insta-btn">View on Instagram</button></div></div><div class="media-section-title">Baseline Breakdown</div><div class="media-grid">${[1, 2, 3].map(ep => `<div class="video-card"><div class="video-icon">▶</div><div class="video-label">Episode ${ep}</div>${soon}<button class="insta-btn">View on Instagram</button></div>`).join('')}</div><div class="media-section-title">Match Highlights</div><div class="media-grid">${[1, 2, 3].map(g => `<div class="video-card"><div class="video-icon">▶</div><div class="video-label">Game ${g} Highlights</div>${soon}<button class="insta-btn">View on Instagram</button></div>`).join('')}</div></div>`).join('');
}

export function renderAbout() {
  ['mecca', 'medina'].forEach(conf => {
    const el = document.getElementById('body-' + conf);
    const confName = conf.charAt(0).toUpperCase() + conf.slice(1);
    const sp = conf === 'mecca' ? config.SP2A : config.SP2B;
    const tagline = sp ? `<div style="font-size:0.75rem;color:#c8a84b;font-style:italic;margin-bottom:0.5rem;">${confName} Conference — Brought to you by ${sp}</div>` : '';
    el.innerHTML = tagline + config.DB.teams.filter(t => t.conf === confName).map(t => `<div class="conf-team-bullet">${t.name}</div>`).join('');
  });
}

export function toggleAcc(conf) {
  document.getElementById('body-' + conf).classList.toggle('open');
  document.getElementById('arrow-' + conf).classList.toggle('open');
}
