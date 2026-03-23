/**
 * Faraj League Admin — login, visual mirror layout, edit overlays.
 * Same structure as public site; floating Admin drawer for season settings and logout.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js';
import { config } from '../../js/config.js';
import { fetchSeasons, fetchSeasonData, deriveWeeks, applySponsorOverrides } from '../../js/data.js';
import {
  renderAll,
  renderSchedule,
  renderScores,
  renderAwards,
  renderMedia,
  renderDraft,
  toggleAcc,
  closeRoster,
  toggleRoster,
  openBoxScoreFullscreen,
  closeBoxScoreFullscreen,
} from '../../js/render.js';

const TOKEN_KEY = 'faraj_admin_token';
const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

function isTokenValid(token) {
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp && payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

async function login(password) {
  const res = await fetch(`${config.SUPABASE_URL}/functions/v1/auth-login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Login failed');
  return data.token;
}

async function adminFetch(fnName, options = {}) {
  const token = getToken();
  if (!token) throw new Error('Not authenticated');
  const res = await fetch(`${config.SUPABASE_URL}/functions/v1/${fnName}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.SUPABASE_ANON_KEY}`,
      'X-Admin-Token': token,
      ...options.headers,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
  return data;
}

async function adminFetchBlob(fnName, body) {
  const token = getToken();
  if (!token) throw new Error('Not authenticated');
  const res = await fetch(`${config.SUPABASE_URL}/functions/v1/${fnName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.SUPABASE_ANON_KEY}`,
      'X-Admin-Token': token,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Request failed: ${res.status}`);
  }
  const blob = await res.blob();
  const cd = res.headers.get('Content-Disposition');
  const filenameMatch = cd && cd.match(/filename="?([^";\n]+)"?/);
  return { blob, filename: filenameMatch ? filenameMatch[1].trim() : null };
}

function showLogin() {
  document.getElementById('admin-login-view').style.display = 'flex';
  document.getElementById('admin-dashboard-view').style.display = 'none';
}

function showDashboard() {
  document.getElementById('admin-login-view').style.display = 'none';
  document.getElementById('admin-dashboard-view').style.display = 'block';
}

async function adminShowPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
  const page = document.getElementById('page-' + id);
  const tab = document.querySelector(`.nav-tab[data-page="${id}"]`);
  if (page) page.classList.add('active');
  if (tab) tab.classList.add('active');
  window.scrollTo(0, 0);
  if (id === 'media') {
    const { attachMediaSlotOverlays } = await import('./sections.js');
    attachMediaSlotOverlays({
      adminFetch,
      supabase,
      getToken,
      onMediaSaved: async () => {
        await loadAdminSeason(window.adminSeasonSlug);
        renderAll(true);
        initAdminOverlays();
      },
    });
  }
  if (id === 'awards') {
    const sel = document.getElementById('awards-week-select');
    const week = sel ? (parseInt(sel.value, 10) || config.CURRENT_WEEK) : config.CURRENT_WEEK;
    if (typeof window.renderAwards === 'function') window.renderAwards(week);
  }
  if (id === 'players') {
    const content = document.getElementById('players-content');
    const sub = document.getElementById('players-section-sub');
    if (sub) sub.textContent = config.currentSeasonLabel || 'Spring 2026';
    if (content) {
      import('./sections.js').then(async ({ renderPlayers }) => {
        await renderPlayers(content, {
          adminFetch,
          supabase,
          getToken,
          onPlayersChanged: async () => {
            await loadAdminSeason(window.adminSeasonSlug);
            renderAll(true);
            initAdminOverlays();
          },
        });
      });
    }
  }
}

async function loadAdminSeason(slug) {
  const dataRes = await fetchSeasonData(slug);
  if (dataRes.error || !dataRes.data) return false;
  const { season, teams, scores, awards, stats, gameStatValues, statDefinitions, sponsorOverrides, sponsors, mediaItems, mediaSlots, contentBlocks, draftBank, draftTeamOrder } = dataRes.data;
  config.DB = { teams, scores, awards, stats, gameStatValues: gameStatValues || {}, statDefinitions: statDefinitions || [], sponsors: sponsors || [], mediaItems: mediaItems || [], mediaSlots: mediaSlots || {}, contentBlocks: contentBlocks || {}, draftBank: draftBank || [], draftTeamOrder: draftTeamOrder || [] };
  applySponsorOverrides(sponsorOverrides);
  const derived = deriveWeeks(scores);
  config.TOTAL_WEEKS = derived.TOTAL_WEEKS;
  config.CURRENT_WEEK = season?.current_week != null ? season.current_week : derived.CURRENT_WEEK;
  config.currentSeasonLabel = season?.label || 'Spring 2026';
  config.currentSeasonSlug = season?.slug || slug;
  config.currentSeasonIsCurrent = season?.is_current ?? true;
  window.adminSeasonId = season?.id;
  window.adminSeasonSlug = slug;
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
  return true;
}

function adminChangeSeason(slug) {
  if (!slug) return;
  loadAdminSeason(slug).then(ok => {
    if (ok) {
      renderAll(true);
      initAdminOverlays();
    }
  });
}

function openDrawer() {
  document.getElementById('admin-drawer-backdrop').classList.add('open');
  document.getElementById('admin-drawer').classList.add('open');
  renderSeasonSettingsInDrawer();
}

function closeDrawer() {
  document.getElementById('admin-drawer-backdrop').classList.remove('open');
  document.getElementById('admin-drawer').classList.remove('open');
}

async function renderSeasonSettingsInDrawer() {
  const content = document.getElementById('admin-season-settings-content');
  if (!content) return;
  const sections = await import('./sections.js');
  await sections.renderSeasons(content, { adminFetch, supabase, getToken });
}

async function initAdminOverlays() {
  const { attachEditOverlay } = await import('./edit-overlays.js');
  const { attachScheduleAdminOverlays } = await import('./sections.js');
  const seasonId = window.adminSeasonId;
  if (!seasonId) return;

  const saveContent = (key, value) => adminFetch('admin-content', {
    method: 'POST',
    body: JSON.stringify([{ key, value, season_id: seasonId }]),
  });

  const updateContentAndRender = (key, val) => {
    if (!config.DB.contentBlocks) config.DB.contentBlocks = {};
    config.DB.contentBlocks[key] = val;
    renderAll(true);
    initAdminOverlays();
  };

  const heroBadge = document.getElementById('hero-badge');
  if (heroBadge && !heroBadge.dataset.adminOverlayAttached) {
    heroBadge.dataset.adminOverlayAttached = '1';
    attachEditOverlay({
      element: heroBadge,
      key: 'hero_badge',
      getValue: () => heroBadge.textContent || '',
      saveFn: (val) => saveContent('hero_badge', val),
      contentType: 'text',
      onSaved: updateContentAndRender,
    });
  }

  const seasonTag = document.getElementById('season-tag');
  if (seasonTag && !seasonTag.dataset.adminOverlayAttached) {
    seasonTag.dataset.adminOverlayAttached = '1';
    attachEditOverlay({
      element: seasonTag,
      key: 'season_tag',
      getValue: () => seasonTag.textContent || '',
      saveFn: (val) => saveContent('season_tag', val),
      contentType: 'text',
      onSaved: updateContentAndRender,
    });
  }

  const aboutText = document.getElementById('about-text');
  if (aboutText && !aboutText.dataset.adminOverlayAttached) {
    aboutText.dataset.adminOverlayAttached = '1';
    attachEditOverlay({
      element: aboutText,
      key: 'about_text',
      getValue: () => (aboutText.innerText || '').replace(/\r\n/g, '\n'),
      saveFn: (val) => saveContent('about_text', val),
      contentType: 'richtext',
      onSaved: updateContentAndRender,
    });
  }

  // About: conference tagline edit overlays (inside accordion dropdowns)
  document.querySelectorAll('#page-about .about-conf-tagline').forEach((taglineEl) => {
    if (taglineEl.dataset.taglineOverlayAttached) return;
    taglineEl.dataset.taglineOverlayAttached = '1';
    const slug = taglineEl.dataset.confSlug || taglineEl.id?.replace('about-conf-tagline-', '') || '';
    if (!slug) return;
    attachEditOverlay({
      element: taglineEl,
      key: 'about_conf_tagline_' + slug,
      getValue: () => (taglineEl.innerText || '').replace(/\r\n/g, '\n'),
      saveFn: async (val) => {
        let taglinesMap = {};
        try {
          const raw = config.DB?.contentBlocks?.about_conf_taglines;
          if (raw && typeof raw === 'string') taglinesMap = JSON.parse(raw) || {};
          else if (raw && typeof raw === 'object') taglinesMap = raw;
        } catch (_) {}
        taglinesMap[slug] = val;
        await adminFetch('admin-content', { method: 'POST', body: JSON.stringify([{ key: 'about_conf_taglines', value: JSON.stringify(taglinesMap), season_id: seasonId }]) });
        if (!config.DB.contentBlocks) config.DB.contentBlocks = {};
        config.DB.contentBlocks.about_conf_taglines = JSON.stringify(taglinesMap);
      },
      contentType: 'richtext',
      onSaved: updateContentAndRender,
    });
  });

  // About: link to Teams for conference editing
  const aboutConfCard = document.querySelector('#page-about .conf-info-card');
  if (aboutConfCard && !document.getElementById('admin-about-teams-link')) {
    const link = document.createElement('a');
    link.id = 'admin-about-teams-link';
    link.href = '#';
    link.textContent = 'Edit teams';
    link.style.cssText = 'display:inline-block;margin-top:0.5rem;font-size:0.85rem;color:#c8a84b;';
    link.onclick = (e) => { e.preventDefault(); adminShowPage('teams'); };
    aboutConfCard.appendChild(link);
  }

  const draftPlaceholder = document.getElementById('draft-placeholder');
  if (draftPlaceholder && !draftPlaceholder.dataset.adminOverlayAttached) {
    draftPlaceholder.dataset.adminOverlayAttached = '1';
    attachEditOverlay({
      element: draftPlaceholder,
      key: 'draft_placeholder',
      getValue: () => draftPlaceholder.textContent || '',
      saveFn: (val) => saveContent('draft_placeholder', val),
      contentType: 'text',
      onSaved: updateContentAndRender,
    });
  }

  // Draft: drag-and-drop (players, team order via Sortable.js)
  const onDraftSaved = async () => {
    await loadAdminSeason(window.adminSeasonSlug);
    renderAll(true);
    initAdminOverlays();
  };
  const onDraftRerender = () => {
    renderAll(true);
    initAdminOverlays();
  };
  const draftWrap = document.getElementById('draft-board-wrap');
  if (draftWrap) {
    const { attachDraftDragDrop, initDraftTeamSortable } = await import('./draft-drag-drop.js');
    const { initDraftTimer, initDraftTimerUI } = await import('./draft-timer.js');
    if (!draftWrap.dataset.draftDndAttached) {
      draftWrap.dataset.draftDndAttached = '1';
      attachDraftDragDrop({ adminFetch, onDraftSaved, onDraftRerender, renderDraft });
    }
    initDraftTeamSortable({ adminFetch });
    initDraftTimer(adminFetch);
    initDraftTimerUI(adminFetch);

    const addPlayersBtn = document.getElementById('draft-add-players-btn');
    if (addPlayersBtn && !addPlayersBtn.dataset.draftAddInit) {
      addPlayersBtn.dataset.draftAddInit = '1';
      addPlayersBtn.onclick = () => {
        const backdrop = document.createElement('div');
        backdrop.className = 'admin-modal-backdrop';
        backdrop.innerHTML = `
          <div class="admin-modal" style="max-width:420px;">
            <h4>Add Players</h4>
            <p style="font-size:0.85rem;color:#c8c0b0;margin-bottom:0.75rem;">One player per line. New players will be added to the bank.</p>
            <textarea id="draft-add-players-input" rows="8" placeholder="KD&#10;Lebron James&#10;Mike" style="width:100%;padding:0.5rem;background:#1a1a1a;border:1px solid #444;color:#e8e4e0;font-family:inherit;font-size:0.9rem;resize:vertical;"></textarea>
            <div style="margin-top:1rem;display:flex;gap:0.5rem;">
              <button type="button" class="draft-btn" id="draft-add-players-submit">Add Players</button>
              <button type="button" class="draft-btn" id="draft-add-players-cancel" style="border-color:#666;color:#999;">Cancel</button>
            </div>
            <div id="draft-add-players-msg" style="margin-top:0.5rem;color:#f87171;font-size:0.85rem;"></div>
          </div>`;
        document.body.appendChild(backdrop);
        const input = backdrop.querySelector('#draft-add-players-input');
        const msg = backdrop.querySelector('#draft-add-players-msg');
        backdrop.querySelector('#draft-add-players-cancel').onclick = () => backdrop.remove();
        backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
        backdrop.querySelector('#draft-add-players-submit').onclick = async () => {
          const names = (input.value || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
          if (names.length === 0) {
            msg.textContent = 'Enter at least one player name.';
            return;
          }
          msg.textContent = '';
          try {
            for (const name of names) {
              await adminFetch('admin-players', {
                method: 'POST',
                body: JSON.stringify({ season_id: seasonId, name, team_id: null }),
              });
            }
            backdrop.remove();
            await onDraftSaved();
          } catch (err) {
            msg.textContent = err.message || 'Failed to add players';
          }
        };
        input.focus();
      };
    }
  }

  // Awards (season) overlays
  const awards = config.DB?.awards || [];
  const sa = awards.find(a => a.champ) || awards[awards.length - 1] || {};
  const seasonAwardWeek = sa.week ?? config.TOTAL_WEEKS ?? 1;

  const saveAward = (field, value) => adminFetch('admin-awards', {
    method: 'POST',
    body: JSON.stringify({
      season_id: seasonId,
      week: seasonAwardWeek,
      akhlaq: sa.akhlaq ?? null,
      motm1: sa.motm1 ?? null,
      motm2: sa.motm2 ?? null,
      motm3: sa.motm3 ?? null,
      champ: field === 'champ' ? value : (sa.champ ?? null),
      mvp: field === 'mvp' ? value : (sa.mvp ?? null),
      scoring: field === 'scoring' ? value : (sa.scoring ?? null),
    }),
  });

  // Season awards: champ, mvp, scoring — editable to add player names
  // Skip Edit overlay when "Season in progress" (user said that's unnecessary); show Add instead
  ['sa-champ', 'sa-mvp', 'sa-scoring'].forEach(id => {
    const el = document.getElementById(id);
    if (!el || el.dataset.adminOverlayAttached) return;
    const field = id === 'sa-champ' ? 'champ' : id === 'sa-mvp' ? 'mvp' : 'scoring';
    const text = (el.textContent || '').trim();
    const isPlaceholder = text === 'Season in progress' || (id === 'sa-champ' && /—\s*In Progress$/i.test(text));
    el.dataset.adminOverlayAttached = '1';

    if (isPlaceholder) {
      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'admin-edit-btn';
      addBtn.textContent = 'Add';
      addBtn.style.cssText = 'position:absolute;top:0.25rem;right:0.25rem;font-size:0.7rem;padding:0.2rem 0.5rem;';
      const label = field === 'champ' ? 'Champions' : field === 'mvp' ? 'MVP' : 'Scoring Title';
      addBtn.onclick = async () => {
        const name = prompt(`Add ${label} winner:`);
        if (name != null && name.trim()) {
          try {
            await saveAward(field, name.trim());
            renderAll(true);
            initAdminOverlays();
          } catch (err) { alert(err.message); }
        }
      };
      const wrap = document.createElement('div');
      wrap.className = 'admin-edit-overlay';
      wrap.style.position = 'relative';
      el.parentNode.insertBefore(wrap, el);
      wrap.appendChild(el);
      wrap.appendChild(addBtn);
    } else {
      attachEditOverlay({
        element: el,
        key: field,
        getValue: () => (el.textContent || '').trim(),
        saveFn: (val) => saveAward(field, val),
        contentType: 'text',
        onSaved: () => { renderAll(true); initAdminOverlays(); },
      });
    }
  });

  // Weekly awards: akhlaq, motm1, motm2, motm3 — attach overlays (re-run after renderAwards week change)
  const awardsCtx = {
    adminFetch,
    seasonId,
    awards,
    saveAward,
    refresh: async () => {
      const weekEl = document.getElementById('awards-week-select');
      const viewingWeek = weekEl ? parseInt(weekEl.value, 10) || config.CURRENT_WEEK : config.CURRENT_WEEK;
      await loadAdminSeason(window.adminSeasonSlug);
      renderAll(true);
      const awsel = document.getElementById('awards-week-select');
      if (awsel) awsel.value = String(viewingWeek);
      renderAwards(viewingWeek);
      initAdminOverlays();
    },
  };
  window.adminAwardsOverlayCtx = awardsCtx;
  const { attachAwardsWeeklyOverlays } = await import('./sections.js');
  attachAwardsWeeklyOverlays(awardsCtx);

  // Sponsors overlays: tier titles, sponsor names/descriptions, community partners
  const sponsors = config.DB?.sponsors || [];
  const sponsorByType = {};
  (sponsors || []).forEach(s => { sponsorByType[s.type] = s; });

  const tierHeaders = [
    { el: document.querySelector('.tier-title'), key: 'sponsor_tier_title', default: 'Title Sponsor' },
    { el: document.querySelector('.tier-conf'), key: 'sponsor_tier_conf', default: 'Conference Sponsors' },
    { el: document.querySelector('.tier-community'), key: 'sponsor_tier_community', default: 'Community Partners' },
  ];
  tierHeaders.forEach(({ el, key, default: def }) => {
    if (!el || el.dataset.adminOverlayAttached) return;
    el.dataset.adminOverlayAttached = '1';
    attachEditOverlay({
      element: el,
      key,
      getValue: () => el.textContent || def,
      saveFn: (val) => saveContent(key, val || def),
      contentType: 'text',
      onSaved: updateContentAndRender,
    });
  });

  const sponsorLogoEls = [
    { id: 'sponsor-title-logo', type: 'title' },
    { id: 'sponsor-mecca-logo', type: 'conference_mecca' },
    { id: 'sponsor-medina-logo', type: 'conference_medina' },
  ];
  sponsorLogoEls.forEach(({ id, type }) => {
    const el = document.getElementById(id);
    if (!el || el.dataset.adminOverlayAttached) return;
    const sponsor = sponsorByType[type];
    if (!sponsor) return;
    el.dataset.adminOverlayAttached = '1';
    attachEditOverlay({
      element: el,
      key: `sponsor_${type}_logo`,
      getValue: () => {
        const img = el.querySelector('img');
        return img ? (img.getAttribute('src') || '') : '';
      },
      saveFn: (val) => adminFetch('admin-sponsors', {
        method: 'POST',
        body: JSON.stringify({ id: sponsor.id, logo_url: val && val.trim() ? val.trim() : null }),
      }),
      contentType: 'text',
      onSaved: () => { renderAll(true); initAdminOverlays(); },
    });
  });

  const sponsorDescEls = [
    { id: 'sponsor-title-desc', type: 'title' },
    { id: 'sponsor-mecca-desc', type: 'conference_mecca' },
    { id: 'sponsor-medina-desc', type: 'conference_medina' },
  ];
  sponsorDescEls.forEach(({ id, type }) => {
    const el = document.getElementById(id);
    if (!el || el.dataset.adminOverlayAttached) return;
    const sponsor = sponsorByType[type];
    if (!sponsor) return;
    el.dataset.adminOverlayAttached = '1';
    attachEditOverlay({
      element: el,
      key: `sponsor_${type}_desc`,
      getValue: () => el.textContent || '',
      saveFn: (val) => adminFetch('admin-sponsors', {
        method: 'POST',
        body: JSON.stringify({ id: sponsor.id, label: val }),
      }),
      contentType: 'richtext',
      onSaved: () => { renderAll(true); initAdminOverlays(); },
    });
  });

  ['1', '2', '3'].forEach(i => {
    const logoKey = 'sponsor_community_' + i + '_logo';
    const nameKey = 'sponsor_community_' + i + '_name';
    const descKey = 'sponsor_community_' + i + '_desc';
    const logoEl = document.getElementById('sponsor-community-' + i + '-logo');
    const descEl = document.getElementById('sponsor-community-' + i + '-desc');
    if (logoEl && !logoEl.dataset.adminOverlayAttached) {
      logoEl.dataset.adminOverlayAttached = '1';
      attachEditOverlay({
        element: logoEl,
        key: logoKey,
        getValue: () => {
          const img = logoEl.querySelector('img');
          return img ? (img.getAttribute('src') || '') : '';
        },
        saveFn: (val) => saveContent(logoKey, val && val.trim() ? val.trim() : ''),
        contentType: 'text',
        onSaved: updateContentAndRender,
      });
    }
    if (descEl && !descEl.dataset.adminOverlayAttached) {
      descEl.dataset.adminOverlayAttached = '1';
      attachEditOverlay({
        element: descEl,
        key: descKey,
        getValue: () => descEl.textContent || '',
        saveFn: (val) => saveContent(descKey, val),
        contentType: 'richtext',
        onSaved: updateContentAndRender,
      });
    }
  });

  // Stats: link to Schedule for stat sheets
  let statsActions = document.getElementById('admin-stats-actions');
  if (!statsActions) {
    const section = document.querySelector('#page-stats .section');
    if (section) {
      statsActions = document.createElement('div');
      statsActions.id = 'admin-stats-actions';
      statsActions.style.cssText = 'margin-bottom:1rem;';
      const editScheduleBtn = document.createElement('button');
      editScheduleBtn.type = 'button';
      editScheduleBtn.textContent = 'Edit stat sheets (Schedule)';
      editScheduleBtn.className = 'insta-btn';
      editScheduleBtn.style.cssText = 'padding:0.4rem 0.8rem;font-size:0.8rem;';
      editScheduleBtn.onclick = () => adminShowPage('schedule');
      statsActions.appendChild(editScheduleBtn);
      section.insertBefore(statsActions, section.firstChild);
    }
  }

  // Teams: full edit overlays (team cards + roster panel)
  const { attachTeamsAdminOverlays } = await import('./sections.js');
  await attachTeamsAdminOverlays({
    adminFetch,
    supabase,
    getToken,
    onContentUpdated: () => {
      renderAll(true);
      initAdminOverlays();
    },
    onTeamsSaved: async () => {
      const openTeamId = window._adminActiveTeam;
      await loadAdminSeason(window.adminSeasonSlug);
      renderAll(true);
      initAdminOverlays();
      if (openTeamId && window.toggleRoster) window.toggleRoster(openTeamId);
    },
  });

  let homeActions = document.getElementById('admin-home-actions');
  if (!homeActions) {
    const section = document.querySelector('#page-home .section');
    if (section) {
      homeActions = document.createElement('div');
      homeActions.id = 'admin-home-actions';
      homeActions.style.cssText = 'margin-top:1rem;display:flex;gap:1rem;flex-wrap:wrap;';
      const editScheduleBtn = document.createElement('button');
      editScheduleBtn.type = 'button';
      editScheduleBtn.textContent = 'Edit Schedule';
      editScheduleBtn.className = 'insta-btn';
      editScheduleBtn.style.cssText = 'padding:0.4rem 0.8rem;font-size:0.8rem;';
      editScheduleBtn.onclick = () => adminShowPage('schedule');
      const editAwardsBtn = document.createElement('button');
      editAwardsBtn.type = 'button';
      editAwardsBtn.textContent = 'Edit season awards';
      editAwardsBtn.className = 'insta-btn';
      editAwardsBtn.style.cssText = 'padding:0.4rem 0.8rem;font-size:0.8rem;';
      editAwardsBtn.onclick = () => adminShowPage('awards');
      homeActions.appendChild(editScheduleBtn);
      homeActions.appendChild(editAwardsBtn);
      section.appendChild(homeActions);
    }
  }

  let standingsActions = document.getElementById('admin-standings-actions');
  if (!standingsActions) {
    const section = document.querySelector('#page-standings .section');
    if (section) {
      standingsActions = document.createElement('div');
      standingsActions.id = 'admin-standings-actions';
      standingsActions.style.cssText = 'margin-bottom:1rem;';
      const editScheduleBtn = document.createElement('button');
      editScheduleBtn.type = 'button';
      editScheduleBtn.textContent = 'Edit Schedule';
      editScheduleBtn.className = 'insta-btn';
      editScheduleBtn.style.cssText = 'padding:0.4rem 0.8rem;font-size:0.8rem;';
      editScheduleBtn.onclick = () => adminShowPage('schedule');
      standingsActions.appendChild(editScheduleBtn);
      section.insertBefore(standingsActions, section.firstChild);
    }
  }

  const scheduleOverlayCtx = {
    adminFetch,
    supabase,
    getToken,
    onScheduleSaved: async () => {
      await loadAdminSeason(window.adminSeasonSlug);
      renderAll(true);
      initAdminOverlays();
    },
  };
  window.adminScheduleOverlayCtx = scheduleOverlayCtx;
  attachScheduleAdminOverlays(scheduleOverlayCtx);

  const { attachMediaSlotOverlays } = await import('./sections.js');
  attachMediaSlotOverlays({
    adminFetch,
    supabase,
    getToken,
    onMediaSaved: async () => {
      await loadAdminSeason(window.adminSeasonSlug);
      renderAll(true);
      initAdminOverlays();
    },
  });
}

async function setupDashboard() {
  const seasonsRes = await fetchSeasons();
  const seasons = (seasonsRes.data || []).length ? (seasonsRes.data || []) : [];
  const defaultSlug = seasons.find(s => s.is_current)?.slug || seasons[0]?.slug || 'spring2026';

  const sel = document.getElementById('admin-season-select');
  sel.innerHTML = seasons.length ? seasons.map(s => `<option value="${s.slug}" ${s.slug === defaultSlug ? 'selected' : ''}>${s.label}${s.is_current ? ' · Current' : ''}</option>`).join('') : '<option value="spring2026">Spring 2026</option>';

  sel.onchange = () => adminChangeSeason(sel.value);

  document.getElementById('admin-float-btn').onclick = openDrawer;
  document.getElementById('admin-drawer-backdrop').onclick = closeDrawer;
  document.getElementById('admin-drawer-close').onclick = closeDrawer;
  document.getElementById('admin-export-csv-btn').onclick = async () => {
    const btn = document.getElementById('admin-export-csv-btn');
    const status = document.getElementById('admin-export-status');
    btn.disabled = true;
    if (status) status.textContent = 'Exporting…';
    try {
      const slug = config.currentSeasonSlug || window.adminSeasonSlug;
      if (!slug) throw new Error('No season selected');
      const { blob, filename } = await adminFetchBlob('admin-export-csv', { season_slug: slug });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || `faraj-league-export-${slug}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      if (status) {
        status.textContent = 'Export complete';
        setTimeout(() => { status.textContent = ''; }, 3000);
      }
    } catch (err) {
      if (status) status.textContent = `Export failed: ${err.message || 'Unknown error'}`;
    } finally {
      btn.disabled = false;
    }
  };
  document.getElementById('admin-logout-btn').onclick = () => {
    clearToken();
    closeDrawer();
    showLogin();
  };

  window.adminShowPage = adminShowPage;
  window.adminChangeSeason = adminChangeSeason;
  window.toggleAcc = toggleAcc;
  window.closeRoster = closeRoster;
  window.toggleRoster = toggleRoster;
  window.openBoxScoreFullscreen = openBoxScoreFullscreen;
  window.closeBoxScoreFullscreen = closeBoxScoreFullscreen;
  const baseRenderSchedule = renderSchedule;
  window.renderSchedule = (focusWeek, teamFilter) => {
    baseRenderSchedule(focusWeek, teamFilter);
    if (window.adminScheduleOverlayCtx) {
      import('./sections.js').then(({ attachScheduleAdminOverlays }) =>
        attachScheduleAdminOverlays(window.adminScheduleOverlayCtx)
      );
    }
  };
  window.renderScores = renderScores;
  const baseRenderAwards = renderAwards;
  window.renderAwards = (week) => {
    baseRenderAwards(week);
    if (window.adminAwardsOverlayCtx) {
      import('./sections.js').then(({ attachAwardsWeeklyOverlays }) =>
        attachAwardsWeeklyOverlays(window.adminAwardsOverlayCtx)
      );
    }
  };
  const baseRenderMedia = renderMedia;
  window.renderMedia = (week) => {
    baseRenderMedia(week);
    import('./sections.js').then(({ attachMediaSlotOverlays }) =>
      attachMediaSlotOverlays({
        adminFetch,
        supabase,
        getToken,
        onMediaSaved: async () => {
          await loadAdminSeason(window.adminSeasonSlug);
          renderAll(true);
          initAdminOverlays();
        },
      })
    );
  };
  window.goToTeam = (id) => { adminShowPage('teams'); setTimeout(() => toggleRoster(id), 80); };

  const ok = await loadAdminSeason(defaultSlug || 'spring2026');
  if (ok) {
    renderAll(true);
    initAdminOverlays();
  }

  initBoxScoreFullscreen();
}

function initBoxScoreFullscreen() {
  const overlay = document.getElementById('box-score-fullscreen');
  const dragHint = document.getElementById('box-score-drag-hint');
  if (!overlay || !dragHint) return;
  dragHint.onclick = closeBoxScoreFullscreen;
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.style.display === 'flex') closeBoxScoreFullscreen();
  });
}

async function init() {
  const token = getToken();
  if (token && isTokenValid(token)) {
    showDashboard();
    await setupDashboard();
  } else {
    clearToken();
    showLogin();
  }
}

document.getElementById('admin-login-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const pass = document.getElementById('admin-password').value;
  const errEl = document.getElementById('admin-login-error');
  errEl.style.display = 'none';
  try {
    const token = await login(pass);
    setToken(token);
    showDashboard();
    await setupDashboard();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  }
});

export { adminFetch, getToken };
init();
