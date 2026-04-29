/**
 * Admin CRUD section renderers.
 * Each renderX(content, ctx) populates the content div.
 */

const importRootJs = (name) => import(new URL('../../js/' + name, import.meta.url).href);

/** `YYYY-MM-DDTHH:mm` in the browser's local zone, for `<input type="datetime-local">` and text fields. */
function scheduledAtToDatetimeLocalValue(scheduledAt) {
  if (!scheduledAt) return '';
  const d = new Date(scheduledAt);
  if (isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${mo}-${day}T${h}:${m}`;
}

/**
 * Naive `YYYY-MM-DDTHH:mm` from datetime-local (no Z) is LOCAL wall time. Sent as-is, Postgres often stores it as UTC → wrong display (e.g. 10 AM → 5 AM Eastern).
 * Strings that already include Z or a numeric offset are left unchanged.
 */
function scheduledAtInputToIso(value) {
  if (value == null) return null;
  const s = String(value).trim();
  if (s === '') return null;
  if (/Z$/i.test(s)) return s;
  if (/[+-]\d{2}:\d{2}$/.test(s) || /[+-]\d{4}$/.test(s)) return s;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return s;
  const [, y, mo, d, hh, mm, ss] = m;
  const dt = new Date(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mm), Number(ss) || 0, 0);
  if (isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

export async function renderSeasons(content, ctx) {
  const { adminFetch, supabase } = ctx;
  const seasonId = window.adminSeasonId;
  if (!seasonId) {
    content.innerHTML = '<p>Select a season first.</p>';
    return;
  }
  let season;
  try {
    const result = await supabase.from('seasons').select('*').eq('id', seasonId).single();
    season = result.data;
    if (result.error) {
      console.error('Supabase seasons error:', result.error);
      content.innerHTML = `<p class="msg error">Failed to load season: ${result.error.message}</p>`;
      return;
    }
  } catch (e) {
    console.error('Supabase fetch failed:', e);
    content.innerHTML = `<p class="msg error">Failed to load season: ${e.message}</p>`;
    return;
  }
  if (!season) {
    content.innerHTML = '<p>Season not found.</p>';
    return;
  }
  const weekVal = season.current_week != null && Number.isFinite(Number(season.current_week))
    ? Number(season.current_week) : '';
  const totalWeeksVal = season.total_weeks != null && Number.isFinite(Number(season.total_weeks))
    ? Number(season.total_weeks) : '';
  content.innerHTML = `
    <div id="seasons-msg"></div>
    <form id="seasons-form" class="admin-drawer-form">
      <div class="admin-drawer-form-row">
        <input type="checkbox" id="seasons-is-current" ${season.is_current ? 'checked' : ''}>
        <span class="admin-drawer-form-label">Current season</span>
      </div>
      <div class="admin-drawer-form-row">
        <span class="admin-drawer-form-label">Current week</span>
        <input type="number" id="seasons-current-week" value="${weekVal}" min="0" class="admin-drawer-form-input">
      </div>
      <div class="admin-drawer-form-row">
        <span class="admin-drawer-form-label">Total weeks</span>
        <input type="number" id="seasons-total-weeks" value="${totalWeeksVal}" min="1" class="admin-drawer-form-input" placeholder="8">
      </div>
      <div class="admin-drawer-form-actions">
        <button type="submit">Save</button>
      </div>
    </form>
  `;
  document.getElementById('seasons-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('seasons-msg');
    try {
      const totalWeeksInput = document.getElementById('seasons-total-weeks').value;
      await adminFetch('admin-seasons', {
        method: 'POST',
        body: JSON.stringify({
          id: seasonId,
          is_current: document.getElementById('seasons-is-current').checked,
          current_week: document.getElementById('seasons-current-week').value !== '' ? parseInt(document.getElementById('seasons-current-week').value) : null,
          total_weeks: totalWeeksInput !== '' ? parseInt(totalWeeksInput) : null,
        }),
      });
      msg.innerHTML = '<p class="msg success">Saved.</p>';
      msg.style.display = 'block';
    } catch (err) {
      msg.innerHTML = `<p class="msg error">${err.message}</p>`;
    }
  });
}

function calcStandingsForAdmin(teams, games) {
  const rec = {};
  (teams || []).forEach(t => { rec[t.name] = { w: 0, l: 0 }; });
  (games || []).forEach(g => {
    if (g.home_score == null || g.away_score == null) return;
    const home = teams?.find(t => t.id === g.home_team_id)?.name;
    const away = teams?.find(t => t.id === g.away_team_id)?.name;
    if (!home || !away || !rec[home] || !rec[away]) return;
    const s1 = Number(g.home_score), s2 = Number(g.away_score);
    if (s1 > s2) { rec[home].w++; rec[away].l++; } else { rec[away].w++; rec[home].l++; }
  });
  return rec;
}

export async function renderHome(content, ctx) {
  const { adminFetch } = ctx;
  const seasonId = window.adminSeasonId;
  if (!seasonId) {
    content.innerHTML = '<p>Select a season first.</p>';
    return;
  }
  const { loadAdminSeasonData } = await import('./admin-data.js');
  const { HOME_TEMPLATE } = await import('./page-templates.js');
  const { attachEditOverlay } = await import('./edit-overlays.js');
  const { renderAll } = await importRootJs('render.js');

  const data = await loadAdminSeasonData(window.adminSeasonSlug);
  if (!data) {
    content.innerHTML = '<p>Select a season first.</p>';
    return;
  }

  content.innerHTML = HOME_TEMPLATE;
  const renderMod = await importRootJs('render.js');
  window.renderAll = renderMod.renderAll;
  window.renderSchedule = renderMod.renderSchedule;
  window.renderScores = renderMod.renderScores;
  window.toggleAcc = renderMod.toggleAcc;
  window.goToTeam = () => document.querySelector('[data-section="teams"]')?.click();
  renderAll();

  const heroBadge = content.querySelector('#hero-badge');
  const seasonTag = content.querySelector('#season-tag');
  const saveContent = (key, value) => adminFetch('admin-content', {
    method: 'POST',
    body: JSON.stringify([{ key, value, season_id: seasonId }]),
  });

  if (heroBadge) {
    attachEditOverlay({
      element: heroBadge,
      key: 'hero_badge',
      getValue: () => heroBadge.textContent || '',
      saveFn: (val) => saveContent('hero_badge', val),
      contentType: 'text',
      onSaved: () => { renderAll(); },
    });
  }
  if (seasonTag) {
    attachEditOverlay({
      element: seasonTag,
      key: 'season_tag',
      getValue: () => seasonTag.textContent || '',
      saveFn: (val) => saveContent('season_tag', val),
      contentType: 'text',
      onSaved: () => { renderAll(); },
    });
  }

  const editAwardsBtn = document.createElement('a');
  editAwardsBtn.href = '#';
  editAwardsBtn.textContent = 'Edit season awards';
  editAwardsBtn.style.cssText = 'display:inline-block;margin-top:0.5rem;font-size:0.85rem;color:#c8a84b;';
  editAwardsBtn.addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelector('[data-section="awards"]')?.click();
  });
  const section = content.querySelector('.section');
  if (section) section.appendChild(editAwardsBtn);

  const editScheduleBtn = document.createElement('button');
  editScheduleBtn.type = 'button';
  editScheduleBtn.textContent = 'Edit Schedule';
  editScheduleBtn.style.cssText = 'margin-top:0.5rem;padding:0.4rem 0.8rem;background:#c8a84b;color:#1a1a1a;border:none;border-radius:4px;cursor:pointer;';
  editScheduleBtn.addEventListener('click', () => document.querySelector('[data-section="schedule"]')?.click());
  if (section) section.appendChild(editScheduleBtn);
}

export async function renderStandings(content, ctx) {
  const seasonId = window.adminSeasonId;
  if (!seasonId) {
    content.innerHTML = '<p>Select a season first.</p>';
    return;
  }
  const { loadAdminSeasonData } = await import('./admin-data.js');
  const { STANDINGS_TEMPLATE } = await import('./page-templates.js');
  const renderMod = await importRootJs('render.js');

  const data = await loadAdminSeasonData(window.adminSeasonSlug);
  if (!data) {
    content.innerHTML = '<p>Select a season first.</p>';
    return;
  }

  content.innerHTML = STANDINGS_TEMPLATE;
  window.renderAll = renderMod.renderAll;
  window.renderSchedule = renderMod.renderSchedule;
  window.renderScores = renderMod.renderScores;
  window.goToTeam = () => document.querySelector('[data-section="teams"]')?.click();
  renderAll();

  const editScheduleBtn = document.createElement('button');
  editScheduleBtn.type = 'button';
  editScheduleBtn.textContent = 'Edit Schedule';
  editScheduleBtn.style.cssText = 'margin-top:0.5rem;padding:0.4rem 0.8rem;background:#c8a84b;color:#1a1a1a;border:none;border-radius:4px;cursor:pointer;';
  editScheduleBtn.addEventListener('click', () => document.querySelector('[data-section="schedule"]')?.click());
  const section = content.querySelector('.section');
  if (section) section.appendChild(editScheduleBtn);
}

export async function renderTeams(content, ctx) {
  const { adminFetch, supabase } = ctx;
  const seasonId = window.adminSeasonId;
  if (!seasonId) {
    content.innerHTML = '<p>Select a season first.</p>';
    return;
  }
  const { data: teams } = await supabase.from('teams').select('*').eq('season_id', seasonId).order('sort_order');
  const inp = (id, val = '') => ` style="padding:0.4rem;background:#2a2a2a;border:1px solid #444;color:#e8e4e0;border-radius:4px;width:100%;"`;
  content.innerHTML = `
    <div id="teams-msg"></div>
    <p><button id="teams-add-btn">Add team</button></p>
    <ul id="teams-list" style="list-style:none;padding:0;"></ul>
    <div id="teams-form-wrap" style="display:none;margin-top:1rem;max-width:400px;">
      <h4 id="teams-form-title">Add team</h4>
      <form id="teams-form">
        <input type="hidden" id="teams-id">
        <label style="display:block;margin-bottom:0.5rem;">Name: <input type="text" id="teams-name" required${inp()}></label>
        <label style="display:block;margin-bottom:0.5rem;">Conference: <select id="teams-conference"${inp()}>
          <option value="Mecca">Mecca</option><option value="Medina">Medina</option>
        </select></label>
        <label style="display:block;margin-bottom:0.5rem;">Captain: <input type="text" id="teams-captain"${inp()}></label>
        <button type="submit">Save</button>
        <button type="button" id="teams-cancel">Cancel</button>
      </form>
    </div>
  `;
  const list = document.getElementById('teams-list');
  list.innerHTML = (teams || []).map(t => `
    <li style="padding:0.5rem 0;border-bottom:1px solid #333;">
      <strong>${escapeHtml(t.name)}</strong> — ${t.conference} | Captain: ${escapeHtml(t.captain || '—')}
      <button data-id="${t.id}" data-name="${escapeHtml(t.name)}" data-conf="${t.conference}" data-captain="${escapeHtml(t.captain || '')}" class="edit-btn">Edit</button>
      <button data-id="${t.id}" data-name="${escapeHtml(t.name)}" class="delete-btn">Delete</button>
    </li>
  `).join('') || '<li>No teams yet.</li>';

  const wrap = document.getElementById('teams-form-wrap');
  const showForm = (t = null) => {
    wrap.style.display = 'block';
    document.getElementById('teams-form-title').textContent = t ? 'Edit team' : 'Add team';
    document.getElementById('teams-id').value = t?.id || '';
    document.getElementById('teams-name').value = t?.name || '';
    document.getElementById('teams-conference').value = t?.conference || 'Mecca';
    document.getElementById('teams-captain').value = t?.captain || '';
  };
  const hideForm = () => { wrap.style.display = 'none'; };

  document.getElementById('teams-add-btn').addEventListener('click', () => showForm());
  document.getElementById('teams-cancel').addEventListener('click', hideForm);
  list.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', () => showForm({
      id: btn.dataset.id, name: btn.dataset.name, conference: btn.dataset.conf, captain: btn.dataset.captain
    }));
  });
  list.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm(`Delete team "${btn.dataset.name}"?`)) return;
      try {
        await adminFetch('admin-teams', { method: 'POST', body: JSON.stringify({ delete: true, id: btn.dataset.id }) });
        renderTeams(content, ctx);
      } catch (e) { document.getElementById('teams-msg').innerHTML = `<p class="msg error">${e.message}</p>`; }
    });
  });
  document.getElementById('teams-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('teams-id').value;
    const body = {
      name: document.getElementById('teams-name').value,
      conference: document.getElementById('teams-conference').value,
      captain: document.getElementById('teams-captain').value || null,
    };
    if (id) body.id = id; else body.season_id = seasonId;
    try {
      await adminFetch('admin-teams', { method: 'POST', body: JSON.stringify(body) });
      document.getElementById('teams-msg').innerHTML = '<p class="msg success">Saved.</p>';
      hideForm();
      renderTeams(content, ctx);
    } catch (e) { document.getElementById('teams-msg').innerHTML = `<p class="msg error">${e.message}</p>`; }
  });
}

function escapeHtml(s) {
  if (s == null) return '';
  const div = document.createElement('div');
  div.textContent = String(s);
  return div.innerHTML.replace(/"/g, '&quot;');
}

function escapeHtmlAttr(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function renderPlayers(content, ctx) {
  const { adminFetch, supabase } = ctx;
  const seasonId = window.adminSeasonId;
  if (!seasonId) {
    content.innerHTML = '<p>Select a season first.</p>';
    return;
  }
  const [{ data: players }, { data: teams }, { data: rosters }] = await Promise.all([
    supabase.from('players').select('*').eq('season_id', seasonId),
    supabase.from('teams').select('*').eq('season_id', seasonId),
    supabase.from('rosters').select('*'),
  ]);
  const rosterMap = {};
  (rosters || []).forEach(r => { rosterMap[r.player_id] = r.team_id; });
  const teamMap = {};
  (teams || []).forEach(t => { teamMap[t.id] = t.name; });
  content.innerHTML = `
    <div id="players-msg"></div>
    <p style="margin-bottom:1rem;">
      <button id="players-add-btn" class="insta-btn" style="padding:0.4rem 0.8rem;background:#c8a84b;color:#1a1a1a;border:none;border-radius:4px;cursor:pointer;font-size:0.85rem;">Add player</button>
      ${(players || []).length > 0 ? `<button type="button" id="players-delete-all-btn" style="margin-left:0.5rem;padding:0.4rem 0.8rem;background:transparent;border:1px solid #e85555;color:#e85555;border-radius:4px;cursor:pointer;font-size:0.85rem;">Delete all players</button>` : ''}
    </p>
    <table style="width:100%;border-collapse:collapse;"><thead><tr><th>Name</th><th>#</th><th>Team</th><th></th></tr></thead>
    <tbody id="players-tbody"></tbody></table>
    <div id="players-form-wrap" style="display:none;margin-top:1rem;max-width:400px;">
      <h4 id="players-form-title">Add player</h4>
      <form id="players-form">
        <input type="hidden" id="players-id">
        <label style="display:block;margin-bottom:0.5rem;">Name: <input type="text" id="players-name" required style="padding:0.4rem;width:100%;background:#2a2a2a;border:1px solid #444;color:#e8e4e0;"></label>
        <label style="display:block;margin-bottom:0.5rem;">Jersey #: <input type="number" id="players-jersey" style="padding:0.4rem;width:100px;background:#2a2a2a;border:1px solid #444;color:#e8e4e0;"></label>
        <label style="display:block;margin-bottom:0.5rem;">Team: <select id="players-team" style="padding:0.4rem;background:#2a2a2a;border:1px solid #444;color:#e8e4e0;"><option value="">—</option>${(teams || []).map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('')}</select></label>
        <button type="submit">Save</button>
        <button type="button" id="players-cancel">Cancel</button>
      </form>
    </div>
  `;
  const tbody = document.getElementById('players-tbody');
  tbody.innerHTML = (players || []).map(p => `
    <tr><td>${escapeHtml(p.name)}</td><td>${p.jersey_number ?? '—'}</td><td>${escapeHtml(teamMap[rosterMap[p.id]] || '—')}</td>
    <td><button data-id="${p.id}" data-name="${escapeHtml(p.name)}" data-jersey="${p.jersey_number ?? ''}" data-team="${rosterMap[p.id] || ''}" class="pl-edit">Edit</button>
    <button data-id="${p.id}" data-name="${escapeHtml(p.name)}" class="pl-del">Delete</button></td></tr>
  `).join('') || '<tr><td colspan="4">No players yet.</td></tr>';

  const wrap = document.getElementById('players-form-wrap');
  const showForm = (p = null) => {
    wrap.style.display = 'block';
    document.getElementById('players-form-title').textContent = p ? 'Edit player' : 'Add player';
    document.getElementById('players-id').value = p?.id || '';
    document.getElementById('players-name').value = p?.name || '';
    document.getElementById('players-jersey').value = p?.jersey_number ?? '';
    document.getElementById('players-team').value = p?.team_id || '';
  };
  document.getElementById('players-add-btn').onclick = () => showForm();
  document.getElementById('players-cancel').onclick = () => { wrap.style.display = 'none'; };
  const deleteAllBtn = document.getElementById('players-delete-all-btn');
  if (deleteAllBtn) {
    deleteAllBtn.onclick = async () => {
      if (!confirm(`Delete all ${(players || []).length} players? This cannot be undone.`)) return;
      const msgEl = document.getElementById('players-msg');
      msgEl.innerHTML = '<p class="msg">Deleting...</p>';
      try {
        for (const p of players || []) {
          await adminFetch('admin-players', { method: 'POST', body: JSON.stringify({ delete: true, id: p.id }) });
        }
        msgEl.innerHTML = '<p class="msg success">All players deleted.</p>';
        if (ctx.onPlayersChanged) await ctx.onPlayersChanged();
        renderPlayers(content, ctx);
      } catch (e) {
        msgEl.innerHTML = `<p class="msg error">${escapeHtml(e.message)}</p>`;
      }
    };
  }
  tbody.querySelectorAll('.pl-edit').forEach(btn => {
    btn.onclick = () => showForm({ id: btn.dataset.id, name: btn.dataset.name, jersey_number: btn.dataset.jersey || null, team_id: btn.dataset.team || null });
  });
  tbody.querySelectorAll('.pl-del').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm(`Delete player "${btn.dataset.name}"?`)) return;
      try {
        await adminFetch('admin-players', { method: 'POST', body: JSON.stringify({ delete: true, id: btn.dataset.id }) });
        if (ctx.onPlayersChanged) await ctx.onPlayersChanged();
        renderPlayers(content, ctx);
      } catch (e) { document.getElementById('players-msg').innerHTML = `<p class="msg error">${escapeHtml(e.message)}</p>`; }
    };
  });
  document.getElementById('players-form').onsubmit = async (e) => {
    e.preventDefault();
    const id = document.getElementById('players-id').value;
    const body = {
      name: document.getElementById('players-name').value,
      jersey_number: parseInt(document.getElementById('players-jersey').value) || null,
      team_id: document.getElementById('players-team').value || null,
    };
    if (id) body.id = id; else body.season_id = seasonId;
    try {
      await adminFetch('admin-players', { method: 'POST', body: JSON.stringify(body) });
      document.getElementById('players-msg').innerHTML = '<p class="msg success">Saved.</p>';
      wrap.style.display = 'none';
      if (ctx.onPlayersChanged) await ctx.onPlayersChanged();
      renderPlayers(content, ctx);
    } catch (e) { document.getElementById('players-msg').innerHTML = `<p class="msg error">${escapeHtml(e.message)}</p>`; }
  };
}

/**
 * Rebuilds the Schedule tab from `SCHEDULE_TEMPLATE` and wires admin controls.
 * Not the same as `js/render.js` `renderSchedule(focusWeek, teamFilter)` (assigned to `window.renderSchedule` after load).
 */
export async function renderSchedule(content, ctx) {
  const { adminFetch, supabase } = ctx;
  const seasonId = window.adminSeasonId;
  if (!seasonId) {
    content.innerHTML = '<p>Select a season first.</p>';
    return;
  }
  const { loadAdminSeasonData } = await import('./admin-data.js');
  const { SCHEDULE_TEMPLATE } = await import('./page-templates.js');
  const renderMod = await importRootJs('render.js');
  const { config } = await importRootJs('config.js');

  const data = await loadAdminSeasonData(window.adminSeasonSlug);
  if (!data) {
    content.innerHTML = '<p>Select a season first.</p>';
    return;
  }

  content.innerHTML = SCHEDULE_TEMPLATE;
  window.renderAll = renderMod.renderAll;
  window.renderSchedule = renderMod.renderSchedule;
  window.openBoxScoreFullscreen = renderMod.openBoxScoreFullscreen;
  renderAll();

  const teams = (config.DB.teams || []).filter(t => t && t.id);
  const scores = config.DB.scores || [];
  const teamNameToId = {};
  teams.forEach(t => { teamNameToId[t.name] = t.id; });

  function openGameModal(game = null) {
    const backdrop = document.createElement('div');
    backdrop.className = 'admin-modal-backdrop';
    const isEdit = !!game;
    const body = {
      week: game?.week ?? 1,
      game_index: game?.game ?? 1,
      home_team_id: game?.t1Id || teams[0]?.id || '',
      away_team_id: game?.t2Id || teams[1]?.id || '',
      home_score: (game?.s1 ?? '') !== '' ? parseInt(game?.s1, 10) : null,
      away_score: (game?.s2 ?? '') !== '' ? parseInt(game?.s2, 10) : null,
      scheduled_at: scheduledAtToDatetimeLocalValue(game?.scheduled_at),
    };
    backdrop.innerHTML = `
      <div class="admin-modal" style="max-width:420px;">
        <h4>${isEdit ? 'Edit game' : 'Add game'}</h4>
        <form id="schedule-game-form">
          <input type="hidden" id="sg-id" value="${game?.gameId || ''}">
          <label style="display:block;margin:0.5rem 0;">Week: <input type="number" id="sg-week" min="1" value="${body.week}" required style="padding:0.4rem;width:60px;background:#1a1a1a;border:1px solid #444;color:#e8e4e0;"></label>
          <label style="display:block;margin:0.5rem 0;">Game #: <input type="number" id="sg-game-index" min="1" value="${body.game_index}" required style="padding:0.4rem;width:60px;background:#1a1a1a;border:1px solid #444;color:#e8e4e0;"></label>
          <label style="display:block;margin:0.5rem 0;">Home: <select id="sg-home" style="padding:0.4rem;background:#1a1a1a;border:1px solid #444;color:#e8e4e0;width:100%;">${teams.map(t => t ? `<option value="${t.id}" ${t.id === body.home_team_id ? 'selected' : ''}>${escapeHtml(t.name || '')}</option>` : '').join('')}</select></label>
          <label style="display:block;margin:0.5rem 0;">Away: <select id="sg-away" style="padding:0.4rem;background:#1a1a1a;border:1px solid #444;color:#e8e4e0;width:100%;">${teams.map(t => t ? `<option value="${t.id}" ${t.id === body.away_team_id ? 'selected' : ''}>${escapeHtml(t.name || '')}</option>` : '').join('')}</select></label>
          <label style="display:block;margin:0.5rem 0;">Home score: <input type="number" id="sg-home-score" min="0" value="${body.home_score ?? ''}" style="padding:0.4rem;width:60px;background:#1a1a1a;border:1px solid #444;color:#e8e4e0;"></label>
          <label style="display:block;margin:0.5rem 0;">Away score: <input type="number" id="sg-away-score" min="0" value="${body.away_score ?? ''}" style="padding:0.4rem;width:60px;background:#1a1a1a;border:1px solid #444;color:#e8e4e0;"></label>
          <label style="display:block;margin:0.5rem 0;">Scheduled at (your local time): <input type="datetime-local" id="sg-scheduled" value="${body.scheduled_at}" style="padding:0.4rem;background:#1a1a1a;border:1px solid #444;color:#e8e4e0;width:100%;"></label>
          <div class="admin-modal-actions" style="margin-top:1rem;">
            <button type="submit" class="btn-primary">Save</button>
            <button type="button" class="btn-secondary" id="sg-cancel">Cancel</button>
          </div>
        </form>
        <div id="sg-msg" class="admin-edit-msg" style="display:none;margin-top:0.5rem;"></div>
      </div>`;
    document.body.appendChild(backdrop);

    const close = () => backdrop.remove();
    backdrop.querySelector('#sg-cancel').onclick = close;
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });

    backdrop.querySelector('#schedule-game-form').onsubmit = async (e) => {
      e.preventDefault();
      const submitBtn = e.target.querySelector('[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      const id = backdrop.querySelector('#sg-id').value;
      const body = {
        week: parseInt(backdrop.querySelector('#sg-week').value),
        game_index: parseInt(backdrop.querySelector('#sg-game-index').value),
        home_team_id: backdrop.querySelector('#sg-home').value,
        away_team_id: backdrop.querySelector('#sg-away').value,
        home_score: backdrop.querySelector('#sg-home-score').value ? parseInt(backdrop.querySelector('#sg-home-score').value) : null,
        away_score: backdrop.querySelector('#sg-away-score').value ? parseInt(backdrop.querySelector('#sg-away-score').value) : null,
        scheduled_at: scheduledAtInputToIso(backdrop.querySelector('#sg-scheduled').value),
      };
      if (id) body.id = id; else body.season_id = seasonId;
      const msgEl = backdrop.querySelector('#sg-msg');
      try {
        await adminFetch('admin-games', { method: 'POST', body: JSON.stringify(body) });
        close();
        renderSchedule(content, ctx);
      } catch (err) {
        if (submitBtn) submitBtn.disabled = false;
        msgEl.textContent = err.message || 'Save failed.';
        msgEl.className = 'admin-edit-msg error';
        msgEl.style.display = 'block';
      }
    };
  }

  content.querySelectorAll('.schedule-expand-btn').forEach(btn => {
    const card = btn.closest('.matchup-card');
    if (!card) return;
    const gameId = btn.dataset.gameId;
    const game = scores.find(s => s.gameId === gameId);
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'admin-edit-btn';
    editBtn.textContent = 'Edit';
    editBtn.style.position = 'relative';
    editBtn.style.marginRight = '0.5rem';
    editBtn.onclick = () => openGameModal(game);
    btn.parentNode.insertBefore(editBtn, btn);
    const statBtn = document.createElement('button');
    statBtn.type = 'button';
    statBtn.className = 'admin-edit-btn';
    statBtn.textContent = 'Stat sheet';
    statBtn.style.position = 'relative';
    statBtn.onclick = () => openStatSheet(game, content, ctx);
    btn.parentNode.insertBefore(statBtn, btn);
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'admin-edit-btn';
    removeBtn.textContent = 'Remove';
    removeBtn.style.cssText = 'position:relative;margin-right:0.5rem;background:rgba(200,80,80,0.85);';
    removeBtn.onclick = async () => {
      if (!game?.gameId || !confirm('Remove this game? This will also delete its stat sheet.')) return;
      try {
        await adminFetch('admin-games', { method: 'POST', body: JSON.stringify({ delete: true, id: game.gameId }) });
        renderSchedule(content, ctx);
      } catch (err) {
        alert('Failed to remove game: ' + (err.message || 'Unknown error'));
      }
    };
    btn.parentNode.insertBefore(removeBtn, btn);
  });

  const addGameBtn = document.createElement('button');
  addGameBtn.type = 'button';
  addGameBtn.textContent = 'Add game';
  addGameBtn.style.cssText = 'margin-top:0.5rem;padding:0.4rem 0.8rem;background:#c8a84b;color:#1a1a1a;border:none;border-radius:4px;cursor:pointer;';
  addGameBtn.onclick = () => openGameModal(null);
  const section = content.querySelector('.section');
  if (section) {
    section.appendChild(addGameBtn);
    const editFullBtn = document.createElement('button');
    editFullBtn.type = 'button';
    editFullBtn.textContent = 'Edit Full Schedule';
    editFullBtn.style.cssText = 'margin-top:0.5rem;margin-left:0.5rem;padding:0.4rem 0.8rem;background:#2a4a6a;color:#e8e4e0;border:1px solid #4a7a9a;border-radius:4px;cursor:pointer;';
    editFullBtn.onclick = () => renderFullScheduleEditor(content, ctx);
    section.appendChild(editFullBtn);
  }
}

/**
 * Full-season schedule editor: all weeks; default 3 slots per week, any count (including zero), unbounded adds.
 * Inline-editable time per game (defaults: 10am/11am/12pm for first three slots) and date per week.
 * Matchup (teams) editable via modal. No stat sheet editing.
 */
export async function renderFullScheduleEditor(content, ctx) {
  const { adminFetch, supabase } = ctx;
  const seasonId = window.adminSeasonId;
  if (!seasonId) {
    alert('Select a season first.');
    return;
  }

  const pageRoot = content.id === 'page-schedule' ? content : (content.querySelector('#page-schedule') || content);
  const mirror = pageRoot.querySelector('#schedule-mirror-wrap');
  const mount = pageRoot.querySelector('#schedule-full-editor-mount');
  const mountEl = mount || content;

  const { config } = await importRootJs('config.js');

  // Fetch teams fresh from DB so the editor always has up-to-date team list
  const { data: teamsRaw } = await supabase.from('teams').select('id, name').eq('season_id', seasonId).order('sort_order');
  const teams = (teamsRaw && teamsRaw.length) ? teamsRaw : (config.DB.teams || []).filter(t => t && t.id);

  // Fetch season for total_weeks
  const { data: seasonRow } = await supabase.from('seasons').select('total_weeks, current_week').eq('id', seasonId).single();
  let totalWeeks = (seasonRow?.total_weeks != null && seasonRow.total_weeks > 0) ? seasonRow.total_weeks : (config.TOTAL_WEEKS || 8);

  const { data: games } = await supabase
    .from('games').select('*').eq('season_id', seasonId).order('week').order('game_index');

  // byWeek[weekNum][gameIndex] = game row
  const byWeek = {};
  (games || []).forEach(g => {
    if (!byWeek[g.week]) byWeek[g.week] = {};
    byWeek[g.week][g.game_index] = g;
  });

  const teamMap = {};
  teams.forEach(t => { teamMap[t.id] = t.name; });

  /** @type {Record<string, number[]>} week number key -> active game_index list */
  let slotsByWeek = {};
  /** @type {Record<string, string>} week key -> custom title */
  let weekLabels = {};
  /** @type {Record<string, string>} week key -> YYYY-MM-DD (saved even when week has no games yet) */
  let datesByWeek = {};
  const { data: cbMeta } = await supabase.from('content_blocks').select('key,value').eq('season_id', seasonId).in('key', ['schedule_slots_by_week', 'schedule_week_labels', 'schedule_dates_by_week']);
  (cbMeta || []).forEach(row => {
    try {
      if (row.key === 'schedule_slots_by_week') slotsByWeek = JSON.parse(row.value || '{}') || {};
      if (row.key === 'schedule_week_labels') weekLabels = JSON.parse(row.value || '{}') || {};
      if (row.key === 'schedule_dates_by_week') datesByWeek = JSON.parse(row.value || '{}') || {};
    } catch (_) {}
  });
  if (config.DB && (cbMeta || []).some(r => r.key === 'schedule_week_labels')) {
    config.DB.scheduleWeekLabels = { ...weekLabels };
  }

  function getActiveIndices(w) {
    const raw = slotsByWeek[String(w)] ?? slotsByWeek[w];
    if (Array.isArray(raw)) {
      if (raw.length === 0) return [];
      const uniq = [...new Set(raw.map(Number).filter(n => n >= 1))].sort((a, b) => a - b);
      if (uniq.length > 0) return uniq;
    }
    return [1, 2, 3];
  }

  async function persistSlots() {
    await adminFetch('admin-content', {
      method: 'POST',
      body: JSON.stringify([{ key: 'schedule_slots_by_week', value: JSON.stringify(slotsByWeek), season_id: seasonId }]),
    });
    if (config.DB.contentBlocks) config.DB.contentBlocks.schedule_slots_by_week = JSON.stringify(slotsByWeek);
  }

  async function persistWeekLabels() {
    await adminFetch('admin-content', {
      method: 'POST',
      body: JSON.stringify([{ key: 'schedule_week_labels', value: JSON.stringify(weekLabels), season_id: seasonId }]),
    });
    if (config.DB.contentBlocks) config.DB.contentBlocks.schedule_week_labels = JSON.stringify(weekLabels);
    config.DB.scheduleWeekLabels = { ...(config.DB.scheduleWeekLabels || {}), ...weekLabels };
  }

  async function persistDatesByWeek() {
    await adminFetch('admin-content', {
      method: 'POST',
      body: JSON.stringify([{ key: 'schedule_dates_by_week', value: JSON.stringify(datesByWeek), season_id: seasonId }]),
    });
    if (config.DB.contentBlocks) config.DB.contentBlocks.schedule_dates_by_week = JSON.stringify(datesByWeek);
  }

  function openEditorShell() {
    if (mirror && mount) {
      mirror.style.display = 'none';
      mount.style.display = 'block';
      mount.setAttribute('aria-hidden', 'false');
    }
  }

  function closeEditorShell() {
    if (mirror && mount) {
      mount.innerHTML = '';
      mount.style.display = 'none';
      mount.setAttribute('aria-hidden', 'true');
      mirror.style.display = '';
    }
  }

  const DEFAULT_TIMES = { 1: '10:00', 2: '11:00', 3: '12:00' };

  /** Default time for new games / empty slots; first three slots keep 10/11/12, rest use 10:00 */
  function defaultTimeForSlot(gi) {
    const g = Number(gi);
    if (g >= 1 && g <= 3) return DEFAULT_TIMES[g];
    return '10:00';
  }

  /** Calendar date in local TZ (for date inputs) — avoids UTC day shift near midnight */
  function getISODate(scheduledAt) {
    if (!scheduledAt) return '';
    const d = new Date(scheduledAt);
    if (isNaN(d)) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /** HH:mm for <input type="time"> — local wall clock, matches formatGameTime on public schedule */
  function getISOTime(scheduledAt, gameIndex) {
    if (!scheduledAt) return defaultTimeForSlot(gameIndex);
    const d = new Date(scheduledAt);
    if (isNaN(d)) return defaultTimeForSlot(gameIndex);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function fmtTime(t) {
    const [h, m] = t.split(':').map(Number);
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
  }

  /**
   * Store as ISO instant so Postgres timestamptz is correct: date+time are the admin's local wall clock.
   * (Naive "YYYY-MM-DDTHH:mm:ss" is interpreted as UTC by the DB → 5h wrong for US Eastern vs schedule tab.)
   */
  function buildScheduledAt(dateStr, timeStr) {
    if (!dateStr || !timeStr) return null;
    const [y, mo, d] = dateStr.split('-').map(Number);
    const [hh, mm] = timeStr.split(':').map(Number);
    if (!y || !mo || !d || Number.isNaN(hh) || Number.isNaN(mm)) return null;
    const dt = new Date(y, mo - 1, d, hh, mm, 0, 0);
    return dt.toISOString();
  }

  function getWeekDate(w) {
    const fromMap = datesByWeek[String(w)] ?? datesByWeek[w];
    if (fromMap != null && String(fromMap).trim() !== '') return String(fromMap).trim().slice(0, 10);
    for (const g of Object.values(byWeek[w] || {})) {
      const d = getISODate(g.scheduled_at);
      if (d) return d;
    }
    return '';
  }

  function showMsg(text, isError) {
    const el = document.getElementById('fse-save-msg');
    if (!el) return;
    el.textContent = text;
    el.style.color = isError ? '#e88' : '#8bc4a0';
    setTimeout(() => { if (el) el.textContent = ''; }, 3000);
  }

  async function refreshGames() {
    const { data: fresh } = await supabase.from('games').select('*').eq('season_id', seasonId).order('week').order('game_index');
    Object.keys(byWeek).forEach(k => delete byWeek[k]);
    (fresh || []).forEach(g => {
      if (!byWeek[g.week]) byWeek[g.week] = {};
      byWeek[g.week][g.game_index] = g;
    });
  }

  function openMatchupModal(game, week, gi) {
    const isEdit = !!game;
    const backdrop = document.createElement('div');
    backdrop.className = 'admin-modal-backdrop';
    const teamOpts = teams.map(t => `<option value="${t.id}" ${t.id === game?.home_team_id ? 'selected' : ''}>${escapeHtml(t.name)}</option>`).join('');
    const awayOpts = teams.map(t => `<option value="${t.id}" ${t.id === game?.away_team_id ? 'selected' : ''}>${escapeHtml(t.name)}</option>`).join('');
    backdrop.innerHTML = `
      <div class="admin-modal" style="max-width:360px;">
        <h4>${isEdit ? 'Edit matchup' : 'Add game'} — Week ${week}, Game ${gi}</h4>
        <form id="fse-matchup-form">
          <input type="hidden" id="fse-m-id" value="${game?.id || ''}">
          <label style="display:block;margin:0.5rem 0;">Home: <select id="fse-m-home" style="padding:0.4rem;background:#1a1a1a;border:1px solid #444;color:#e8e4e0;width:100%;">${teamOpts}</select></label>
          <label style="display:block;margin:0.5rem 0;">Away: <select id="fse-m-away" style="padding:0.4rem;background:#1a1a1a;border:1px solid #444;color:#e8e4e0;width:100%;">${awayOpts}</select></label>
          <div class="admin-modal-actions" style="margin-top:1rem;">
            <button type="submit" class="btn-primary">Save</button>
            <button type="button" class="btn-secondary" id="fse-m-cancel">Cancel</button>
          </div>
        </form>
        <div id="fse-m-msg" class="admin-edit-msg" style="display:none;margin-top:0.5rem;"></div>
      </div>`;
    document.body.appendChild(backdrop);

    const close = () => backdrop.remove();
    backdrop.querySelector('#fse-m-cancel').onclick = close;
    backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });

    backdrop.querySelector('#fse-matchup-form').onsubmit = async (e) => {
      e.preventDefault();
      const submitBtn = e.target.querySelector('[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      const id = backdrop.querySelector('#fse-m-id').value;
      const homeId = backdrop.querySelector('#fse-m-home').value;
      const awayId = backdrop.querySelector('#fse-m-away').value;
      let scheduledAt = game?.scheduled_at || null;
      if (!id) {
        const weekDate =
          document.querySelector(`.fse-date-input[data-week="${week}"]`)?.value?.trim()
          || getWeekDate(week)
          || (game?.scheduled_at ? getISODate(game.scheduled_at) : '');
        scheduledAt = weekDate ? buildScheduledAt(weekDate, defaultTimeForSlot(gi)) : null;
      }
      const body = id
        ? { id, home_team_id: homeId, away_team_id: awayId }
        : { season_id: seasonId, week, game_index: gi, home_team_id: homeId, away_team_id: awayId, scheduled_at: scheduledAt };
      const msgEl = backdrop.querySelector('#fse-m-msg');
      try {
        await adminFetch('admin-games', { method: 'POST', body: JSON.stringify(body) });
        close();
        await refreshGames();
        renderEditor();
      } catch (err) {
        if (submitBtn) submitBtn.disabled = false;
        const text = err.message || 'Save failed.';
        msgEl.textContent = text;
        msgEl.className = 'admin-edit-msg error';
        msgEl.style.display = 'block';
        const toolbar = document.getElementById('fse-save-msg');
        if (toolbar) {
          toolbar.textContent = text;
          toolbar.style.color = '#e88';
          setTimeout(() => { if (toolbar) toolbar.textContent = ''; }, 5000);
        }
      }
    };
  }

  function renderEditor() {
    const weekRows = Array.from({ length: totalWeeks }, (_, i) => {
      const w = i + 1;
      const weekDate = getWeekDate(w);
      const activeIndices = getActiveIndices(w);
      const titleVal = weekLabels[String(w)] ?? weekLabels[w] ?? '';
      const slots = activeIndices.map(gi => {
        const g = byWeek[w]?.[gi];
        const canRemoveSlot = activeIndices.length > 0;
        const slotMinus = canRemoveSlot
          ? `<button type="button" class="admin-edit-btn fse-slot-remove-btn" data-week="${w}" data-gi="${gi}" title="Remove this slot from the week (blocked if a game exists)" style="position:static;flex-shrink:0;width:30px;">−</button>`
          : '<span style="width:30px;flex-shrink:0;"></span>';
        if (g) {
          const home = escapeHtml(teamMap[g.home_team_id] || '?');
          const away = escapeHtml(teamMap[g.away_team_id] || '?');
          const timeVal = getISOTime(g.scheduled_at, gi);
          return `<div class="fse-slot" data-week="${w}" data-gi="${gi}">
            ${slotMinus}
            <span class="fse-game-label">Game ${gi}</span>
            <input type="time" class="fse-time-input" value="${timeVal}" data-week="${w}" data-gi="${gi}" data-game-id="${g.id}" title="Game time">
            <span class="fse-matchup">${home} vs ${away}</span>
            <div class="fse-actions">
              <button type="button" class="admin-edit-btn fse-edit-btn" data-week="${w}" data-gi="${gi}">Edit</button>
              <button type="button" class="admin-edit-btn fse-remove-btn" data-game-id="${g.id}" style="background:rgba(200,80,80,0.85);">Remove</button>
            </div>
          </div>`;
        }
        return `<div class="fse-slot fse-slot-empty" data-week="${w}" data-gi="${gi}">
            ${slotMinus}
          <span class="fse-game-label">Game ${gi}</span>
          <span class="fse-time-default">${fmtTime(defaultTimeForSlot(gi))}</span>
          <span class="fse-matchup" style="color:#666;">—</span>
          <button type="button" class="admin-edit-btn fse-add-btn" data-week="${w}" data-gi="${gi}" style="background:#2a5a3a;color:#8bc4a0;margin-left:auto;">+ Add</button>
        </div>`;
      });
      const addSlotBtn = `<button type="button" class="admin-edit-btn fse-add-slot-btn" data-week="${w}" style="position:static;background:#2a4a6a;color:#c8e0ff;font-size:0.72rem;">+ Slot</button>`;
      return `<div class="fse-week" data-week="${w}">
        <div class="fse-week-header" style="flex-wrap:wrap;gap:0.5rem;">
          <input type="text" class="fse-week-title-input" data-week="${w}" value="${escapeHtmlAttr(titleVal)}" placeholder="Week ${w} — custom title" style="flex:1;min-width:160px;background:#0e2535;border:1px solid #4a7a9a;color:#e8e4e0;padding:0.25rem 0.5rem;border-radius:3px;font-size:0.78rem;">
          <button type="button" class="admin-edit-btn fse-week-title-save" data-week="${w}" style="position:static;font-size:0.72rem;">Save title</button>
          ${addSlotBtn}
          <input type="date" class="fse-date-input" data-week="${w}" value="${weekDate}" title="Week date (applies to all games this week)">
        </div>
        ${slots.join('')}
      </div>`;
    });

    mountEl.innerHTML = `
      <div id="full-schedule-editor">
        <div class="fse-topbar">
          <button type="button" id="fse-back-btn" style="padding:0.4rem 0.8rem;background:#444;color:#e8e4e0;border:none;border-radius:4px;cursor:pointer;">← Back</button>
          <span style="font-family:'Cinzel',serif;font-size:0.9rem;color:#c8a84b;letter-spacing:0.1em;">EDIT FULL SCHEDULE</span>
          <span id="fse-save-msg" style="font-size:0.8rem;"></span>
        </div>
        <div class="fse-weeks-row" style="display:flex;align-items:center;gap:0.75rem;margin-bottom:1.2rem;padding:0.5rem 0.75rem;background:#1a1a2a;border-radius:4px;border:1px solid #2a4a6a;">
          <span style="font-size:0.82rem;color:#c8c0b0;">Total weeks in season:</span>
          <input type="number" id="fse-total-weeks" value="${totalWeeks}" min="1" max="52" style="background:#0e2535;border:1px solid #4a7a9a;color:#e8e4e0;padding:0.2rem 0.5rem;border-radius:3px;font-size:0.85rem;width:60px;">
          <button type="button" id="fse-save-weeks-btn" style="padding:0.25rem 0.75rem;background:#c8a84b;color:#1a1a1a;border:none;border-radius:3px;cursor:pointer;font-size:0.82rem;">Save</button>
          <span id="fse-weeks-msg" style="font-size:0.8rem;"></span>
        </div>
        <div class="fse-grid">${weekRows.join('')}</div>
      </div>`;

    if (!document.getElementById('fse-styles')) {
      const s = document.createElement('style');
      s.id = 'fse-styles';
      s.textContent = `
        #full-schedule-editor { padding:1rem; }
        .fse-topbar { display:flex;align-items:center;gap:1rem;margin-bottom:1.2rem; }
        .fse-week { margin-bottom:1.4rem; }
        .fse-week-header { display:flex;justify-content:flex-start;align-items:center;
          padding:0.4rem 0.75rem;background:#1e3a4a;border-radius:4px 4px 0 0;
          border-bottom:2px solid #c8a84b;margin-bottom:1px;flex-wrap:wrap;gap:0.5rem; }
        .fse-date-input { background:#0e2535;border:1px solid #4a7a9a;color:#e8e4e0;
          padding:0.2rem 0.5rem;border-radius:3px;font-size:0.82rem; }
        .fse-slot { display:flex;align-items:center;gap:0.75rem;padding:0.45rem 0.75rem;
          background:#111d27;border-bottom:1px solid #1e3a4a;min-height:40px; }
        .fse-slot:last-child { border-radius:0 0 4px 4px;border-bottom:none; }
        .fse-game-label { font-size:0.78rem;font-weight:600;color:#9ab8c8;min-width:50px; }
        .fse-time-input { background:#0e2535;border:1px solid #444;color:#e8e4e0;
          padding:0.2rem 0.4rem;border-radius:3px;font-size:0.82rem;width:96px; }
        .fse-time-default { font-size:0.78rem;color:#556;width:96px; }
        .fse-matchup { flex:1;font-size:0.84rem;color:#c8c0b0;text-align:center; }
        .fse-actions { display:flex;gap:0.4rem; }
      `;
      document.head.appendChild(s);
    }

    const el = document.getElementById('full-schedule-editor');
    el.querySelector('#fse-back-btn').onclick = async () => {
      closeEditorShell();
      if (typeof ctx.onScheduleSaved === 'function') await ctx.onScheduleSaved();
      else await renderSchedule(content, ctx);
    };

    el.querySelector('#fse-save-weeks-btn').onclick = async () => {
      const input = el.querySelector('#fse-total-weeks');
      const val = parseInt(input.value);
      const weeksMsg = el.querySelector('#fse-weeks-msg');
      if (!val || val < 1) { weeksMsg.textContent = 'Must be at least 1.'; weeksMsg.style.color = '#e88'; return; }
      try {
        await adminFetch('admin-seasons', { method: 'POST', body: JSON.stringify({ id: seasonId, total_weeks: val }) });
        totalWeeks = val;
        weeksMsg.textContent = 'Saved.';
        weeksMsg.style.color = '#8bc4a0';
        setTimeout(() => { weeksMsg.textContent = ''; }, 3000);
        renderEditor();
      } catch (err) {
        weeksMsg.textContent = err.message || 'Save failed.';
        weeksMsg.style.color = '#e88';
      }
    };

    el.querySelectorAll('.fse-date-input').forEach(input => {
      input.addEventListener('change', async () => {
        const w = parseInt(input.dataset.week, 10);
        const newDate = input.value;
        if (newDate) datesByWeek[String(w)] = newDate;
        else delete datesByWeek[String(w)];
        const weekGames = Object.values(byWeek[w] || {});
        try {
          await persistDatesByWeek();
          for (const g of weekGames) {
            const time = getISOTime(g.scheduled_at, g.game_index);
            const datePart = newDate || getISODate(g.scheduled_at) || '';
            const newAt = datePart && time ? buildScheduledAt(datePart, time) : null;
            await adminFetch('admin-games', { method: 'POST', body: JSON.stringify({ id: g.id, scheduled_at: newAt }) });
            g.scheduled_at = newAt;
          }
          showMsg('Date saved.');
        } catch (err) { showMsg(err.message || 'Save failed.', true); }
      });
    });

    el.querySelectorAll('.fse-time-input').forEach(input => {
      let timeSaveTimer;
      const persistGameTime = async () => {
        const gameId = input.dataset.gameId;
        const w = parseInt(input.dataset.week, 10);
        const gi = parseInt(input.dataset.gi, 10);
        const g = byWeek[w]?.[gi];
        if (!g || !gameId || !input.value) return;
        const weekDate =
          document.querySelector(`.fse-date-input[data-week="${w}"]`)?.value?.trim()
          || getWeekDate(w)
          || getISODate(g.scheduled_at);
        if (!weekDate) {
          showMsg('Set the week date (calendar field) first, then time.', true);
          return;
        }
        const newAt = buildScheduledAt(weekDate, input.value);
        if (!newAt) {
          showMsg('Could not save time.', true);
          return;
        }
        try {
          await adminFetch('admin-games', { method: 'POST', body: JSON.stringify({ id: gameId, scheduled_at: newAt }) });
          g.scheduled_at = newAt;
          showMsg('Time saved.');
        } catch (err) { showMsg(err.message || 'Save failed.', true); }
      };
      input.addEventListener('change', () => {
        clearTimeout(timeSaveTimer);
        persistGameTime();
      });
      input.addEventListener('input', () => {
        clearTimeout(timeSaveTimer);
        timeSaveTimer = setTimeout(persistGameTime, 420);
      });
    });

    el.querySelectorAll('.fse-edit-btn').forEach(btn => {
      btn.onclick = () => {
        const w = parseInt(btn.dataset.week);
        const gi = parseInt(btn.dataset.gi);
        openMatchupModal(byWeek[w]?.[gi], w, gi);
      };
    });

    el.querySelectorAll('.fse-remove-btn').forEach(btn => {
      btn.onclick = async () => {
        const gameId = btn.dataset.gameId;
        if (!gameId || !confirm('Remove this game? This will also delete its stat sheet.')) return;
        try {
          await adminFetch('admin-games', { method: 'POST', body: JSON.stringify({ delete: true, id: gameId }) });
          for (const w of Object.keys(byWeek)) {
            for (const gi of Object.keys(byWeek[w])) {
              if (byWeek[w][gi]?.id === gameId) delete byWeek[w][gi];
            }
          }
          renderEditor();
        } catch (err) { showMsg(err.message || 'Remove failed.', true); }
      };
    });

    el.querySelectorAll('.fse-add-btn').forEach(btn => {
      btn.onclick = () => {
        const w = parseInt(btn.dataset.week);
        const gi = parseInt(btn.dataset.gi);
        openMatchupModal(null, w, gi);
      };
    });

    el.querySelectorAll('.fse-slot-remove-btn').forEach(btn => {
      btn.onclick = async () => {
        const w = parseInt(btn.dataset.week, 10);
        const gi = parseInt(btn.dataset.gi, 10);
        if (byWeek[w]?.[gi]) {
          alert('Remove this game first (use Remove on the game row), then you can hide this slot.');
          return;
        }
        const cur = getActiveIndices(w);
        const next = cur.filter(x => x !== gi);
        slotsByWeek[String(w)] = next;
        try {
          await persistSlots();
          renderEditor();
        } catch (err) { showMsg(err.message || 'Save failed.', true); }
      };
    });

    el.querySelectorAll('.fse-week-title-save').forEach(btn => {
      btn.onclick = async () => {
        const w = btn.dataset.week;
        const input = el.querySelector(`.fse-week-title-input[data-week="${w}"]`);
        const v = input ? input.value.trim() : '';
        weekLabels[w] = v;
        try {
          await persistWeekLabels();
          showMsg('Week title saved.');
        } catch (err) { showMsg(err.message || 'Save failed.', true); }
      };
    });

    el.querySelectorAll('.fse-add-slot-btn').forEach(btn => {
      btn.onclick = async () => {
        const w = parseInt(btn.dataset.week, 10);
        const cur = getActiveIndices(w);
        const nextIdx = cur.length ? Math.max(...cur) + 1 : 1;
        slotsByWeek[String(w)] = [...cur, nextIdx].sort((a, b) => a - b);
        try {
          await persistSlots();
          renderEditor();
        } catch (err) { showMsg(err.message || 'Save failed.', true); }
      };
    });
  }

  openEditorShell();
  renderEditor();
}

/**
 * Attach edit overlays to weekly award winners (akhlaq, motm1, motm2, motm3).
 * Call after renderAwards — week comes from awards-week-select.
 */
export function attachAwardsWeeklyOverlays(ctx) {
  const { adminFetch, seasonId, refresh } = ctx;
  if (!seasonId) return;

  (async () => {
    const { attachEditOverlay } = await import('./edit-overlays.js');
    const configMod = await importRootJs('config.js');

    const weekEl = document.getElementById('awards-week-select');
    const getWeek = () => weekEl ? parseInt(weekEl.value, 10) || 1 : 1;
    const getWa = () => {
      const awardsList = configMod.config?.DB?.awards || [];
      return awardsList.find(a => Number(a.week) === getWeek()) || {};
    };

    const saveWeeklyAward = (field, value) => {
      const currentWeek = getWeek();
      const wa = getWa();
      return adminFetch('admin-awards', {
        method: 'POST',
        body: JSON.stringify({
          season_id: seasonId,
          week: currentWeek,
          akhlaq: field === 'akhlaq' ? (value || null) : (wa.akhlaq ?? null),
          akhlaq_post_url: wa.akhlaq_post_url ?? null,
          motm1: null,
          motm2: null,
          motm3: null,
          champ: wa.champ ?? null,
          mvp: wa.mvp ?? null,
          scoring: wa.scoring ?? null,
        }),
      });
    };

    ['akhlaq'].forEach(field => {
      const el = document.getElementById('award-winner-' + field);
      if (!el || el.dataset.awardsOverlayAttached) return;
      el.dataset.awardsOverlayAttached = '1';
      attachEditOverlay({
        element: el,
        key: 'award_' + field,
        getValue: () => {
          const t = (el.textContent || '').trim();
          return t === 'Pending' ? '' : t;
        },
        saveFn: (val) => saveWeeklyAward(field, val),
        contentType: 'text',
        onSaved: refresh,
      });
    });
  })();
}

/**
 * Attach admin overlays to Teams page: edit team cards (name, captain, conference),
 * add/delete teams, and roster panel with full player CRUD.
 */
export async function attachTeamsAdminOverlays(ctx) {
  const { adminFetch, supabase } = ctx;
  const onTeamsSaved = ctx.onTeamsSaved || (() => {});
  const onContentUpdated = ctx.onContentUpdated || (() => {});

  const seasonId = window.adminSeasonId;
  if (!seasonId) return;

  const pageTeams = document.getElementById('page-teams');
  const teamsGrid = document.getElementById('teams-grid');
  const rosterPanel = document.getElementById('roster-panel');
  const rosterContent = document.getElementById('roster-content');
  if (!pageTeams || !teamsGrid || !rosterPanel || !rosterContent) return;

  await (async () => {
    const { config } = await importRootJs('config.js');
    const { confLabel, confLabelRaw, confShortLabel, getConferences } = await importRootJs('config.js');
    const renderMod = await importRootJs('render.js');
    const { attachEditOverlay } = await import('./edit-overlays.js');

    const teams = config.DB.teams || [];
    const rec = renderMod.calcStandings ? renderMod.calcStandings() : {};
    const saveContent = (key, value) => adminFetch('admin-content', { method: 'POST', body: JSON.stringify([{ key, value, season_id: seasonId }]) });

    function getConferencesLayout() {
      try {
        const parsed = JSON.parse(config.DB?.contentBlocks?.conferences_layout || '{}');
        if (parsed?.conferences?.length) return parsed;
      } catch (_) {}
      const blocks = config.DB?.contentBlocks || {};
      return {
        conferences: [
          { id: 'Mecca', name: (blocks.conf_name_mecca || '').trim() || 'Mecca', sort_order: 0 },
          { id: 'Medina', name: (blocks.conf_name_medina || '').trim() || 'Medina', sort_order: 1 },
        ],
      };
    }

    async function saveConferencesLayout(layout) {
      const value = JSON.stringify(layout);
      await saveContent('conferences_layout', value);
      if (!config.DB.contentBlocks) config.DB.contentBlocks = {};
      config.DB.contentBlocks.conferences_layout = value;
      refresh();
    }

    function refresh() { onTeamsSaved(); }

    // --- Team cards: edit overlays and delete ---
    document.querySelectorAll('.team-card').forEach(card => {
      if (card.dataset.teamsOverlayAttached) return;
      card.dataset.teamsOverlayAttached = '1';

      const teamId = card.id.replace('tc-', '');
      const t = teams.find(x => x.id === teamId);
      if (!t) return;

      const nameEl = card.querySelector('.team-name');
      const captainEl = card.querySelector('.team-captain');
      if (nameEl) {
        attachEditOverlay({
          element: nameEl,
          key: 'team_name',
          getValue: () => nameEl.textContent || '',
          saveFn: async (val) => {
            await adminFetch('admin-teams', { method: 'POST', body: JSON.stringify({ id: teamId, name: val }) });
          },
          contentType: 'text',
          onSaved: refresh,
        });
        card.querySelectorAll('.admin-edit-btn').forEach(btn => btn.addEventListener('click', e => e.stopPropagation()));
      }
      if (captainEl) {
        attachEditOverlay({
          element: captainEl,
          key: 'team_captain',
          getValue: () => (captainEl.textContent || '').replace(/^Capt:\s*/i, ''),
          saveFn: async (val) => {
            const v = (val || '').trim();
            await adminFetch('admin-teams', { method: 'POST', body: JSON.stringify({ id: teamId, captain: (v && v !== '—') ? v : null }) });
          },
          contentType: 'text',
          onSaved: refresh,
        });
        card.querySelectorAll('.admin-edit-btn').forEach(btn => btn.addEventListener('click', e => e.stopPropagation()));
      }

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.textContent = 'Delete';
      delBtn.className = 'admin-edit-btn';
      delBtn.style.cssText = 'margin-top:0.4rem;font-size:0.75rem;padding:0.2rem 0.5rem;background:transparent;color:#c87070;border:1px solid #c87070;border-radius:4px;cursor:pointer;';
      delBtn.onclick = async (e) => {
        e.stopPropagation();
        if (!confirm(`Delete team "${t.name}"? This will remove all roster links.`)) return;
        try {
          await adminFetch('admin-teams', { method: 'POST', body: JSON.stringify({ delete: true, id: teamId }) });
          refresh();
        } catch (err) { alert(err.message); }
      };
      card.appendChild(delBtn);
    });

    // --- Conference header edit overlays + Add/Remove (like media sections) ---
    const conferences = getConferences();
    conferences.forEach((c) => {
      const confId = c.id || c.name;
      const slug = String(confId).toLowerCase().replace(/\W+/g, '_');
      const header = document.getElementById(`teams-conf-header-${slug}`);
      const section = header?.closest('.teams-conf-section');
      if (!header || !section) return;
      if (header.dataset.confOverlayAttached) return;
      header.dataset.confOverlayAttached = '1';

      attachEditOverlay({
        element: header,
        key: 'conf_' + confId,
        getValue: () => confLabelRaw(confId),
        saveFn: async (val) => {
          const layout = getConferencesLayout();
          const conf = layout.conferences.find(x => (x.id || x.name) === confId);
          if (conf) {
            const trimVal = (val || '').trim();
            if (trimVal) {
              conf.display_label = trimVal;
            } else {
              delete conf.display_label;
            }
            await saveConferencesLayout(layout);
          } else {
            const trimVal = (val || '').trim();
            await saveContent('conf_name_' + (confId === 'Mecca' ? 'mecca' : confId === 'Medina' ? 'medina' : slug), trimVal);
            if (!config.DB.contentBlocks) config.DB.contentBlocks = {};
            config.DB.contentBlocks['conf_name_' + (confId === 'Mecca' ? 'mecca' : confId === 'Medina' ? 'medina' : slug)] = trimVal;
            refresh();
          }
        },
        contentType: 'text',
        onSaved: refresh,
      });

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.textContent = 'Remove conference';
      removeBtn.className = 'admin-edit-btn';
      removeBtn.style.cssText = 'margin-left:0.5rem;font-size:0.7rem;padding:0.2rem 0.4rem;background:transparent;color:#c87070;border:1px solid #c87070;border-radius:4px;cursor:pointer;';
      removeBtn.onclick = async () => {
        const teamCount = teams.filter(t => t.conf === confId).length;
        if (teamCount > 0 && !confirm(`"${confShortLabel(confId)}" has ${teamCount} team(s). Move them to another conference first, or they will be unassigned. Remove anyway?`)) return;
        const layout = getConferencesLayout();
        if (layout.conferences.length <= 1) {
          alert('Keep at least one conference.');
          return;
        }
        const fallback = layout.conferences.find(x => (x.id || x.name) !== confId)?.id || layout.conferences.find(x => (x.id || x.name) !== confId)?.name || 'Mecca';
        layout.conferences = layout.conferences.filter(x => (x.id || x.name) !== confId);
        try {
          await saveConferencesLayout(layout);
          if (teamCount > 0) {
            for (const t of teams.filter(x => x.conf === confId)) {
              await adminFetch('admin-teams', { method: 'POST', body: JSON.stringify({ id: t.id, conference: fallback }) });
            }
          }
          refresh();
        } catch (err) { alert(err.message); }
      };
      const headerWrap = header.closest('.admin-edit-overlay') || header.parentElement;
      if (headerWrap?.classList?.contains('admin-edit-overlay')) headerWrap.appendChild(removeBtn);
      else header.parentNode?.insertBefore(removeBtn, header.nextSibling);
    });

    // --- Add conference + Add team buttons (top, side by side) ---
    let addConfBtn = document.getElementById('admin-teams-add-conf-btn');
    let addTeamBtn = document.getElementById('admin-teams-add-btn');
    let btnWrap = document.getElementById('admin-teams-buttons-wrap');
    if (!btnWrap) {
      btnWrap = document.createElement('div');
      btnWrap.id = 'admin-teams-buttons-wrap';
      btnWrap.style.cssText = 'display:flex;gap:0.75rem;flex-wrap:wrap;margin-bottom:1rem;align-items:center;';
      const section = pageTeams.querySelector('.section');
      if (section) section.insertBefore(btnWrap, teamsGrid);
    }
    if (!addConfBtn) {
      addConfBtn = document.createElement('button');
      addConfBtn.type = 'button';
      addConfBtn.id = 'admin-teams-add-conf-btn';
      addConfBtn.textContent = 'Add conference';
      addConfBtn.className = 'insta-btn';
      addConfBtn.style.cssText = 'padding:0.4rem 0.8rem;font-size:0.85rem;';
      addConfBtn.onclick = async () => {
        const name = prompt('Conference name:');
        if (!name || !name.trim()) return;
        const layout = getConferencesLayout();
        const newId = 'Conf_' + Date.now();
        layout.conferences.push({ id: newId, name: name.trim(), sort_order: layout.conferences.length });
        try {
          await saveConferencesLayout(layout);
        } catch (err) { alert(err.message); }
      };
      btnWrap.appendChild(addConfBtn);
    } else if (addConfBtn.parentNode !== btnWrap) {
      btnWrap.appendChild(addConfBtn);
    }
    if (!addTeamBtn) {
      addTeamBtn = document.createElement('button');
      addTeamBtn.type = 'button';
      addTeamBtn.id = 'admin-teams-add-btn';
      addTeamBtn.textContent = 'Add team';
      addTeamBtn.className = 'insta-btn';
      addTeamBtn.style.cssText = 'padding:0.4rem 0.8rem;font-size:0.85rem;';
      addTeamBtn.onclick = () => openAddTeamModal();
      btnWrap.appendChild(addTeamBtn);
    } else if (addTeamBtn.parentNode !== btnWrap) {
      btnWrap.appendChild(addTeamBtn);
    }

    // --- Drag and drop for team order / conference ---
    if (typeof Sortable !== 'undefined') {
      const dropZones = teamsGrid.querySelectorAll('.teams-drop-zone');
      dropZones.forEach(zone => {
        if (zone.dataset.sortableInit) return;
        zone.dataset.sortableInit = '1';
        new Sortable(zone, {
          group: 'teams',
          animation: 150,
          delay: 150,
          onEnd: async (evt) => {
            const teamId = evt.item.dataset.teamId;
            const fromConf = evt.from.dataset.conf;
            const toConf = evt.to.dataset.conf;
            const toIds = [...evt.to.querySelectorAll('.team-card')].map(c => c.dataset.teamId);
            const fromIds = [...evt.from.querySelectorAll('.team-card')].map(c => c.dataset.teamId);
            try {
              for (let i = 0; i < toIds.length; i++) {
                const id = toIds[i];
                const payload = { id, sort_order: i };
                if (id === teamId && toConf !== fromConf) payload.conference = toConf;
                await adminFetch('admin-teams', { method: 'POST', body: JSON.stringify(payload) });
              }
              if (toConf !== fromConf && fromIds.length > 0) {
                for (let i = 0; i < fromIds.length; i++) {
                  await adminFetch('admin-teams', { method: 'POST', body: JSON.stringify({ id: fromIds[i], sort_order: i }) });
                }
              }
              refresh();
            } catch (err) {
              alert(err.message || 'Failed to update');
              refresh();
            }
          },
        });
      });
    }

    function openAddTeamModal() {
      const backdrop = document.createElement('div');
      backdrop.className = 'admin-modal-backdrop';
      backdrop.innerHTML = `
        <div class="admin-modal" style="max-width:400px;">
          <h4>Add team</h4>
          <form id="admin-add-team-form">
            <label style="display:block;margin:0.5rem 0;">Name: <input type="text" id="at-name" required style="padding:0.4rem;width:100%;background:#1a1a1a;border:1px solid #444;color:#e8e4e0;"></label>
            <label style="display:block;margin:0.5rem 0;">Conference: <select id="at-conf" style="padding:0.4rem;background:#1a1a1a;border:1px solid #444;color:#e8e4e0;">${getConferences().map(c => { const id = c.id || c.name; return `<option value="${String(id).replace(/"/g, '&quot;')}">${confLabelRaw(id)}</option>`; }).join('')}</select></label>
            <label style="display:block;margin:0.5rem 0;">Captain: <input type="text" id="at-captain" style="padding:0.4rem;width:100%;background:#1a1a1a;border:1px solid #444;color:#e8e4e0;"></label>
            <div style="margin-top:1rem;"><button type="submit" class="btn-primary">Save</button><button type="button" class="btn-secondary" id="at-cancel">Cancel</button></div>
          </form>
          <div id="at-msg" style="margin-top:0.5rem;color:#f87171;"></div>
        </div>`;
      document.body.appendChild(backdrop);
      backdrop.querySelector('#at-cancel').onclick = () => backdrop.remove();
      backdrop.addEventListener('click', e => { if (e.target === backdrop) backdrop.remove(); });
      backdrop.querySelector('#admin-add-team-form').onsubmit = async (e) => {
        e.preventDefault();
        const name = backdrop.querySelector('#at-name').value.trim();
        const conference = backdrop.querySelector('#at-conf').value;
        const captain = backdrop.querySelector('#at-captain').value.trim() || null;
        try {
          const teamsInConf = (config.DB.teams || []).filter(t => t.conf === conference);
          const sortOrder = teamsInConf.length > 0
            ? Math.max(...teamsInConf.map(t => t.sort_order ?? 0)) + 1
            : 0;
          const res = await adminFetch('admin-teams', {
            method: 'POST',
            body: JSON.stringify({ season_id: seasonId, name, conference, captain, sort_order: sortOrder }),
          });
          backdrop.remove();
          const newId = res?.id;
          if (newId && config.DB.teams) {
            config.DB.teams.push({
              id: newId,
              name,
              conf: conference,
              captain: captain || '',
              players: [],
              roster: [],
              sort_order: sortOrder,
            });
            onContentUpdated();
          } else {
            refresh();
          }
        } catch (err) { backdrop.querySelector('#at-msg').textContent = err.message; }
      };
    }

    // --- Override toggleRoster for admin roster panel with edit ---
    const baseToggleRoster = window.toggleRoster;
    const baseCloseRoster = window.closeRoster;

    window.toggleRoster = (id) => {
      document.querySelectorAll('.team-card').forEach(c => c.classList.remove('selected'));
      if (window._adminActiveTeam === id) {
        rosterPanel.classList.remove('open');
        window._adminActiveTeam = null;
        return;
      }
      window._adminActiveTeam = id;
      const t = teams.find(x => x.id === id);
      if (!t) return;
      const tc = document.getElementById('tc-' + id);
      if (tc) tc.classList.add('selected');

      const rosterOrdered = [...(t.roster || [])];
      const captainNorm = (t.captain || '').trim().toLowerCase();
      const captainInRoster = captainNorm && rosterOrdered.some(r => String(r.name || '').trim().toLowerCase() === captainNorm);
      if (captainInRoster) {
        rosterOrdered.sort((a, b) => (String(a.name || '').trim().toLowerCase() === captainNorm ? -1 : String(b.name || '').trim().toLowerCase() === captainNorm ? 1 : 0));
      }
      const capDisplay = captainInRoster ? (rosterOrdered.find(r => String(r.name || '').trim().toLowerCase() === captainNorm)?.name || '—') : '—';

      rosterContent.innerHTML = `
        <div id="roster-header" style="margin-bottom:0.9rem;">
          <div id="roster-team-name" style="font-family:'Cinzel',serif;font-size:1rem;color:#c8a84b">${escapeHtml(t.name)}</div>
          <div id="roster-sub" style="font-size:0.8rem;color:#2fa89a;letter-spacing:0.1em;text-transform:uppercase;margin-top:0.12rem">
            <span id="roster-conf-val">${confLabel(t.conf)}</span> · Capt: <span id="roster-captain-val">${escapeHtml(capDisplay)}</span> · ${rec[t.name] ? rec[t.name].w + '-' + rec[t.name].l : '0-0'}
          </div>
        </div>
        <div id="roster-players-list"></div>
        <button type="button" id="roster-add-player-btn" style="margin-top:0.8rem;padding:0.4rem 0.8rem;background:#c8a84b;color:#1a1a1a;border:none;border-radius:4px;cursor:pointer;font-size:0.85rem;">Add player</button>
      `;

      const listEl = document.getElementById('roster-players-list');
      rosterOrdered.forEach((p, i) => {
        const row = document.createElement('div');
        row.className = 'roster-player admin-roster-row';
        row.dataset.playerId = p.id || '';
        row.dataset.playerName = p.name;
        const isCaptain = captainNorm && String(p.name || '').trim().toLowerCase() === captainNorm;
        const isPlaceholder = !p.id;
        const actionBtns = isPlaceholder
          ? `<span style="font-size:0.75rem;color:#c8a84b;">(C) — assign via Draft</span>`
          : `<button type="button" class="admin-roster-edit" data-id="${p.id}" data-name="${escapeHtml(p.name)}">Edit</button><button type="button" class="admin-roster-remove" data-id="${p.id}" data-name="${escapeHtml(p.name)}">Remove</button>`;
        row.innerHTML = `<span class="roster-num">${i + 1}</span><span class="roster-player-name">${escapeHtml(p.name)}</span>${isCaptain ? ' <span style="color:#c8a84b;font-size:0.8rem;">(C)</span>' : ''} ${actionBtns}`;
        listEl.appendChild(row);
      });

      attachEditOverlay({
        element: document.getElementById('roster-team-name'),
        key: 'roster_team_name',
        getValue: () => document.getElementById('roster-team-name')?.textContent || '',
        saveFn: async (val) => {
          await adminFetch('admin-teams', { method: 'POST', body: JSON.stringify({ id: t.id, name: val }) });
        },
        contentType: 'text',
        onSaved: refresh,
      });

      const confEl = document.getElementById('roster-conf-val');
      if (confEl) {
        attachEditOverlay({
          element: confEl,
          key: 'roster_conf',
          getValue: () => t.conf || 'Mecca',
          saveFn: async (val) => {
            const conf = (val || 'Mecca').trim();
            const validConfs = getConferences().map(c => c.id || c.name);
            if (!validConfs.includes(conf)) throw new Error('Conference must be one of: ' + validConfs.join(', '));
            await adminFetch('admin-teams', { method: 'POST', body: JSON.stringify({ id: t.id, conference: conf }) });
          },
          contentType: 'text',
          onSaved: refresh,
        });
      }

      const captainEl = document.getElementById('roster-captain-val');
      if (captainEl) {
        attachEditOverlay({
          element: captainEl,
          key: 'roster_captain',
          getValue: () => captainEl.textContent || '',
          saveFn: async (val) => {
            const v = (val || '').trim();
            await adminFetch('admin-teams', { method: 'POST', body: JSON.stringify({ id: t.id, captain: (v && v !== '—') ? v : null }) });
          },
          contentType: 'text',
          onSaved: refresh,
        });
      }

      listEl.querySelectorAll('.admin-roster-edit').forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const pid = btn.dataset.id;
          const currentName = btn.dataset.name;
          const newName = prompt('Player name:', currentName);
          if (newName != null && newName.trim() !== currentName) {
            adminFetch('admin-players', { method: 'POST', body: JSON.stringify({ id: pid, name: newName.trim() }) })
              .then(() => refresh())
              .catch(err => alert(err.message));
          }
        };
      });

      listEl.querySelectorAll('.admin-roster-remove').forEach(btn => {
        btn.onclick = async (e) => {
          e.stopPropagation();
          if (!confirm(`Remove "${btn.dataset.name}" from ${t.name}?`)) return;
          try {
            await adminFetch('admin-players', { method: 'POST', body: JSON.stringify({ delete: true, id: btn.dataset.id }) });
            refresh();
          } catch (err) { alert(err.message); }
        };
      });

      document.getElementById('roster-add-player-btn').onclick = () => {
        const name = prompt('Player name:');
        if (!name || !name.trim()) return;
        adminFetch('admin-players', { method: 'POST', body: JSON.stringify({ season_id: seasonId, name: name.trim(), team_id: t.id }) })
          .then(() => refresh())
          .catch(err => alert(err.message));
      };

      rosterPanel.classList.add('open');
      rosterPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };

    window.closeRoster = () => {
      window._adminActiveTeam = null;
      document.querySelectorAll('.team-card').forEach(c => c.classList.remove('selected'));
      rosterPanel.classList.remove('open');
    };
  })();
}

/**
 * Attach admin Edit/Stat sheet/Add game overlays to schedule page.
 * Use when admin uses visual mirror layout (renderAll populates #page-schedule).
 * Call after renderAll(); pass ctx.onScheduleSaved for refresh callback.
 */
export async function attachScheduleAdminOverlays(ctx) {
  const { adminFetch, supabase } = ctx;
  const onScheduleSaved = ctx.onScheduleSaved || (() => {});
  const seasonId = window.adminSeasonId;
  if (!seasonId) return;

  const { config } = await importRootJs('config.js');
  const teams = (config.DB.teams || []).filter(t => t && t.id);
  const scores = config.DB.scores || [];
  const pageSchedule = document.getElementById('page-schedule');
  if (!pageSchedule) return;

  const section = pageSchedule.querySelector('.section');
  if (!section) return;

  function openGameModal(game = null) {
    const backdrop = document.createElement('div');
    backdrop.className = 'admin-modal-backdrop';
    const isEdit = !!game;
    const body = {
      week: game?.week ?? 1,
      game_index: game?.game ?? 1,
      home_team_id: game?.t1Id || teams[0]?.id || '',
      away_team_id: game?.t2Id || teams[1]?.id || '',
      home_score: (game?.s1 ?? '') !== '' ? parseInt(game?.s1, 10) : null,
      away_score: (game?.s2 ?? '') !== '' ? parseInt(game?.s2, 10) : null,
      scheduled_at: scheduledAtToDatetimeLocalValue(game?.scheduled_at),
    };
    backdrop.innerHTML = `
      <div class="admin-modal" style="max-width:420px;">
        <h4>${isEdit ? 'Edit game' : 'Add game'}</h4>
        <form id="schedule-game-form">
          <input type="hidden" id="sg-id" value="${game?.gameId || ''}">
          <label style="display:block;margin:0.5rem 0;">Week: <input type="number" id="sg-week" min="1" value="${body.week}" required style="padding:0.4rem;width:60px;background:#1a1a1a;border:1px solid #444;color:#e8e4e0;"></label>
          <label style="display:block;margin:0.5rem 0;">Game #: <input type="number" id="sg-game-index" min="1" value="${body.game_index}" required style="padding:0.4rem;width:60px;background:#1a1a1a;border:1px solid #444;color:#e8e4e0;"></label>
          <label style="display:block;margin:0.5rem 0;">Home: <select id="sg-home" style="padding:0.4rem;background:#1a1a1a;border:1px solid #444;color:#e8e4e0;width:100%;">${teams.map(t => t ? `<option value="${t.id}" ${t.id === body.home_team_id ? 'selected' : ''}>${escapeHtml(t.name || '')}</option>` : '').join('')}</select></label>
          <label style="display:block;margin:0.5rem 0;">Away: <select id="sg-away" style="padding:0.4rem;background:#1a1a1a;border:1px solid #444;color:#e8e4e0;width:100%;">${teams.map(t => t ? `<option value="${t.id}" ${t.id === body.away_team_id ? 'selected' : ''}>${escapeHtml(t.name || '')}</option>` : '').join('')}</select></label>
          <label style="display:block;margin:0.5rem 0;">Home score: <input type="number" id="sg-home-score" min="0" value="${body.home_score ?? ''}" style="padding:0.4rem;width:60px;background:#1a1a1a;border:1px solid #444;color:#e8e4e0;"></label>
          <label style="display:block;margin:0.5rem 0;">Away score: <input type="number" id="sg-away-score" min="0" value="${body.away_score ?? ''}" style="padding:0.4rem;width:60px;background:#1a1a1a;border:1px solid #444;color:#e8e4e0;"></label>
          <label style="display:block;margin:0.5rem 0;">Scheduled at (your local time): <input type="datetime-local" id="sg-scheduled" value="${body.scheduled_at}" style="padding:0.4rem;background:#1a1a1a;border:1px solid #444;color:#e8e4e0;width:100%;"></label>
          <div class="admin-modal-actions" style="margin-top:1rem;">
            <button type="submit" class="btn-primary">Save</button>
            <button type="button" class="btn-secondary" id="sg-cancel">Cancel</button>
          </div>
        </form>
        <div id="sg-msg" class="admin-edit-msg" style="display:none;margin-top:0.5rem;"></div>
      </div>`;
    document.body.appendChild(backdrop);

    const close = () => backdrop.remove();
    backdrop.querySelector('#sg-cancel').onclick = close;
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });

    backdrop.querySelector('#schedule-game-form').onsubmit = async (e) => {
      e.preventDefault();
      const submitBtn = e.target.querySelector('[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      const id = backdrop.querySelector('#sg-id').value;
      const body = {
        week: parseInt(backdrop.querySelector('#sg-week').value),
        game_index: parseInt(backdrop.querySelector('#sg-game-index').value),
        home_team_id: backdrop.querySelector('#sg-home').value,
        away_team_id: backdrop.querySelector('#sg-away').value,
        home_score: backdrop.querySelector('#sg-home-score').value ? parseInt(backdrop.querySelector('#sg-home-score').value) : null,
        away_score: backdrop.querySelector('#sg-away-score').value ? parseInt(backdrop.querySelector('#sg-away-score').value) : null,
        scheduled_at: scheduledAtInputToIso(backdrop.querySelector('#sg-scheduled').value),
      };
      if (id) body.id = id; else body.season_id = seasonId;
      const msgEl = backdrop.querySelector('#sg-msg');
      try {
        await adminFetch('admin-games', { method: 'POST', body: JSON.stringify(body) });
        close();
        onScheduleSaved();
      } catch (err) {
        if (submitBtn) submitBtn.disabled = false;
        msgEl.textContent = err.message || 'Save failed.';
        msgEl.className = 'admin-edit-msg error';
        msgEl.style.display = 'block';
      }
    };
  }

  pageSchedule.querySelectorAll('.schedule-expand-btn').forEach(btn => {
    if (btn.previousElementSibling?.classList?.contains('admin-edit-btn')) return;
    const gameId = btn.dataset.gameId;
    const game = scores.find(s => String(s.gameId) === String(gameId));
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'admin-edit-btn';
    editBtn.textContent = 'Edit';
    editBtn.style.cssText = 'position:relative;margin-right:0.5rem;';
    editBtn.onclick = () => openGameModal(game);
    btn.parentNode.insertBefore(editBtn, btn);
    const statBtn = document.createElement('button');
    statBtn.type = 'button';
    statBtn.className = 'admin-edit-btn';
    statBtn.textContent = 'Stat sheet';
    statBtn.style.cssText = 'position:relative;margin-right:0.5rem;';
    statBtn.onclick = () => openStatSheet(game, pageSchedule, ctx, onScheduleSaved);
    btn.parentNode.insertBefore(statBtn, btn);
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'admin-edit-btn';
    removeBtn.textContent = 'Remove';
    removeBtn.style.cssText = 'position:relative;margin-right:0.5rem;background:rgba(200,80,80,0.85);';
    removeBtn.onclick = async () => {
      if (!game?.gameId || !confirm('Remove this game? This will also delete its stat sheet.')) return;
      try {
        await adminFetch('admin-games', { method: 'POST', body: JSON.stringify({ delete: true, id: game.gameId }) });
        onScheduleSaved();
      } catch (err) {
        alert('Failed to remove game: ' + (err.message || 'Unknown error'));
      }
    };
    btn.parentNode.insertBefore(removeBtn, btn);
  });

  const addGameBtn = section.querySelector('#admin-schedule-add-game-btn');
  if (addGameBtn && !addGameBtn.dataset.addGameHandlerAttached) {
    addGameBtn.dataset.addGameHandlerAttached = '1';
    addGameBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openGameModal(null);
    });
  }

  if (section && !section.querySelector('#admin-full-schedule-btn')) {
    const fullSchedBtn = document.createElement('button');
    fullSchedBtn.type = 'button';
    fullSchedBtn.id = 'admin-full-schedule-btn';
    fullSchedBtn.textContent = 'Edit Full Schedule';
    fullSchedBtn.style.cssText = 'margin-top:0.75rem;padding:0.4rem 0.8rem;background:#2a4a6a;color:#e8e4e0;border:1px solid #4a7a9a;border-radius:4px;cursor:pointer;display:block;';
    fullSchedBtn.onclick = () => renderFullScheduleEditor(pageSchedule, ctx);
    section.appendChild(fullSchedBtn);
  }
}

async function openStatSheet(game, content, ctx, onSaved) {
  if (!game) return;
  const { adminFetch, supabase } = ctx;
  const { config } = await importRootJs('config.js');
  const teams = config.DB.teams || [];
  const teamMap = {};
  teams.forEach(t => { teamMap[t.id] = t.name; });
  const wrap = document.createElement('div');
  wrap.id = 'admin-stat-sheet-wrap';
  wrap.style.cssText = 'display:flex;align-items:center;justify-content:center;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:100;overflow:auto;padding:2rem;';
  wrap.innerHTML = `
    <div style="background:#2a2a2a;max-width:900px;margin:0 auto;padding:1.5rem;border-radius:8px;">
      <h4>Stat sheet — ${escapeHtml(teamMap[game.t1Id] || '')} vs ${escapeHtml(teamMap[game.t2Id] || '')}</h4>
      <p id="stat-sheet-scores" style="margin:0.5rem 0;">Score: ${game.s1 || '?'} – ${game.s2 || '?'}</p>
      <div id="stat-sheet-content"></div>
      <div style="margin-top:1rem;">
        <button id="stat-sheet-save" style="padding:0.5rem 1rem;background:#c8a84b;color:#1a1a1a;border:none;border-radius:4px;cursor:pointer;">Save</button>
        <button id="stat-sheet-close" style="padding:0.5rem 1rem;background:#444;color:#e8e4e0;border:none;border-radius:4px;cursor:pointer;margin-left:0.5rem;">Close</button>
      </div>
      <div id="stat-sheet-msg" style="margin-top:0.5rem;"></div>
    </div>`;
  document.body.appendChild(wrap);

  const [{ data: rosters }, { data: players }, { data: statDefs }, { data: gsv }, { data: dnpRows }] = await Promise.all([
    supabase.from('rosters').select('*').or(`team_id.eq.${game.t1Id},team_id.eq.${game.t2Id}`),
    supabase.from('players').select('*').eq('season_id', window.adminSeasonId),
    supabase.from('stat_definitions').select('*').order('sort_order'),
    supabase.from('game_stat_values').select('*').eq('game_id', game.gameId),
    supabase.from('game_dnp').select('player_id').eq('game_id', game.gameId),
  ]);

  const playerMap = {};
  (players || []).forEach(p => { playerMap[p.id] = p; });
  const homeRoster = (rosters || []).filter(r => r.team_id === game.t1Id).map(r => ({ id: r.player_id, name: playerMap[r.player_id]?.name || '?' }));
  const awayRoster = (rosters || []).filter(r => r.team_id === game.t2Id).map(r => ({ id: r.player_id, name: playerMap[r.player_id]?.name || '?' }));
  const gsvMap = {};
  (gsv || []).forEach(row => {
    if (!gsvMap[row.player_id]) gsvMap[row.player_id] = {};
    gsvMap[row.player_id][row.stat_definition_id] = row.value;
  });
  const defs = (statDefs || []).filter(s => s.scope === 'game' || s.scope == null);
  const dnpSet = new Set((dnpRows || []).map(r => r.player_id));

  let html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;"><div><h5>Home</h5><table><thead><tr><th>Player</th><th>DNP</th>';
  defs.forEach(d => { html += `<th>${escapeHtml(d.name)}</th>`; });
  html += '</tr></thead><tbody>';
  const maxRows = Math.max(homeRoster.length, awayRoster.length, 1);
  for (let i = 0; i < maxRows; i++) {
    const p = homeRoster[i];
    const isDnp = p ? dnpSet.has(p.id) : false;
    html += '<tr><td>' + (p ? escapeHtml(p.name) : '—') + '</td>';
    html += `<td>${p ? `<input type="checkbox" class="dnp-check" data-player="${p.id}"${isDnp ? ' checked' : ''} style="cursor:pointer;width:16px;height:16px;">` : ''}</td>`;
    defs.forEach(d => {
      const val = p && !isDnp ? (gsvMap[p.id]?.[d.id] ?? '') : '';
      html += `<td><input type="number" min="0" step="any" data-player="${p?.id || ''}" data-stat="${d.id}" value="${val}"${isDnp ? ' disabled' : ''} style="width:50px;padding:0.25rem;background:#1a1a1a;border:1px solid #444;color:#e8e4e0;${isDnp ? 'opacity:0.3;' : ''}"></td>`;
    });
    html += '</tr>';
  }
  html += '</tbody></table></div><div><h5>Away</h5><table><thead><tr><th>Player</th><th>DNP</th>';
  defs.forEach(d => { html += `<th>${escapeHtml(d.name)}</th>`; });
  html += '</tr></thead><tbody>';
  for (let i = 0; i < maxRows; i++) {
    const p = awayRoster[i];
    const isDnp = p ? dnpSet.has(p.id) : false;
    html += '<tr><td>' + (p ? escapeHtml(p.name) : '—') + '</td>';
    html += `<td>${p ? `<input type="checkbox" class="dnp-check" data-player="${p.id}"${isDnp ? ' checked' : ''} style="cursor:pointer;width:16px;height:16px;">` : ''}</td>`;
    defs.forEach(d => {
      const val = p && !isDnp ? (gsvMap[p.id]?.[d.id] ?? '') : '';
      html += `<td><input type="number" min="0" step="any" data-player="${p?.id || ''}" data-stat="${d.id}" value="${val}"${isDnp ? ' disabled' : ''} style="width:50px;padding:0.25rem;background:#1a1a1a;border:1px solid #444;color:#e8e4e0;${isDnp ? 'opacity:0.3;' : ''}"></td>`;
    });
    html += '</tr>';
  }
  html += '</tbody></table></div></div>';
  const statSheetContentEl = wrap.querySelector('#stat-sheet-content');
  statSheetContentEl.innerHTML = homeRoster.length || awayRoster.length ? html : '<p>Add players to teams first.</p>';

  statSheetContentEl.querySelectorAll('input.dnp-check').forEach(cb => {
    cb.addEventListener('change', () => {
      const pid = cb.dataset.player;
      statSheetContentEl.querySelectorAll(`input[data-player="${pid}"][data-stat]`).forEach(inp => {
        inp.disabled = cb.checked;
        inp.style.opacity = cb.checked ? '0.3' : '';
        if (cb.checked) inp.value = '';
      });
    });
  });

  wrap.querySelector('#stat-sheet-close').onclick = () => wrap.remove();
  wrap.querySelector('#stat-sheet-save').onclick = async () => {
    const dnpPlayerIds = [];
    wrap.querySelectorAll('input.dnp-check:checked').forEach(cb => {
      if (cb.dataset.player) dnpPlayerIds.push(cb.dataset.player);
    });
    const values = [];
    wrap.querySelectorAll('input[data-player][data-stat]').forEach(inp => {
      const pid = inp.dataset.player;
      if (!pid || inp.disabled) return;
      const val = inp.value.trim() === '' ? 0 : parseFloat(inp.value);
      values.push({ player_id: pid, stat_definition_id: inp.dataset.stat, value: isNaN(val) ? 0 : val });
    });
    try {
      await adminFetch('admin-game-stats', { method: 'POST', body: JSON.stringify({ game_id: game.gameId, values, dnp_player_ids: dnpPlayerIds }) });
      wrap.querySelector('#stat-sheet-msg').innerHTML = '<p class="msg success">Saved.</p>';
      const { data: updated } = await supabase.from('games').select('home_score,away_score').eq('id', game.gameId).single();
      if (updated) wrap.querySelector('#stat-sheet-scores').textContent = `Score: ${updated.home_score ?? '?'} – ${updated.away_score ?? '?'}`;
      if (onSaved) await onSaved();
      else if (content) {
        const sections = await import('./sections.js');
        await sections.renderSchedule(content, ctx);
      }
    } catch (e) {
      wrap.querySelector('#stat-sheet-msg').innerHTML = `<p class="msg error">${e.message}</p>`;
    }
  };
}

export async function renderGames(content, ctx) {
  const { adminFetch, supabase } = ctx;
  const seasonId = window.adminSeasonId;
  if (!seasonId) {
    content.innerHTML = '<p>Select a season first.</p>';
    return;
  }
  const [{ data: games }, { data: teams }] = await Promise.all([
    supabase.from('games').select('*').eq('season_id', seasonId).order('week').order('game_index'),
    supabase.from('teams').select('*').eq('season_id', seasonId),
  ]);
  const teamMap = {};
  (teams || []).forEach(t => { teamMap[t.id] = t.name; });
  content.innerHTML = `
    <div id="games-msg"></div>
    <p><button id="games-add-btn">Add game</button></p>
    <div id="games-list"></div>
    <div id="games-stat-sheet-wrap" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:100;overflow:auto;padding:2rem;">
      <div style="background:#2a2a2a;max-width:900px;margin:0 auto;padding:1.5rem;border-radius:8px;">
        <h4 id="games-stat-sheet-title">Stat sheet</h4>
        <p id="games-stat-sheet-scores" style="margin:0.5rem 0;"></p>
        <p id="games-stat-sheet-note" class="msg" style="font-size:0.9rem;display:none;">Scores auto-update from points when stat sheet is saved.</p>
        <div id="games-stat-sheet-content"></div>
        <div style="margin-top:1rem;">
          <button id="games-stat-sheet-save">Save</button>
          <button id="games-stat-sheet-close">Close</button>
        </div>
        <div id="games-stat-sheet-msg"></div>
      </div>
    </div>
    <div id="games-form-wrap" style="display:none;margin-top:1rem;max-width:500px;">
      <h4 id="games-form-title">Add game</h4>
      <form id="games-form">
        <input type="hidden" id="games-id">
        <label>Week: <input type="number" id="games-week" min="1" required style="padding:0.4rem;width:60px;background:#2a2a2a;border:1px solid #444;color:#e8e4e0;"></label>
        <label>Game #: <input type="number" id="games-game-index" min="1" required style="padding:0.4rem;width:60px;background:#2a2a2a;border:1px solid #444;color:#e8e4e0;"></label><br>
        <label style="display:block;margin:0.5rem 0;">Home: <select id="games-home" style="padding:0.4rem;background:#2a2a2a;border:1px solid #444;color:#e8e4e0;">${(teams || []).map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('')}</select></label>
        <label style="display:block;margin:0.5rem 0;">Away: <select id="games-away" style="padding:0.4rem;background:#2a2a2a;border:1px solid #444;color:#e8e4e0;">${(teams || []).map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('')}</select></label>
        <label style="display:block;margin:0.5rem 0;">Home score: <input type="number" id="games-home-score" min="0" style="padding:0.4rem;width:60px;background:#2a2a2a;border:1px solid #444;color:#e8e4e0;"></label>
        <label style="display:block;margin:0.5rem 0;">Away score: <input type="number" id="games-away-score" min="0" style="padding:0.4rem;width:60px;background:#2a2a2a;border:1px solid #444;color:#e8e4e0;"></label>
        <label style="display:block;margin:0.5rem 0;">Scheduled at (local time, or full ISO with Z): <input type="text" id="games-scheduled" placeholder="2026-01-15T18:00" style="padding:0.4rem;background:#2a2a2a;border:1px solid #444;color:#e8e4e0;width:100%;"></label>
        <button type="submit">Save</button>
        <button type="button" id="games-cancel">Cancel</button>
      </form>
    </div>
  `;
  const weeks = [...new Set((games || []).map(g => g.week))].sort((a, b) => a - b);
  document.getElementById('games-list').innerHTML = weeks.map(w => {
    const gs = (games || []).filter(g => g.week === w);
    return `<div style="margin-bottom:1rem;"><strong>Week ${w}</strong><ul style="list-style:none;padding:0;">${gs.map(g => `
      <li style="padding:0.3rem 0;">${escapeHtml(teamMap[g.home_team_id] || '')} vs ${escapeHtml(teamMap[g.away_team_id] || '')} — ${g.home_score ?? '?'}-${g.away_score ?? '?'}
      <button data-id="${g.id}" class="game-edit">Edit</button>
      <button data-id="${g.id}" class="game-stat-sheet">Stat sheet</button>
      <button data-id="${g.id}" class="game-del">Delete</button></li>
    `).join('')}</ul></div>`;
  }).join('') || '<p>No games yet.</p>';

  const wrap = document.getElementById('games-form-wrap');
  const showForm = (g = null) => {
    wrap.style.display = 'block';
    document.getElementById('games-form-title').textContent = g ? 'Edit game' : 'Add game';
    document.getElementById('games-id').value = g?.id || '';
    document.getElementById('games-week').value = g?.week ?? '';
    document.getElementById('games-game-index').value = g?.game_index ?? '';
    document.getElementById('games-home').value = g?.home_team_id || '';
    document.getElementById('games-away').value = g?.away_team_id || '';
    document.getElementById('games-home-score').value = g?.home_score ?? '';
    document.getElementById('games-away-score').value = g?.away_score ?? '';
    document.getElementById('games-scheduled').value = scheduledAtToDatetimeLocalValue(g?.scheduled_at);
  };
  document.getElementById('games-add-btn').onclick = () => showForm();
  document.getElementById('games-cancel').onclick = () => { wrap.style.display = 'none'; };
  document.getElementById('games-list').querySelectorAll('.game-edit').forEach(btn => {
    const g = games.find(x => x.id === btn.dataset.id);
    if (g) btn.onclick = () => showForm(g);
  });
  document.getElementById('games-list').querySelectorAll('.game-del').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm('Delete this game?')) return;
      try {
        await adminFetch('admin-games', { method: 'POST', body: JSON.stringify({ delete: true, id: btn.dataset.id }) });
        renderGames(content, ctx);
      } catch (e) { document.getElementById('games-msg').innerHTML = `<p class="msg error">${e.message}</p>`; }
    };
  });

  const statSheetWrap = document.getElementById('games-stat-sheet-wrap');
  const statSheetContent = document.getElementById('games-stat-sheet-content');
  const statSheetTitle = document.getElementById('games-stat-sheet-title');
  const statSheetScores = document.getElementById('games-stat-sheet-scores');
  const statSheetNote = document.getElementById('games-stat-sheet-note');
  const statSheetMsg = document.getElementById('games-stat-sheet-msg');

  document.getElementById('games-stat-sheet-close').onclick = () => { statSheetWrap.style.display = 'none'; };

  document.getElementById('games-list').querySelectorAll('.game-stat-sheet').forEach(btn => {
    btn.onclick = async () => {
      const g = games.find(x => x.id === btn.dataset.id);
      if (!g) return;
      statSheetWrap.style.display = 'block';
      statSheetTitle.textContent = `${teamMap[g.home_team_id] || ''} vs ${teamMap[g.away_team_id] || ''} — Week ${g.week}, Game ${g.game_index}`;
      statSheetScores.textContent = `Score: ${g.home_score ?? '?'} – ${g.away_score ?? '?'}`;
      statSheetNote.style.display = 'block';
      statSheetMsg.innerHTML = '';

      const [{ data: rosters }, { data: players }, { data: statDefs }, { data: gsv }, { data: dnpRows }] = await Promise.all([
        supabase.from('rosters').select('*').or(`team_id.eq.${g.home_team_id},team_id.eq.${g.away_team_id}`),
        supabase.from('players').select('*').eq('season_id', g.season_id),
        supabase.from('stat_definitions').select('*').order('sort_order'),
        supabase.from('game_stat_values').select('*').eq('game_id', g.id),
        supabase.from('game_dnp').select('player_id').eq('game_id', g.id),
      ]);

      const playerMap = {};
      (players || []).forEach(p => { playerMap[p.id] = p; });
      const homeRoster = (rosters || []).filter(r => r.team_id === g.home_team_id).map(r => ({ id: r.player_id, name: playerMap[r.player_id]?.name || '?' }));
      const awayRoster = (rosters || []).filter(r => r.team_id === g.away_team_id).map(r => ({ id: r.player_id, name: playerMap[r.player_id]?.name || '?' }));

      const gsvMap = {};
      (gsv || []).forEach(row => {
        if (!gsvMap[row.player_id]) gsvMap[row.player_id] = {};
        gsvMap[row.player_id][row.stat_definition_id] = row.value;
      });

      const defs = (statDefs || []).filter(s => s.scope === 'game' || s.scope == null);
      if (homeRoster.length === 0 && awayRoster.length === 0) {
        statSheetContent.innerHTML = '<p class="msg">Add players to teams in Players tab first.</p>';
        document.getElementById('games-stat-sheet-save').style.display = 'none';
        return;
      }
      document.getElementById('games-stat-sheet-save').style.display = '';

      const dnpSet = new Set((dnpRows || []).map(r => r.player_id));
      const maxRows = Math.max(homeRoster.length, awayRoster.length, 1);
      let html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;overflow-x:auto;"><div><h5>Home</h5><table><thead><tr><th>Player</th><th>DNP</th>';
      defs.forEach(d => { html += `<th>${escapeHtml(d.name)}</th>`; });
      html += '</tr></thead><tbody>';
      for (let i = 0; i < maxRows; i++) {
        const p = homeRoster[i];
        const isDnp = p ? dnpSet.has(p.id) : false;
        html += '<tr>';
        html += `<td>${p ? escapeHtml(p.name) : '—'}</td>`;
        html += `<td>${p ? `<input type="checkbox" class="dnp-check" data-player="${p.id}"${isDnp ? ' checked' : ''} style="cursor:pointer;width:16px;height:16px;">` : ''}</td>`;
        defs.forEach(d => {
          const val = p && !isDnp ? (gsvMap[p.id]?.[d.id] ?? '') : '';
          html += `<td><input type="number" min="0" step="any" data-player="${p?.id || ''}" data-stat="${d.id}" value="${val}"${isDnp ? ' disabled' : ''} style="width:50px;padding:0.25rem;background:#1a1a1a;border:1px solid #444;color:#e8e4e0;${isDnp ? 'opacity:0.3;' : ''}"></td>`;
        });
        html += '</tr>';
      }
      html += '</tbody></table></div><div><h5>Away</h5><table><thead><tr><th>Player</th><th>DNP</th>';
      defs.forEach(d => { html += `<th>${escapeHtml(d.name)}</th>`; });
      html += '</tr></thead><tbody>';
      for (let i = 0; i < maxRows; i++) {
        const p = awayRoster[i];
        const isDnp = p ? dnpSet.has(p.id) : false;
        html += '<tr>';
        html += `<td>${p ? escapeHtml(p.name) : '—'}</td>`;
        html += `<td>${p ? `<input type="checkbox" class="dnp-check" data-player="${p.id}"${isDnp ? ' checked' : ''} style="cursor:pointer;width:16px;height:16px;">` : ''}</td>`;
        defs.forEach(d => {
          const val = p && !isDnp ? (gsvMap[p.id]?.[d.id] ?? '') : '';
          html += `<td><input type="number" min="0" step="any" data-player="${p?.id || ''}" data-stat="${d.id}" value="${val}"${isDnp ? ' disabled' : ''} style="width:50px;padding:0.25rem;background:#1a1a1a;border:1px solid #444;color:#e8e4e0;${isDnp ? 'opacity:0.3;' : ''}"></td>`;
        });
        html += '</tr>';
      }
      html += '</tbody></table></div></div>';
      statSheetContent.innerHTML = html;

      statSheetContent.querySelectorAll('input.dnp-check').forEach(cb => {
        cb.addEventListener('change', () => {
          const pid = cb.dataset.player;
          statSheetContent.querySelectorAll(`input[data-player="${pid}"][data-stat]`).forEach(inp => {
            inp.disabled = cb.checked;
            inp.style.opacity = cb.checked ? '0.3' : '';
            if (cb.checked) inp.value = '';
          });
        });
      });

      document.getElementById('games-stat-sheet-save').onclick = async () => {
        const dnpPlayerIds = [];
        statSheetContent.querySelectorAll('input.dnp-check:checked').forEach(cb => {
          if (cb.dataset.player) dnpPlayerIds.push(cb.dataset.player);
        });
        const values = [];
        statSheetContent.querySelectorAll('input[data-player][data-stat]').forEach(inp => {
          const pid = inp.dataset.player;
          if (!pid || inp.disabled) return;
          const val = inp.value.trim() === '' ? 0 : parseFloat(inp.value);
          if (isNaN(val)) return;
          values.push({ player_id: pid, stat_definition_id: inp.dataset.stat, value: val });
        });
        try {
          await adminFetch('admin-game-stats', { method: 'POST', body: JSON.stringify({ game_id: g.id, values, dnp_player_ids: dnpPlayerIds }) });
          statSheetMsg.innerHTML = '<p class="msg success">Saved.</p>';
          const { data: updated } = await supabase.from('games').select('home_score,away_score').eq('id', g.id).single();
          if (updated) statSheetScores.textContent = `Score: ${updated.home_score ?? '?'} – ${updated.away_score ?? '?'}`;
          renderGames(content, ctx);
        } catch (e) {
          statSheetMsg.innerHTML = `<p class="msg error">${e.message}</p>`;
        }
      };
    };
  });

  document.getElementById('games-form').onsubmit = async (e) => {
    e.preventDefault();
    const id = document.getElementById('games-id').value;
    const body = {
      week: parseInt(document.getElementById('games-week').value),
      game_index: parseInt(document.getElementById('games-game-index').value),
      home_team_id: document.getElementById('games-home').value,
      away_team_id: document.getElementById('games-away').value,
      home_score: document.getElementById('games-home-score').value ? parseInt(document.getElementById('games-home-score').value) : null,
      away_score: document.getElementById('games-away-score').value ? parseInt(document.getElementById('games-away-score').value) : null,
      scheduled_at: scheduledAtInputToIso(document.getElementById('games-scheduled').value),
    };
    if (id) body.id = id; else body.season_id = seasonId;
    try {
      await adminFetch('admin-games', { method: 'POST', body: JSON.stringify(body) });
      document.getElementById('games-msg').innerHTML = '<p class="msg success">Saved.</p>';
      wrap.style.display = 'none';
      renderGames(content, ctx);
    } catch (e) { document.getElementById('games-msg').innerHTML = `<p class="msg error">${e.message}</p>`; }
  };
}

export async function renderAwards(content, ctx) {
  const { adminFetch, supabase } = ctx;
  const seasonId = window.adminSeasonId;
  if (!seasonId) {
    content.innerHTML = '<p>Select a season first.</p>';
    return;
  }
  const { data: awards } = await supabase.from('awards').select('*').eq('season_id', seasonId).order('week');
  const weekAwards = {};
  (awards || []).forEach(a => { weekAwards[a.week] = a; });
  const weeks = [...new Set((awards || []).map(a => a.week))].sort((a, b) => a - b);
  if (weeks.length === 0) weeks.push(1);
  content.innerHTML = `
    <div id="awards-msg"></div>
    <label>Week: <select id="awards-week" style="padding:0.4rem;background:#2a2a2a;border:1px solid #444;color:#e8e4e0;">${weeks.map(w => `<option value="${w}">${w}</option>`).join('')}</select></label>
    <form id="awards-form" style="max-width:500px;margin-top:1rem;">
      <h4>Weekly</h4>
      <label style="display:block;margin:0.5rem 0;">Akhlaq: <input type="text" id="awards-akhlaq" style="padding:0.4rem;width:100%;background:#2a2a2a;border:1px solid #444;color:#e8e4e0;"></label>
      <label style="display:block;margin:0.5rem 0;">Akhlaq Post (Instagram URL): <input type="url" id="awards-akhlaq-post-url" placeholder="https://www.instagram.com/p/XXXXX/" style="padding:0.4rem;width:100%;background:#2a2a2a;border:1px solid #444;color:#e8e4e0;"></label>
      <h4 style="margin-top:1rem;">Season</h4>
      <label style="display:block;margin:0.5rem 0;">Champ: <input type="text" id="awards-champ" style="padding:0.4rem;width:100%;background:#2a2a2a;border:1px solid #444;color:#e8e4e0;"></label>
      <label style="display:block;margin:0.5rem 0;">MVP: <input type="text" id="awards-mvp" style="padding:0.4rem;width:100%;background:#2a2a2a;border:1px solid #444;color:#e8e4e0;"></label>
      <label style="display:block;margin:0.5rem 0;">Scoring: <input type="text" id="awards-scoring" style="padding:0.4rem;width:100%;background:#2a2a2a;border:1px solid #444;color:#e8e4e0;"></label>
      <button type="submit" style="margin-top:1rem;">Save</button>
    </form>
  `;
  const loadWeek = (w) => {
    const a = weekAwards[w] || {};
    document.getElementById('awards-akhlaq').value = a.akhlaq || '';
    document.getElementById('awards-akhlaq-post-url').value = a.akhlaq_post_url || '';
    document.getElementById('awards-champ').value = a.champ || '';
    document.getElementById('awards-mvp').value = a.mvp || '';
    document.getElementById('awards-scoring').value = a.scoring || '';
  };
  document.getElementById('awards-week').value = weeks[0];
  loadWeek(weeks[0]);
  document.getElementById('awards-week').onchange = () => loadWeek(parseInt(document.getElementById('awards-week').value));
  document.getElementById('awards-form').onsubmit = async (e) => {
    e.preventDefault();
    const week = parseInt(document.getElementById('awards-week').value);
    try {
      await adminFetch('admin-awards', {
        method: 'POST',
        body: JSON.stringify({
          season_id: seasonId,
          week,
          akhlaq: document.getElementById('awards-akhlaq').value,
          akhlaq_post_url: document.getElementById('awards-akhlaq-post-url').value || null,
          motm1: null,
          motm2: null,
          motm3: null,
          champ: document.getElementById('awards-champ').value,
          mvp: document.getElementById('awards-mvp').value,
          scoring: document.getElementById('awards-scoring').value,
        }),
      });
      document.getElementById('awards-msg').innerHTML = '<p class="msg success">Saved.</p>';
      renderAwards(content, ctx);
    } catch (e) { document.getElementById('awards-msg').innerHTML = `<p class="msg error">${e.message}</p>`; }
  };

}

export async function renderAdminMvpLadder(content, ctx) {
  const { adminFetch } = ctx;
  const seasonId = window.adminSeasonId;
  if (!seasonId || !content) return;

  const { config: adminConfig } = await importRootJs('config.js');
  const allPlayers = [];
  (adminConfig.DB?.teams || []).forEach(t => {
    (t.roster || []).forEach(p => { allPlayers.push({ id: p.id, name: p.name, team: t.name }); });
  });
  allPlayers.sort((a, b) => a.name.localeCompare(b.name));

  let currentLadderData = {};
  try {
    const raw = adminConfig.DB?.contentBlocks?.mvp_ladder_data;
    if (raw) currentLadderData = JSON.parse(raw);
  } catch (_) {}

  const currentWeek = adminConfig.CURRENT_WEEK || 1;
  const weekOpts = Array.from({ length: currentWeek }, (_, i) => i + 1)
    .map(w => `<option value="${w}"${w === currentWeek ? ' selected' : ''}>Week ${w}${w === currentWeek ? ' (Current)' : ''}</option>`)
    .join('');

  content.innerHTML = `
    <h4 style="color:#c8a84b;margin:0 0 0.7rem;font-size:0.9rem;letter-spacing:0.08em;text-transform:uppercase;">Edit Midseason MVP Ranking</h4>
    <div id="ladder-msg" style="margin-bottom:0.5rem;min-height:1.2rem;"></div>
    <div style="margin-bottom:1rem;">
      <label style="color:#c8c0b0;font-size:0.85rem;margin-right:0.5rem;">Save to Week</label>
      <select id="ladder-week-select" style="background:#0a1f2e;border:1px solid rgba(200,168,75,0.3);color:#f5f0e8;padding:0.4rem 0.6rem;border-radius:4px;">${weekOpts}</select>
      <div style="margin-top:0.4rem;font-size:0.78rem;color:#8a8580;">Ladder shows from this week onward until overwritten by a later week's entry.</div>
    </div>
    <div id="ladder-slots" style="display:flex;flex-direction:column;gap:0.45rem;margin-bottom:1rem;"></div>
    <button id="ladder-save-btn" style="padding:0.5rem 1.4rem;background:#c8a84b;color:#060f1a;border:none;border-radius:4px;font-weight:700;cursor:pointer;font-size:0.9rem;">Save Ladder</button>`;

  const slotsEl = content.querySelector('#ladder-slots');
  const weekSelEl = content.querySelector('#ladder-week-select');
  const playerOptHtml = `<option value="">— Select player —</option>` +
    allPlayers.map(p => `<option value="${p.id}">${p.name} (${p.team})</option>`).join('');

  const DEFAULT_NAMES = ['Saif', 'Alireza', 'Raamiz', 'Tahir', 'Dayyem', 'Imran', 'Raza', 'Aun Ali', 'Hyder', 'Humza Hussain'];
  function defaultLadderIds() {
    return DEFAULT_NAMES.map(n => {
      const nl = n.toLowerCase();
      const p = allPlayers.find(pl => pl.name.toLowerCase() === nl || pl.name.toLowerCase().startsWith(nl + ' ') || pl.name.toLowerCase().startsWith(nl));
      return p?.id || '';
    });
  }

  function buildSlots(ladderIds = []) {
    slotsEl.innerHTML = '';
    for (let i = 0; i < 10; i++) {
      const selectedId = ladderIds[i] || '';
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:0.6rem;';
      row.innerHTML = `
        <span style="color:#c8a84b;font-family:'Cinzel',serif;font-size:0.82rem;width:1.8rem;text-align:right;flex-shrink:0;">#${i + 1}</span>
        <input type="text" placeholder="Search..." style="padding:0.35rem 0.5rem;background:#0a1f2e;border:1px solid rgba(200,168,75,0.2);color:#c8c0b0;border-radius:4px;font-size:0.82rem;width:120px;flex-shrink:0;" />
        <select style="flex:1;padding:0.35rem 0.5rem;background:#0a1f2e;border:1px solid rgba(200,168,75,0.2);color:#f5f0e8;border-radius:4px;font-size:0.85rem;">${playerOptHtml}</select>`;
      slotsEl.appendChild(row);
      const searchInput = row.querySelector('input');
      const select = row.querySelector('select');
      if (selectedId) select.value = selectedId;
      searchInput.addEventListener('input', () => {
        const q = searchInput.value.toLowerCase();
        Array.from(select.options).forEach(opt => {
          opt.hidden = q.length > 0 && opt.value !== '' && !opt.textContent.toLowerCase().includes(q);
        });
      });
    }
  }

  function loadWeekLadder(w) {
    const keys = Object.keys(currentLadderData).map(Number).filter(k => k <= w).sort((a, b) => b - a);
    buildSlots(keys.length > 0 ? (currentLadderData[String(keys[0])] || []) : defaultLadderIds());
  }

  loadWeekLadder(currentWeek);
  weekSelEl.addEventListener('change', () => loadWeekLadder(parseInt(weekSelEl.value)));

  content.querySelector('#ladder-save-btn').addEventListener('click', async () => {
    const msgEl = content.querySelector('#ladder-msg');
    const week = parseInt(weekSelEl.value);
    const ids = Array.from(slotsEl.querySelectorAll('select')).map(s => s.value).filter(Boolean);
    currentLadderData[String(week)] = ids;
    try {
      await adminFetch('admin-content', {
        method: 'POST',
        body: JSON.stringify([{ key: 'mvp_ladder_data', value: JSON.stringify(currentLadderData), season_id: seasonId }]),
      });
      if (adminConfig.DB?.contentBlocks) adminConfig.DB.contentBlocks.mvp_ladder_data = JSON.stringify(currentLadderData);
      msgEl.innerHTML = '<span style="color:#2fa89a;font-size:0.85rem;">Saved.</span>';
      setTimeout(() => { msgEl.innerHTML = ''; }, 2500);
      const awardsWeekEl = document.getElementById('awards-week-select');
      if (awardsWeekEl && typeof window.renderAwards === 'function') {
        window.renderAwards(parseInt(awardsWeekEl.value) || week);
      }
    } catch (err) {
      msgEl.innerHTML = `<span style="color:#e07070;font-size:0.85rem;">${err.message}</span>`;
    }
  });
}

export async function renderStats(content, ctx) {
  const { adminFetch, supabase } = ctx;
  const seasonId = window.adminSeasonId;
  const { data: statDefs } = await supabase.from('stat_definitions').select('*').order('sort_order');
  const [{ data: players }, { data: playerStats }] = seasonId
    ? await Promise.all([
        supabase.from('players').select('*').eq('season_id', seasonId),
        supabase.from('player_stat_values').select('*'),
      ])
    : [{ data: [] }, { data: [] }];
  const psvMap = {};
  (playerStats || []).forEach(ps => {
    const k = `${ps.player_id}-${ps.stat_definition_id}`;
    psvMap[k] = ps.value;
  });

  const inputStyle = 'width:55px;padding:0.25rem 0.3rem;background:#1a2a3a;border:1px solid #444;color:#e8e4e0;border-radius:3px;font-size:0.9rem;';
  const thStyle = 'padding:0.4rem 0.6rem;text-align:left;color:#c8a84b;font-size:0.8rem;letter-spacing:0.06em;border-bottom:1px solid rgba(200,168,75,0.2);white-space:nowrap;';
  const tdStyle = 'padding:0.3rem 0.6rem;border-bottom:1px solid rgba(255,255,255,0.05);';

  // Build stat defs list
  const defsHtml = (statDefs || []).length
    ? `<table style="border-collapse:collapse;width:100%;margin-bottom:0.5rem;">
        <thead><tr>
          <th style="${thStyle}">Name</th>
          <th style="${thStyle}">Slug</th>
          <th style="${thStyle}">Scope</th>
          <th style="${thStyle}">Sort</th>
          <th style="${thStyle}"></th>
        </tr></thead>
        <tbody>
        ${(statDefs || []).map(s => `
          <tr>
            <td style="${tdStyle}">${escapeHtml(s.name)}</td>
            <td style="${tdStyle};color:#c8c0b0;font-size:0.85rem;">${escapeHtml(s.slug)}</td>
            <td style="${tdStyle};color:#c8c0b0;font-size:0.85rem;">${escapeHtml(s.scope || 'game')}</td>
            <td style="${tdStyle};color:#c8c0b0;font-size:0.85rem;">${s.sort_order ?? 0}</td>
            <td style="${tdStyle}"><button data-id="${escapeHtml(s.id)}" class="stat-def-del" style="padding:0.2rem 0.5rem;font-size:0.78rem;background:rgba(200,80,80,0.7);border:none;border-radius:3px;color:#fff;cursor:pointer;">Delete</button></td>
          </tr>`).join('')}
        </tbody>
      </table>`
    : '<p style="color:#c8c0b0;font-style:italic;font-size:0.9rem;">No stat types yet.</p>';

  // Build player values table (all stats)
  const gameDefs = (statDefs || []).filter(s => s.scope === 'game' || s.scope == null);
  let valuesHtml = '';
  if (!seasonId) {
    valuesHtml = '<p style="color:#c8c0b0;font-size:0.9rem;">Select a season first.</p>';
  } else if (!players?.length) {
    valuesHtml = '<p style="color:#c8c0b0;font-size:0.9rem;">No players in this season.</p>';
  } else if (!gameDefs.length) {
    valuesHtml = '<p style="color:#c8c0b0;font-size:0.9rem;">Add stat types above first.</p>';
  } else {
    const defHeaders = gameDefs.map(d => `<th style="${thStyle}">${escapeHtml(d.name)}</th>`).join('');
    const playerRows = (players || []).map(p => {
      const defInputs = gameDefs.map(d => {
        const val = psvMap[`${p.id}-${d.id}`] ?? '';
        return `<td style="${tdStyle}"><input type="number" min="0" step="any" data-pid="${escapeHtml(p.id)}" data-sid="${escapeHtml(d.id)}" value="${escapeHtml(String(val))}" style="${inputStyle}" class="stat-value-input"></td>`;
      }).join('');
      return `<tr><td style="${tdStyle};color:#e8e4e0;">${escapeHtml(p.name)}</td>${defInputs}</tr>`;
    }).join('');
    valuesHtml = `<div style="overflow-x:auto;">
      <table style="border-collapse:collapse;min-width:100%;">
        <thead><tr><th style="${thStyle}">Player</th>${defHeaders}</tr></thead>
        <tbody>${playerRows}</tbody>
      </table>
    </div>
    <p style="font-size:0.8rem;color:#c8c0b0;margin-top:0.5rem;">These season totals are used only when no game stat sheets have been entered.</p>`;
  }

  content.innerHTML = `
    <div id="stats-msg"></div>
    <h4 style="margin:0 0 0.75rem;">Stat Types</h4>
    <div id="stats-defs">${defsHtml}</div>
    <form id="stats-add-form" style="display:flex;flex-wrap:wrap;gap:0.5rem;align-items:flex-end;margin-top:0.75rem;padding:0.75rem;background:rgba(200,168,75,0.05);border:1px solid rgba(200,168,75,0.15);border-radius:4px;">
      <div style="display:flex;flex-direction:column;gap:0.25rem;">
        <label style="font-size:0.75rem;color:#c8a84b;">Name</label>
        <input id="stat-add-name" type="text" placeholder="e.g. Assists" style="padding:0.35rem 0.5rem;background:#1a2a3a;border:1px solid #555;color:#e8e4e0;border-radius:3px;width:120px;">
      </div>
      <div style="display:flex;flex-direction:column;gap:0.25rem;">
        <label style="font-size:0.75rem;color:#c8a84b;">Slug</label>
        <input id="stat-add-slug" type="text" placeholder="e.g. ast" style="padding:0.35rem 0.5rem;background:#1a2a3a;border:1px solid #555;color:#e8e4e0;border-radius:3px;width:90px;">
      </div>
      <div style="display:flex;flex-direction:column;gap:0.25rem;">
        <label style="font-size:0.75rem;color:#c8a84b;">Scope</label>
        <select id="stat-add-scope" style="padding:0.35rem 0.5rem;background:#1a2a3a;border:1px solid #555;color:#e8e4e0;border-radius:3px;">
          <option value="game">Game (box scores)</option>
          <option value="season">Season only</option>
        </select>
      </div>
      <div style="display:flex;flex-direction:column;gap:0.25rem;">
        <label style="font-size:0.75rem;color:#c8a84b;">Sort</label>
        <input id="stat-add-sort" type="number" value="${(statDefs || []).length}" min="0" style="padding:0.35rem 0.5rem;background:#1a2a3a;border:1px solid #555;color:#e8e4e0;border-radius:3px;width:60px;">
      </div>
      <button type="submit" style="padding:0.4rem 1rem;background:#c8a84b;color:#1a1a1a;border:none;border-radius:3px;cursor:pointer;font-weight:600;align-self:flex-end;">Add Stat</button>
    </form>
    <h4 style="margin:1.5rem 0 0.5rem;">Season Player Totals</h4>
    <div id="stats-values">${valuesHtml}</div>
  `;

  // Auto-generate slug from name
  document.getElementById('stat-add-name').addEventListener('input', function () {
    const slug = this.value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    document.getElementById('stat-add-slug').value = slug;
  });

  document.getElementById('stats-add-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('stat-add-name').value.trim();
    const slug = document.getElementById('stat-add-slug').value.trim();
    const scope = document.getElementById('stat-add-scope').value;
    const sort_order = parseInt(document.getElementById('stat-add-sort').value) || 0;
    if (!name || !slug) { document.getElementById('stats-msg').innerHTML = '<p class="msg error">Name and slug are required.</p>'; return; }
    try {
      await adminFetch('admin-stats', { method: 'POST', body: JSON.stringify({ type: 'definition', name, slug, scope, sort_order }) });
      renderStats(content, ctx);
    } catch (e2) { document.getElementById('stats-msg').innerHTML = `<p class="msg error">${e2.message}</p>`; }
  });

  document.getElementById('stats-defs').querySelectorAll('.stat-def-del').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm('Delete this stat type? All recorded values for it will be lost.')) return;
      try {
        await adminFetch('admin-stats', { method: 'POST', body: JSON.stringify({ type: 'definition', delete: true, id: btn.dataset.id }) });
        renderStats(content, ctx);
      } catch (e2) { document.getElementById('stats-msg').innerHTML = `<p class="msg error">${e2.message}</p>`; }
    };
  });

  document.querySelectorAll('.stat-value-input').forEach(input => {
    input.addEventListener('change', async function () {
      try {
        await adminFetch('admin-stats', {
          method: 'POST',
          body: JSON.stringify({ type: 'value', player_id: this.dataset.pid, stat_definition_id: this.dataset.sid, value: parseFloat(this.value) || 0 }),
        });
      } catch (e2) { document.getElementById('stats-msg').innerHTML = `<p class="msg error">${e2.message}</p>`; }
    });
  });
}

export async function renderSponsors(content, ctx) {
  const { adminFetch, supabase } = ctx;
  const seasonId = window.adminSeasonId;
  if (!seasonId) {
    content.innerHTML = '<p>Select a season first.</p>';
    return;
  }
  const { data: sponsors } = await supabase.from('sponsors').select('*').eq('season_id', seasonId);
  content.innerHTML = `
    <div id="sponsors-msg"></div>
    <p><button id="sponsors-add-btn">Add sponsor</button></p>
    <ul id="sponsors-list" style="list-style:none;padding:0;"></ul>
    <div id="sponsors-form-wrap" style="display:none;margin-top:1rem;max-width:400px;">
      <h4 id="sponsors-form-title">Add sponsor</h4>
      <form id="sponsors-form">
        <input type="hidden" id="sponsors-id">
        <label style="display:block;margin:0.5rem 0;">Type: <select id="sponsors-type" style="padding:0.4rem;background:#2a2a2a;border:1px solid #444;color:#e8e4e0;">
          <option value="title">Title</option>
          <option value="conference_mecca">Conference Mecca</option>
          <option value="conference_medina">Conference Medina</option>
        </select></label>
        <label style="display:block;margin:0.5rem 0;">Name: <input type="text" id="sponsors-name" style="padding:0.4rem;width:100%;background:#2a2a2a;border:1px solid #444;color:#e8e4e0;"></label>
        <label style="display:block;margin:0.5rem 0;">Logo URL: <input type="text" id="sponsors-logo" style="padding:0.4rem;width:100%;background:#2a2a2a;border:1px solid #444;color:#e8e4e0;"></label>
        <label style="display:block;margin:0.5rem 0;">Label: <input type="text" id="sponsors-label" style="padding:0.4rem;width:100%;background:#2a2a2a;border:1px solid #444;color:#e8e4e0;"></label>
        <button type="submit">Save</button>
        <button type="button" id="sponsors-cancel">Cancel</button>
      </form>
    </div>
  `;
  document.getElementById('sponsors-list').innerHTML = (sponsors || []).map(s => `
    <li style="padding:0.5rem 0;border-bottom:1px solid #333;">${s.type}: ${escapeHtml(s.name || '—')}
    <button data-id="${s.id}" data-type="${s.type}" data-name="${escapeHtml(s.name || '')}" data-logo="${escapeHtml(s.logo_url || '')}" data-label="${escapeHtml(s.label || '')}" class="sp-edit">Edit</button>
    <button data-id="${s.id}" data-name="${escapeHtml(s.name || '')}" class="sp-del">Delete</button></li>
  `).join('') || '<li>No sponsors yet.</li>';
  const wrap = document.getElementById('sponsors-form-wrap');
  const showForm = (s = null) => {
    wrap.style.display = 'block';
    document.getElementById('sponsors-form-title').textContent = s ? 'Edit sponsor' : 'Add sponsor';
    document.getElementById('sponsors-id').value = s?.id || '';
    document.getElementById('sponsors-type').value = s?.type || 'title';
    document.getElementById('sponsors-name').value = s?.name || '';
    document.getElementById('sponsors-logo').value = s?.logo_url || '';
    document.getElementById('sponsors-label').value = s?.label || '';
  };
  document.getElementById('sponsors-add-btn').onclick = () => showForm();
  document.getElementById('sponsors-cancel').onclick = () => { wrap.style.display = 'none'; };
  document.getElementById('sponsors-list').querySelectorAll('.sp-edit').forEach(btn => {
    btn.onclick = () => showForm({ id: btn.dataset.id, type: btn.dataset.type, name: btn.dataset.name, logo_url: btn.dataset.logo || null, label: btn.dataset.label || null });
  });
  document.getElementById('sponsors-list').querySelectorAll('.sp-del').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm(`Delete sponsor "${btn.dataset.name}"?`)) return;
      try {
        await adminFetch('admin-sponsors', { method: 'POST', body: JSON.stringify({ delete: true, id: btn.dataset.id }) });
        renderSponsors(content, ctx);
      } catch (e) { document.getElementById('sponsors-msg').innerHTML = `<p class="msg error">${e.message}</p>`; }
    };
  });
  document.getElementById('sponsors-form').onsubmit = async (e) => {
    e.preventDefault();
    const id = document.getElementById('sponsors-id').value;
    const body = {
      type: document.getElementById('sponsors-type').value,
      name: document.getElementById('sponsors-name').value || null,
      logo_url: document.getElementById('sponsors-logo').value || null,
      label: document.getElementById('sponsors-label').value || null,
    };
    if (id) body.id = id; else body.season_id = seasonId;
    try {
      await adminFetch('admin-sponsors', { method: 'POST', body: JSON.stringify(body) });
      document.getElementById('sponsors-msg').innerHTML = '<p class="msg success">Saved.</p>';
      wrap.style.display = 'none';
      renderSponsors(content, ctx);
    } catch (e) { document.getElementById('sponsors-msg').innerHTML = `<p class="msg error">${e.message}</p>`; }
  };
}

const MEDIA_SLOT_KEYS = ['top_plays_default', 'baseline_ep1', 'baseline_ep2', 'baseline_ep3', 'highlights_g1', 'highlights_g2', 'highlights_g3'];
const MEDIA_SLOT_DEFAULTS = { top_plays_default: 'Top Plays', baseline_ep1: 'Episode 1', baseline_ep2: 'Episode 2', baseline_ep3: 'Episode 3', highlights_g1: 'Game 1 Highlights', highlights_g2: 'Game 2 Highlights', highlights_g3: 'Game 3 Highlights' };

export async function renderMedia(content, ctx) {
  const { adminFetch, supabase } = ctx;
  const seasonId = window.adminSeasonId;
  if (!seasonId) {
    content.innerHTML = '<p>Select a season first.</p>';
    return;
  }
  const { loadAdminSeasonData } = await import('./admin-data.js');
  const { MEDIA_TEMPLATE } = await import('./page-templates.js');
  const renderMod = await importRootJs('render.js');
  const { config } = await importRootJs('config.js');

  const data = await loadAdminSeasonData(window.adminSeasonSlug);
  if (!data) {
    content.innerHTML = '<p>Select a season first.</p>';
    return;
  }

  content.innerHTML = MEDIA_TEMPLATE;
  window.renderAll = renderMod.renderAll;
  window.renderMedia = renderMod.renderMedia;
  renderAll();

  const currentWeek = parseInt(content.querySelector('#media-week-select')?.value || config.CURRENT_WEEK) || 1;
  const mediaItems = config.DB.mediaItems || [];
  const mediaSlots = config.DB.mediaSlots || {};

  content.querySelectorAll('.media-section-title').forEach((titleEl, titleIdx) => {
    const section = titleEl.closest('div[style*="margin-bottom"]');
    if (!section) return;
    const grids = section.querySelectorAll('.media-grid');
    const grid = grids[titleIdx];
    if (!grid) return;
    const label = titleEl.textContent || '';
    if (label.includes('Top Plays')) {
      const weekItems = mediaItems.filter(m => m.week === currentWeek);
      const cards = grid.querySelectorAll('.video-card');
      cards.forEach((card, ci) => {
        const item = weekItems[ci];
        if (!item) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'admin-edit-btn';
        btn.textContent = 'Edit';
        btn.style.cssText = 'position:relative;margin-left:0.5rem;';
        btn.onclick = () => openMediaItemModal(item, content, ctx);
        card.style.position = 'relative';
        card.appendChild(btn);
      });
    } else if (label.includes('Baseline') || label.includes('Highlights')) {
      const slotKeys = label.includes('Baseline') ? ['baseline_ep1', 'baseline_ep2', 'baseline_ep3'] : ['highlights_g1', 'highlights_g2', 'highlights_g3'];
      const cards = grid.querySelectorAll('.video-card');
      cards.forEach((card, ci) => {
        const slotKey = slotKeys[ci];
        if (!slotKey) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'admin-edit-btn';
        btn.textContent = 'Edit';
        btn.style.cssText = 'position:relative;margin-left:0.5rem;';
        btn.onclick = () => openMediaSlotModal(currentWeek, slotKey, content, ctx);
        card.style.position = 'relative';
        card.appendChild(btn);
      });
    }
  });

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.textContent = 'Add media item';
  addBtn.style.cssText = 'margin-top:0.5rem;padding:0.4rem 0.8rem;background:#c8a84b;color:#1a1a1a;border:none;border-radius:4px;cursor:pointer;';
  addBtn.onclick = () => openMediaItemModal(null, content, ctx);
  const section = content.querySelector('.section');
  if (section) section.appendChild(addBtn);
}

async function openMediaItemModal(item, content, ctx, onSaved) {
  const { adminFetch } = ctx;
  const seasonId = window.adminSeasonId;
  const { config } = await importRootJs('config.js');
  const currentWeek = parseInt(document.getElementById('media-week-select')?.value || config.CURRENT_WEEK) || 1;
  const backdrop = document.createElement('div');
  backdrop.className = 'admin-modal-backdrop';
  backdrop.innerHTML = `
    <div class="admin-modal">
      <h4>${item ? 'Edit media item' : 'Add media item'}</h4>
      <form id="media-item-form">
        <input type="hidden" id="mi-id" value="${item?.id || ''}">
        <label style="display:block;margin:0.5rem 0;">Week: <input type="number" id="mi-week" min="1" value="${item?.week ?? currentWeek}" required style="padding:0.4rem;width:80px;background:#1a1a1a;border:1px solid #444;color:#e8e4e0;"></label>
        <label style="display:block;margin:0.5rem 0;">Title: <input type="text" id="mi-title" value="${escapeHtml(item?.title || '')}" required style="padding:0.4rem;width:100%;background:#1a1a1a;border:1px solid #444;color:#e8e4e0;"></label>
        <label style="display:block;margin:0.5rem 0;">URL: <input type="url" id="mi-url" value="${escapeHtml(item?.url || '')}" required style="padding:0.4rem;width:100%;background:#1a1a1a;border:1px solid #444;color:#e8e4e0;"></label>
        <label style="display:block;margin:0.5rem 0;">Type: <select id="mi-type" style="padding:0.4rem;background:#1a1a1a;border:1px solid #444;color:#e8e4e0;">
          <option value="highlight" ${(item?.type || 'highlight') === 'highlight' ? 'selected' : ''}>Highlight</option>
          <option value="interview" ${item?.type === 'interview' ? 'selected' : ''}>Interview</option>
        </select></label>
        <div class="admin-modal-actions" style="margin-top:1rem;">
          <button type="submit" class="btn-primary">Save</button>
          <button type="button" class="btn-secondary" id="mi-cancel">Cancel</button>
          ${item ? '<button type="button" id="mi-delete" style="padding:0.5rem 1rem;background:#c55;color:#fff;border:none;border-radius:4px;cursor:pointer;margin-left:auto;">Delete</button>' : ''}
        </div>
      </form>
      <div id="mi-msg" class="admin-edit-msg" style="display:none;margin-top:0.5rem;"></div>
    </div>`;
  document.body.appendChild(backdrop);

  const close = () => backdrop.remove();
  backdrop.querySelector('#mi-cancel').onclick = close;
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });

  backdrop.querySelector('#media-item-form').onsubmit = async (e) => {
    e.preventDefault();
    const id = backdrop.querySelector('#mi-id').value;
    const body = {
      week: parseInt(backdrop.querySelector('#mi-week').value),
      title: backdrop.querySelector('#mi-title').value,
      url: backdrop.querySelector('#mi-url').value,
      type: backdrop.querySelector('#mi-type').value,
    };
    if (id) body.id = id; else body.season_id = seasonId;
    try {
      await adminFetch('admin-media', { method: 'POST', body: JSON.stringify(body) });
      close();
      if (onSaved) await onSaved();
      else if (content) {
        const sections = await import('./sections.js');
        await sections.renderMedia(content, ctx);
      }
    } catch (err) {
      backdrop.querySelector('#mi-msg').textContent = err.message || 'Save failed.';
      backdrop.querySelector('#mi-msg').style.display = 'block';
    }
  };
  backdrop.querySelector('#mi-delete')?.addEventListener('click', async () => {
    if (!confirm('Delete this media item?')) return;
    try {
      await adminFetch('admin-media', { method: 'POST', body: JSON.stringify({ delete: true, id: item.id }) });
      close();
      if (onSaved) await onSaved();
      else if (content) {
        const sections = await import('./sections.js');
        await sections.renderMedia(content, ctx);
      }
    } catch (err) {
      backdrop.querySelector('#mi-msg').textContent = err.message || 'Delete failed.';
      backdrop.querySelector('#mi-msg').style.display = 'block';
    }
  });
}

async function openMediaSlotModal(week, slotKey, content, ctx, onSaved) {
  const { adminFetch } = ctx;
  const seasonId = window.adminSeasonId;
  const { config } = await importRootJs('config.js');
  const slot = config.DB.mediaSlots?.[week]?.[slotKey] || {};
  const defaultTitle = MEDIA_SLOT_DEFAULTS[slotKey] || slotKey;
  const backdrop = document.createElement('div');
  backdrop.className = 'admin-modal-backdrop';
  backdrop.innerHTML = `
    <div class="admin-modal">
      <h4>Edit ${defaultTitle}</h4>
      <form id="media-slot-form">
        <label style="display:block;margin:0.5rem 0;">Title: <input type="text" id="ms-title" value="${escapeHtml(slot.title || defaultTitle)}" style="padding:0.4rem;width:100%;background:#1a1a1a;border:1px solid #444;color:#e8e4e0;"></label>
        <label style="display:block;margin:0.5rem 0;">URL: <input type="url" id="ms-url" value="${escapeHtml(slot.url || '')}" placeholder="https://..." style="padding:0.4rem;width:100%;background:#1a1a1a;border:1px solid #444;color:#e8e4e0;"></label>
        <div class="admin-modal-actions" style="margin-top:1rem;">
          <button type="submit" class="btn-primary">Save</button>
          <button type="button" class="btn-secondary" id="ms-cancel">Cancel</button>
        </div>
      </form>
      <div id="ms-msg" class="admin-edit-msg" style="display:none;margin-top:0.5rem;"></div>
    </div>`;
  document.body.appendChild(backdrop);

  const close = () => backdrop.remove();
  backdrop.querySelector('#ms-cancel').onclick = close;
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });

  backdrop.querySelector('#media-slot-form').onsubmit = async (e) => {
    e.preventDefault();
    const bulk = [{ season_id: seasonId, week, slot_key: slotKey, title: backdrop.querySelector('#ms-title').value || null, url: backdrop.querySelector('#ms-url').value || null }];
    try {
      await adminFetch('admin-media-slots', { method: 'POST', body: JSON.stringify({ bulk }) });
      close();
      if (onSaved) await onSaved();
      else if (content) {
        const sections = await import('./sections.js');
        await sections.renderMedia(content, ctx);
      }
    } catch (err) {
      backdrop.querySelector('#ms-msg').textContent = err.message || 'Save failed.';
      backdrop.querySelector('#ms-msg').style.display = 'block';
    }
  };
}

/**
 * Attach Edit buttons to media slot cards, section headers, Top Plays items, and Instagram link on the Media page.
 */
export async function attachMediaSlotOverlays(ctx) {
  const onMediaSaved = ctx.onMediaSaved || (() => {});
  const seasonId = window.adminSeasonId;
  if (!seasonId) return;

  const pageMedia = document.getElementById('page-media');
  if (!pageMedia) return;

  const { attachEditOverlay } = await import('./edit-overlays.js');
  const { config } = await importRootJs('config.js');

  const saveContent = (key, value) => ctx.adminFetch('admin-content', {
    method: 'POST',
    body: JSON.stringify([{ key, value, season_id: seasonId }]),
  });

  // --- Media layout sections (new flexible structure) ---
  let layout = { sections: [] };
  try {
    const parsed = JSON.parse(config.DB?.contentBlocks?.media_layout || '{}');
    if (parsed?.sections?.length) {
      layout = parsed;
    } else {
      const legacy = JSON.parse(config.DB?.contentBlocks?.media_custom_blocks || '[]');
      if (Array.isArray(legacy) && legacy.length) {
        layout = { sections: [{ id: 'legacy_1', title: config.DB?.contentBlocks?.media_custom_section_title || 'Custom Media', blocks: legacy }] };
      }
    }
  } catch (_) {}

  if (layout?.sections?.length) {
    pageMedia.querySelectorAll('.media-section-title[data-editable-title][data-section-id]').forEach(el => {
      if (el.dataset.sectionTitleOverlay) return;
      const sectionId = el.dataset.sectionId;
      el.dataset.sectionTitleOverlay = '1';
      attachEditOverlay({
        element: el,
        key: 'section_title',
        getValue: () => el.textContent || '',
        saveFn: async (val) => {
          const sec = layout.sections.find(s => (s.id || '') === sectionId);
          if (sec) sec.title = val;
          await saveContent('media_layout', JSON.stringify(layout));
        },
        contentType: 'text',
        onSaved: onMediaSaved,
      });
    });

    pageMedia.querySelectorAll('.media-layout-section[data-section-id]').forEach(sectionEl => {
      if (sectionEl.querySelector('.admin-delete-section-btn')) return;
      const sectionId = sectionEl.dataset.sectionId;
      const sec = layout.sections.find(s => (s.id || '') === sectionId);

      const editSectionBtn = document.createElement('button');
      editSectionBtn.type = 'button';
      editSectionBtn.className = 'admin-edit-btn admin-edit-section-btn';
      editSectionBtn.textContent = 'Edit section';
      editSectionBtn.style.cssText = 'position:static;padding:0.2rem 0.5rem;font-size:0.7rem;cursor:pointer;';
      editSectionBtn.onclick = () => {
        const selectedWeek = parseInt(document.getElementById('media-week-select')?.value) || config.CURRENT_WEEK || 1;
        const isScoped = sec?.week != null;
        const secWeekDisplay = sec?.week ?? selectedWeek;
        const modal = document.createElement('div');
        modal.className = 'admin-modal-backdrop';
        modal.innerHTML = `
          <div class="admin-modal">
            <h4>Edit section</h4>
            <form id="edit-section-form">
              <label style="display:block;margin:0.5rem 0;">Section title: <input type="text" id="es-title" value="${escapeHtml(sec?.title || '')}" style="padding:0.4rem;width:100%;background:#1a1a1a;border:1px solid #444;color:#e8e4e0;"></label>
              <div style="margin:0.75rem 0;">
                <div style="font-size:0.85rem;color:#c8c0b0;margin-bottom:0.4rem;">Apply to:</div>
                <label style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.3rem;cursor:pointer;"><input type="radio" name="es-week" value="all" ${!isScoped ? 'checked' : ''}> All Weeks</label>
                <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;"><input type="radio" name="es-week" value="current" ${isScoped ? 'checked' : ''}> This week only (Week ${secWeekDisplay})</label>
              </div>
              <div class="admin-modal-actions" style="margin-top:1rem;">
                <button type="submit" class="btn-primary">Save</button>
                <button type="button" class="btn-secondary" id="es-cancel">Cancel</button>
              </div>
            </form>
            <div id="es-msg" class="admin-edit-msg" style="display:none;margin-top:0.5rem;"></div>
          </div>`;
        document.body.appendChild(modal);
        const closeModal = () => modal.remove();
        modal.querySelector('#es-cancel').onclick = closeModal;
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
        modal.querySelector('#edit-section-form').onsubmit = async (e) => {
          e.preventDefault();
          if (sec) {
            sec.title = modal.querySelector('#es-title').value.trim() || sec.title;
            const weekVal = modal.querySelector('input[name="es-week"]:checked')?.value;
            sec.week = weekVal === 'current' ? secWeekDisplay : null;
          }
          try {
            await saveContent('media_layout', JSON.stringify(layout));
            closeModal();
            await onMediaSaved();
          } catch (err) {
            modal.querySelector('#es-msg').textContent = err.message || 'Save failed.';
            modal.querySelector('#es-msg').style.display = 'block';
          }
        };
      };

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'admin-edit-btn admin-delete-section-btn';
      delBtn.textContent = 'Delete section';
      delBtn.style.cssText = 'position:static;padding:0.2rem 0.5rem;font-size:0.7rem;background:rgba(200,80,80,0.8);cursor:pointer;';
      delBtn.onclick = async () => {
        if (!confirm('Delete this section and all its blocks?')) return;
        layout.sections = layout.sections.filter(s => (s.id || '') !== sectionId);
        await saveContent('media_layout', JSON.stringify(layout));
        await onMediaSaved();
      };
      const headerEl = sectionEl.querySelector('.media-section-header');
      if (headerEl) {
        headerEl.appendChild(editSectionBtn);
        headerEl.appendChild(delBtn);
      }
    });

    pageMedia.querySelectorAll('.video-card[data-section-id][data-block-id]').forEach(card => {
      if (card.querySelector('.admin-media-block-edit-btn')) return;
      const sectionId = card.dataset.sectionId;
      const blockId = card.dataset.blockId;
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'admin-edit-btn admin-media-block-edit-btn';
      editBtn.textContent = 'Edit';
      editBtn.style.cssText = 'position:static;margin-left:0.3rem;padding:0.2rem 0.5rem;font-size:0.75rem;cursor:pointer;';
      editBtn.onclick = () => openMediaBlockModal(sectionId, blockId, ctx, onMediaSaved);
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'admin-edit-btn admin-media-block-delete-btn';
      delBtn.textContent = 'Delete';
      delBtn.style.cssText = 'position:static;margin-left:0.3rem;padding:0.2rem 0.5rem;font-size:0.75rem;background:rgba(200,80,80,0.8);cursor:pointer;';
      delBtn.onclick = async () => {
        if (!confirm('Delete this media block?')) return;
        const sec = layout.sections.find(s => (s.id || '') === sectionId);
        if (sec?.blocks) {
          sec.blocks = sec.blocks.filter(b => (b.id || '') !== blockId);
          if (sec.blocks.length === 0) layout.sections = layout.sections.filter(s => (s.id || '') !== sectionId);
        }
        await saveContent('media_layout', JSON.stringify(layout));
        await onMediaSaved();
      };
      const label = card.querySelector('.video-label');
      const container = label ? label.parentNode : card;
      const insertRef = label ? label.nextSibling : null;
      if (insertRef) {
        container.insertBefore(editBtn, insertRef);
        container.insertBefore(delBtn, insertRef);
      } else {
        container.appendChild(editBtn);
        container.appendChild(delBtn);
      }
      // Week badge for scoped blocks
      const sec = layout.sections.find(s => (s.id || '') === sectionId);
      const block = sec?.blocks?.find(b => (b.id || '') === blockId);
      if (block?.week != null) {
        const badge = document.createElement('span');
        badge.textContent = `Week ${block.week} only`;
        badge.style.cssText = 'font-size:0.65rem;color:#8a8580;margin-left:0.5rem;font-style:italic;';
        card.appendChild(badge);
      }
    });
  }

  // --- Legacy overlays (when using old structure - slot cards, media items) ---
  pageMedia.querySelectorAll('.video-card[data-slot-key][data-week]').forEach(card => {
    if (card.querySelector('.admin-media-slot-edit-btn')) return;
    const slotKey = card.dataset.slotKey;
    const week = parseInt(card.dataset.week, 10);
    if (!slotKey || isNaN(week)) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'admin-edit-btn admin-media-slot-edit-btn';
    btn.textContent = 'Edit';
    btn.style.cssText = 'margin-left:0.5rem;padding:0.2rem 0.5rem;font-size:0.75rem;';
    btn.onclick = () => openMediaSlotModal(week, slotKey, null, ctx, onMediaSaved);
    const label = card.querySelector('.video-label');
    if (label) label.parentNode.insertBefore(btn, label.nextSibling);
    else card.appendChild(btn);
  });
  pageMedia.querySelectorAll('.video-card[data-item-id]').forEach(card => {
    if (card.querySelector('.admin-media-item-edit-btn')) return;
    const itemId = card.dataset.itemId;
    if (!itemId) return;
    const item = (config.DB.mediaItems || []).find(m => String(m.id) === String(itemId));
    if (!item) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'admin-edit-btn admin-media-item-edit-btn';
    btn.textContent = 'Edit';
    btn.style.cssText = 'margin-left:0.5rem;padding:0.2rem 0.5rem;font-size:0.75rem;';
    btn.onclick = () => openMediaItemModal(item, null, ctx, onMediaSaved);
    const label = card.querySelector('.video-label');
    if (label) label.parentNode.insertBefore(btn, label.nextSibling);
    else card.appendChild(btn);
  });

  // --- Instagram URL (Follow button wrapper on Media page) ---
  const followWrap = document.getElementById('media-follow-wrap');
  if (followWrap && !followWrap.dataset.mediaInstaOverlay) {
    followWrap.dataset.mediaInstaOverlay = '1';
    const instaUrl = config.DB?.contentBlocks?.instagram_url || '';
    const overlayWrap = document.createElement('div');
    overlayWrap.className = 'admin-edit-overlay admin-instagram-overlay';
    followWrap.parentNode.insertBefore(overlayWrap, followWrap);
    overlayWrap.appendChild(followWrap);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'admin-edit-btn';
    btn.textContent = 'Edit Instagram link';
    btn.style.cssText = 'margin-left:0.5rem;padding:0.2rem 0.5rem;font-size:0.75rem;';
    btn.onclick = () => openInstagramUrlModal(ctx, onMediaSaved);
    overlayWrap.appendChild(btn);
  }

  // --- Add section + Add media buttons ---
  let addMediaWrap = document.getElementById('admin-media-actions-wrap');
  if (!addMediaWrap) {
    addMediaWrap = document.createElement('div');
    addMediaWrap.id = 'admin-media-actions-wrap';
    addMediaWrap.style.cssText = 'margin-top:1rem;display:flex;gap:0.5rem;flex-wrap:wrap;';
    const addSectionBtn = document.createElement('button');
    addSectionBtn.type = 'button';
    addSectionBtn.textContent = 'Add section';
    addSectionBtn.className = 'insta-btn';
    addSectionBtn.style.cssText = 'padding:0.5rem 1rem;font-size:0.8rem;';
    addSectionBtn.onclick = () => openAddSectionModal(ctx, onMediaSaved);
    const addMediaBtn = document.createElement('button');
    addMediaBtn.type = 'button';
    addMediaBtn.textContent = 'Add media';
    addMediaBtn.className = 'insta-btn';
    addMediaBtn.style.cssText = 'padding:0.5rem 1rem;font-size:0.8rem;';
    addMediaBtn.onclick = () => openAddMediaModal(ctx, onMediaSaved);
    addMediaWrap.appendChild(addSectionBtn);
    addMediaWrap.appendChild(addMediaBtn);
    const section = pageMedia.querySelector('.section');
    if (section) section.appendChild(addMediaWrap);
  }

  // --- Footer insta (first one in page-media) ---
  const footerInsta = pageMedia.querySelector('.footer-insta');
  if (footerInsta && !footerInsta.dataset.mediaFooterInstaOverlay) {
    footerInsta.dataset.mediaFooterInstaOverlay = '1';
    const wrap = document.createElement('span');
    wrap.style.cssText = 'position:relative;display:inline-flex;align-items:center;gap:0.3rem;';
    footerInsta.parentNode.insertBefore(wrap, footerInsta);
    wrap.appendChild(footerInsta);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'admin-edit-btn';
    btn.textContent = 'Edit';
    btn.style.cssText = 'font-size:0.7rem;padding:0.15rem 0.4rem;';
    btn.onclick = () => openInstagramUrlModal(ctx, onMediaSaved);
    wrap.appendChild(btn);
  }
}

async function openAddSectionModal(ctx, onSaved) {
  const { config } = await importRootJs('config.js');
  let layout = { sections: [] };
  try {
    const parsed = JSON.parse(config.DB?.contentBlocks?.media_layout || '{}');
    if (parsed?.sections) layout = parsed;
  } catch (_) {}
  if (!Array.isArray(layout.sections)) layout.sections = [];
  const selectedWeek = parseInt(document.getElementById('media-week-select')?.value) || config.CURRENT_WEEK || 1;

  const backdrop = document.createElement('div');
  backdrop.className = 'admin-modal-backdrop';
  backdrop.innerHTML = `
    <div class="admin-modal">
      <h4>Add section</h4>
      <form id="add-section-form">
        <label style="display:block;margin:0.5rem 0;">Section title: <input type="text" id="as-title" placeholder="e.g. Highlights" value="New Section" style="padding:0.4rem;width:100%;background:#1a1a1a;border:1px solid #444;color:#e8e4e0;"></label>
        <div style="margin:0.75rem 0;">
          <div style="font-size:0.85rem;color:#c8c0b0;margin-bottom:0.4rem;">Apply to:</div>
          <label style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.3rem;cursor:pointer;"><input type="radio" name="as-week" value="all" checked> All Weeks</label>
          <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;"><input type="radio" name="as-week" value="current"> This week only (Week ${selectedWeek})</label>
        </div>
        <div class="admin-modal-actions" style="margin-top:1rem;">
          <button type="submit" class="btn-primary">Add</button>
          <button type="button" class="btn-secondary" id="as-cancel">Cancel</button>
        </div>
      </form>
      <div id="as-msg" class="admin-edit-msg" style="display:none;margin-top:0.5rem;"></div>
    </div>`;
  document.body.appendChild(backdrop);

  const close = () => backdrop.remove();
  backdrop.querySelector('#as-cancel').onclick = close;
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });

  backdrop.querySelector('#add-section-form').onsubmit = async (e) => {
    e.preventDefault();
    const title = backdrop.querySelector('#as-title').value.trim() || 'New Section';
    const weekVal = backdrop.querySelector('input[name="as-week"]:checked')?.value;
    const week = weekVal === 'current' ? selectedWeek : null;
    layout.sections.push({ id: 'sec_' + Date.now(), title, week, blocks: [] });
    try {
      await ctx.adminFetch('admin-content', {
        method: 'POST',
        body: JSON.stringify([{ key: 'media_layout', value: JSON.stringify(layout), season_id: window.adminSeasonId }]),
      });
      close();
      await onSaved();
    } catch (err) {
      backdrop.querySelector('#as-msg').textContent = err.message || 'Failed to add section';
      backdrop.querySelector('#as-msg').style.display = 'block';
    }
  };
}

async function openAddMediaModal(ctx, onSaved) {
  const { config } = await importRootJs('config.js');
  let layout = { sections: [] };
  try {
    const parsed = JSON.parse(config.DB?.contentBlocks?.media_layout || '{}');
    if (parsed?.sections) layout = parsed;
  } catch (_) {}
  if (!Array.isArray(layout.sections)) layout.sections = [];
  const selectedWeek = parseInt(document.getElementById('media-week-select')?.value) || config.CURRENT_WEEK || 1;
  const sectionOptions = layout.sections.map((s, i) => `<option value="${escapeHtml(s.id || '')}">${escapeHtml(s.title || 'Section ' + (i + 1))}</option>`).join('');
  const noSections = !layout.sections.length;
  const newSectionSelected = noSections ? ' selected' : '';
  const newSectionWrapDisplay = noSections ? 'block' : 'none';
  const backdrop = document.createElement('div');
  backdrop.className = 'admin-modal-backdrop';
  backdrop.innerHTML = `
    <div class="admin-modal">
      <h4>Add media</h4>
      <form id="add-media-form">
        <label style="display:block;margin:0.5rem 0;">Section: <select id="am-section" style="padding:0.4rem;width:100%;background:#1a1a1a;border:1px solid #444;color:#e8e4e0;">${sectionOptions}<option value="__new__"${newSectionSelected}>+ New section</option></select></label>
        <div id="am-new-section-wrap" style="display:${newSectionWrapDisplay};margin:0.5rem 0;"><label>New section name: <input type="text" id="am-new-section-name" placeholder="Section title" style="padding:0.4rem;width:100%;background:#1a1a1a;border:1px solid #444;color:#e8e4e0;"></label></div>
        <label style="display:block;margin:0.5rem 0;">Block title: <input type="text" id="am-title" required placeholder="e.g. Top Plays" style="padding:0.4rem;width:100%;background:#1a1a1a;border:1px solid #444;color:#e8e4e0;"></label>
        <label style="display:block;margin:0.5rem 0;">Instagram Post URL: <input type="url" id="am-url" placeholder="https://www.instagram.com/p/XXXXX/" style="padding:0.4rem;width:100%;background:#1a1a1a;border:1px solid #444;color:#e8e4e0;"></label>
        <label style="display:block;margin:0.5rem 0;">Width: <select id="am-width" style="padding:0.4rem;background:#1a1a1a;border:1px solid #444;color:#e8e4e0;"><option value="half">Half (2 per row)</option><option value="full">Full width</option></select></label>
        <div style="margin:0.75rem 0;">
          <div style="font-size:0.85rem;color:#c8c0b0;margin-bottom:0.4rem;">Apply to:</div>
          <label style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.3rem;cursor:pointer;"><input type="radio" name="am-week" value="all" checked> All Weeks</label>
          <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;"><input type="radio" name="am-week" value="current"> This week only (Week ${selectedWeek})</label>
        </div>
        <div class="admin-modal-actions" style="margin-top:1rem;">
          <button type="submit" class="btn-primary">Add</button>
          <button type="button" class="btn-secondary" id="am-cancel">Cancel</button>
        </div>
      </form>
      <div id="am-msg" class="admin-edit-msg" style="display:none;margin-top:0.5rem;"></div>
    </div>`;
  document.body.appendChild(backdrop);

  const close = () => backdrop.remove();
  backdrop.querySelector('#am-cancel').onclick = close;
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });

  backdrop.querySelector('#am-section').onchange = () => {
    backdrop.querySelector('#am-new-section-wrap').style.display =
      backdrop.querySelector('#am-section').value === '__new__' ? 'block' : 'none';
  };

  backdrop.querySelector('#add-media-form').onsubmit = async (e) => {
    e.preventDefault();
    const sectionVal = backdrop.querySelector('#am-section').value;
    const newSectionName = backdrop.querySelector('#am-new-section-name').value.trim();
    const blockTitle = backdrop.querySelector('#am-title').value.trim() || 'Media';
    const url = backdrop.querySelector('#am-url').value.trim() || '';
    const width = backdrop.querySelector('#am-width').value || 'half';
    const weekVal = backdrop.querySelector('input[name="am-week"]:checked')?.value;
    const blockWeek = weekVal === 'current' ? selectedWeek : null;
    let targetSectionId = sectionVal;
    if (sectionVal === '__new__') {
      const newId = 'sec_' + Date.now();
      layout.sections.push({ id: newId, title: newSectionName || 'New Section', week: null, blocks: [] });
      targetSectionId = newId;
    }
    const sec = layout.sections.find(s => (s.id || '') === targetSectionId);
    if (!sec) {
      backdrop.querySelector('#am-msg').textContent = 'Section not found.';
      backdrop.querySelector('#am-msg').style.display = 'block';
      return;
    }
    if (!sec.blocks) sec.blocks = [];
    sec.blocks.push({ id: 'blk_' + Date.now(), title: blockTitle, url, width, week: blockWeek });
    try {
      await ctx.adminFetch('admin-content', {
        method: 'POST',
        body: JSON.stringify([{ key: 'media_layout', value: JSON.stringify(layout), season_id: window.adminSeasonId }]),
      });
      close();
      await onSaved();
    } catch (err) {
      backdrop.querySelector('#am-msg').textContent = err.message || 'Save failed.';
      backdrop.querySelector('#am-msg').style.display = 'block';
    }
  };
}

async function openMediaBlockModal(sectionId, blockId, ctx, onSaved) {
  const { config } = await importRootJs('config.js');
  let layout = { sections: [] };
  try {
    const parsed = JSON.parse(config.DB?.contentBlocks?.media_layout || '{}');
    if (parsed?.sections?.length) layout = parsed;
  } catch (_) {}
  if (!layout.sections) layout.sections = [];
  const sec = layout.sections.find(s => (s.id || '') === sectionId);
  const block = sec?.blocks?.find(b => (b.id || '').toString() === blockId.toString());
  if (!block) return;
  const selectedWeek = parseInt(document.getElementById('media-week-select')?.value) || config.CURRENT_WEEK || 1;
  const blockIsScoped = block.week != null;
  const blockWeekDisplay = block.week ?? selectedWeek;
  const backdrop = document.createElement('div');
  backdrop.className = 'admin-modal-backdrop';
  backdrop.innerHTML = `
    <div class="admin-modal">
      <h4>Edit block</h4>
      <form id="edit-block-form">
        <label style="display:block;margin:0.5rem 0;">Title: <input type="text" id="eb-title" value="${escapeHtml(block.title || '')}" required style="padding:0.4rem;width:100%;background:#1a1a1a;border:1px solid #444;color:#e8e4e0;"></label>
        <label style="display:block;margin:0.5rem 0;">Instagram Post URL: <input type="url" id="eb-url" value="${escapeHtml(block.url || '')}" placeholder="https://www.instagram.com/p/XXXXX/" style="padding:0.4rem;width:100%;background:#1a1a1a;border:1px solid #444;color:#e8e4e0;"></label>
        <label style="display:block;margin:0.5rem 0;">Width: <select id="eb-width" style="padding:0.4rem;background:#1a1a1a;border:1px solid #444;color:#e8e4e0;"><option value="half" ${(block.width || 'half') === 'half' ? 'selected' : ''}>Half (2 per row)</option><option value="full" ${block.width === 'full' ? 'selected' : ''}>Full width</option></select></label>
        <div style="margin:0.75rem 0;">
          <div style="font-size:0.85rem;color:#c8c0b0;margin-bottom:0.4rem;">Apply to:</div>
          <label style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.3rem;cursor:pointer;"><input type="radio" name="eb-week" value="all" ${!blockIsScoped ? 'checked' : ''}> All Weeks</label>
          <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;"><input type="radio" name="eb-week" value="current" ${blockIsScoped ? 'checked' : ''}> This week only (Week ${blockWeekDisplay})</label>
        </div>
        <div class="admin-modal-actions" style="margin-top:1rem;">
          <button type="submit" class="btn-primary">Save</button>
          <button type="button" class="btn-secondary" id="eb-cancel">Cancel</button>
          <button type="button" id="eb-delete" style="padding:0.5rem 1rem;background:#c55;color:#fff;border:none;border-radius:4px;cursor:pointer;margin-left:auto;">Delete</button>
        </div>
      </form>
      <div id="eb-msg" class="admin-edit-msg" style="display:none;margin-top:0.5rem;"></div>
    </div>`;
  document.body.appendChild(backdrop);

  const close = () => backdrop.remove();
  backdrop.querySelector('#eb-cancel').onclick = close;
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });

  backdrop.querySelector('#edit-block-form').onsubmit = async (e) => {
    e.preventDefault();
    block.title = backdrop.querySelector('#eb-title').value.trim() || 'Media';
    block.url = backdrop.querySelector('#eb-url').value.trim() || '';
    block.width = backdrop.querySelector('#eb-width').value || 'half';
    const weekVal = backdrop.querySelector('input[name="eb-week"]:checked')?.value;
    block.week = weekVal === 'current' ? blockWeekDisplay : null;
    try {
      await ctx.adminFetch('admin-content', {
        method: 'POST',
        body: JSON.stringify([{ key: 'media_layout', value: JSON.stringify(layout), season_id: window.adminSeasonId }]),
      });
      close();
      await onSaved();
    } catch (err) {
      backdrop.querySelector('#eb-msg').textContent = err.message || 'Save failed.';
      backdrop.querySelector('#eb-msg').style.display = 'block';
    }
  };
  backdrop.querySelector('#eb-delete').onclick = async () => {
    if (!confirm('Delete this block?')) return;
    sec.blocks = sec.blocks.filter(b => (b.id || '').toString() !== blockId.toString());
    try {
      await ctx.adminFetch('admin-content', {
        method: 'POST',
        body: JSON.stringify([{ key: 'media_layout', value: JSON.stringify(layout), season_id: window.adminSeasonId }]),
      });
      close();
      await onSaved();
    } catch (err) {
      backdrop.querySelector('#eb-msg').textContent = err.message || 'Delete failed.';
      backdrop.querySelector('#eb-msg').style.display = 'block';
    }
  };
}

async function openInstagramUrlModal(ctx, onSaved) {
  const { config } = await importRootJs('config.js');
  const instaUrl = config.DB?.contentBlocks?.instagram_url || '';
  const backdrop = document.createElement('div');
  backdrop.className = 'admin-modal-backdrop';
  backdrop.innerHTML = `
    <div class="admin-modal">
      <h4>Instagram URL</h4>
      <form id="instagram-url-form">
        <label style="display:block;margin:0.5rem 0;">URL: <input type="url" id="iu-url" value="${escapeHtml(instaUrl)}" placeholder="https://instagram.com/..." style="padding:0.4rem;width:100%;background:#1a1a1a;border:1px solid #444;color:#e8e4e0;"></label>
        <div class="admin-modal-actions" style="margin-top:1rem;">
          <button type="submit" class="btn-primary">Save</button>
          <button type="button" class="btn-secondary" id="iu-cancel">Cancel</button>
        </div>
      </form>
      <div id="iu-msg" class="admin-edit-msg" style="display:none;margin-top:0.5rem;"></div>
    </div>`;
  document.body.appendChild(backdrop);

  const close = () => backdrop.remove();
  backdrop.querySelector('#iu-cancel').onclick = close;
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });

  backdrop.querySelector('#instagram-url-form').onsubmit = async (e) => {
    e.preventDefault();
    const url = backdrop.querySelector('#iu-url').value.trim() || '';
    try {
      await ctx.adminFetch('admin-content', {
        method: 'POST',
        body: JSON.stringify([{ key: 'instagram_url', value: url, season_id: window.adminSeasonId }]),
      });
      close();
      await onSaved();
    } catch (err) {
      backdrop.querySelector('#iu-msg').textContent = err.message || 'Save failed.';
      backdrop.querySelector('#iu-msg').style.display = 'block';
    }
  };
}

export async function renderAbout(content, ctx) {
  const { adminFetch } = ctx;
  const seasonId = window.adminSeasonId;
  if (!seasonId) {
    content.innerHTML = '<p>Select a season first.</p>';
    return;
  }
  const { loadAdminSeasonData } = await import('./admin-data.js');
  const { ABOUT_TEMPLATE } = await import('./page-templates.js');
  const { attachEditOverlay } = await import('./edit-overlays.js');
  const renderMod = await importRootJs('render.js');

  const data = await loadAdminSeasonData(window.adminSeasonSlug);
  if (!data) {
    content.innerHTML = '<p>Select a season first.</p>';
    return;
  }

  content.innerHTML = ABOUT_TEMPLATE;
  window.renderAll = renderMod.renderAll;
  window.toggleAcc = renderMod.toggleAcc;
  renderAll();

  const aboutText = content.querySelector('#about-text');
  const saveContent = (key, value) => adminFetch('admin-content', {
    method: 'POST',
    body: JSON.stringify([{ key, value, season_id: seasonId }]),
  });

  if (aboutText) {
    attachEditOverlay({
      element: aboutText,
      key: 'about_text',
      getValue: () => (aboutText.innerText || '').replace(/\r\n/g, '\n'),
      saveFn: (val) => saveContent('about_text', val),
      contentType: 'richtext',
      onSaved: () => { renderMod.renderAll(); },
    });
  }
}

/** No-op. Draft is rendered by js/render.js renderDraft(adminMode) via renderAll(true). */
export async function renderDraft() {}

export async function renderAdminPowerRankings(content, ctx) {
  const { adminFetch } = ctx;
  const seasonId = window.adminSeasonId;
  if (!seasonId || !content) return;

  const { config } = await importRootJs('config.js');
  const teams = config.DB.teams || [];

  let allData = {};
  try {
    const raw = config.DB.contentBlocks?.power_rankings_data;
    if (raw) allData = JSON.parse(raw);
  } catch (_) {}

  const currentWeek = config.CURRENT_WEEK || 1;

  const weekOpts = Array.from({ length: currentWeek }, (_, i) => i + 1)
    .map(w => `<option value="${w}"${w === currentWeek ? ' selected' : ''}>Week ${w}${w === currentWeek ? ' (Current)' : ''}</option>`)
    .join('');

  content.innerHTML = `
    <div id="pr-admin-msg"></div>
    <div style="margin-bottom:1.2rem;">
      <label style="color:#c8c0b0;font-size:0.85rem;margin-right:0.5rem;">Editing Week</label>
      <select id="pr-admin-week-select" style="background:#0a1f2e;border:1px solid rgba(200,168,75,0.3);color:#f5f0e8;padding:0.4rem 0.6rem;border-radius:4px;">${weekOpts}</select>
    </div>
    <p style="font-size:0.78rem;color:#8a8580;margin-bottom:0.9rem;">Drag rows to reorder. Note boxes are optional.</p>
    <ul id="pr-drag-list" style="list-style:none;padding:0;margin:0 0 1rem;"></ul>
    <button id="pr-admin-save" style="padding:0.5rem 1.4rem;background:#c8a84b;color:#060f1a;border:none;border-radius:4px;font-weight:700;cursor:pointer;font-size:0.9rem;">Save Rankings</button>`;

  const inits = (name) => (name || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  const fmtBtnStyle = 'padding:0.1rem 0.38rem;background:#0a1f2e;border:1px solid rgba(200,168,75,0.25);color:#c8c0b0;border-radius:3px;cursor:pointer;font-size:0.78rem;line-height:1.5;';

  function buildRow(teamId, note, rank) {
    const team = teams.find(t => t.id === teamId);
    if (!team) return null;
    const li = document.createElement('li');
    li.dataset.teamId = teamId;
    li.draggable = true;
    li.style.cssText = 'display:flex;align-items:flex-start;gap:0.7rem;padding:0.55rem 0.6rem;margin-bottom:0.45rem;background:rgba(255,255,255,0.03);border:1px solid rgba(200,168,75,0.12);border-radius:6px;user-select:none;';

    const staticHtml = `
      <span class="pr-drag-handle" style="color:#4a5a6a;font-size:1.15rem;cursor:grab;padding:0 0.15rem;flex-shrink:0;margin-top:0.3rem;" title="Drag to reorder">⠿</span>
      <div style="color:#c8a84b;font-family:'Cinzel',serif;font-size:0.82rem;font-weight:700;min-width:1.6rem;text-align:right;flex-shrink:0;margin-top:0.3rem;">#${rank}</div>
      <div style="width:34px;height:34px;border-radius:50%;background:#1a2535;border:2px solid rgba(200,168,75,0.28);display:flex;align-items:center;justify-content:center;font-family:'Cinzel',serif;font-size:0.72rem;font-weight:700;color:#c8a84b;flex-shrink:0;">${inits(team.name)}</div>
      <span style="min-width:7rem;color:#f5f0e8;font-size:0.88rem;font-weight:600;flex-shrink:0;margin-top:0.3rem;">${team.name}</span>`;
    li.innerHTML = staticHtml;

    // Note editor: toolbar + contenteditable
    const noteWrap = document.createElement('div');
    noteWrap.style.cssText = 'flex:1;min-width:0;display:flex;flex-direction:column;gap:0.25rem;';

    const toolbar = document.createElement('div');
    toolbar.style.cssText = 'display:flex;gap:0.25rem;';
    [['<b>B</b>', 'bold', 'font-weight:700;font-family:serif;'],
     ['<i>I</i>', 'italic', 'font-style:italic;font-family:serif;'],
     ['<u>U</u>', 'underline', 'text-decoration:underline;']].forEach(([label, cmd, extra]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = label;
      b.title = cmd.charAt(0).toUpperCase() + cmd.slice(1);
      b.style.cssText = fmtBtnStyle + extra;
      b.addEventListener('mousedown', e => {
        e.preventDefault();
        editor.focus();
        document.execCommand(cmd, false, null);
      });
      toolbar.appendChild(b);
    });

    const editor = document.createElement('div');
    editor.className = 'pr-note-input';
    editor.contentEditable = 'true';
    editor.innerHTML = note;
    editor.style.cssText = 'padding:0.32rem 0.5rem;background:#0a1f2e;border:1px solid rgba(200,168,75,0.2);color:#f5f0e8;border-radius:4px;font-size:0.83rem;min-height:2rem;outline:none;white-space:pre-wrap;';
    editor.dataset.placeholder = 'Note...';

    // Stop drag when user interacts with the editor area
    [editor, toolbar].forEach(el => {
      el.addEventListener('mousedown', e => e.stopPropagation());
    });
    editor.addEventListener('dragstart', e => e.stopPropagation());

    noteWrap.appendChild(toolbar);
    noteWrap.appendChild(editor);
    li.appendChild(noteWrap);
    return li;
  }

  function refreshRankNumbers() {
    const list = document.getElementById('pr-drag-list');
    if (!list) return;
    [...list.children].forEach((li, i) => {
      const rankEl = li.querySelector('div[style*="Cinzel"]');
      if (rankEl) rankEl.textContent = '#' + (i + 1);
    });
  }

  function loadWeek(w) {
    const list = document.getElementById('pr-drag-list');
    list.innerHTML = '';
    const weekData = allData[String(w)] || [];
    const noteMap = {};
    const orderedIds = weekData.map(e => { noteMap[e.teamId] = e.note || ''; return e.teamId; });
    // Append any teams not yet ranked to the bottom
    const unranked = teams.map(t => t.id).filter(id => !orderedIds.includes(id));
    [...orderedIds, ...unranked].forEach((teamId, i) => {
      const li = buildRow(teamId, noteMap[teamId] || '', i + 1);
      if (li) list.appendChild(li);
    });
  }

  loadWeek(currentWeek);

  // Drag-and-drop — attach once to the container
  const list = document.getElementById('pr-drag-list');
  let dragging = null;

  list.addEventListener('dragstart', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.closest('[contenteditable]')) { e.preventDefault(); return; }
    dragging = e.target.closest('li');
    if (!dragging) return;
    setTimeout(() => { if (dragging) dragging.style.opacity = '0.35'; }, 0);
    e.dataTransfer.effectAllowed = 'move';
  });

  list.addEventListener('dragend', () => {
    if (dragging) dragging.style.opacity = '';
    dragging = null;
    refreshRankNumbers();
  });

  list.addEventListener('dragover', e => {
    e.preventDefault();
    if (!dragging) return;
    const over = e.target.closest('li');
    if (!over || over === dragging) return;
    const rect = over.getBoundingClientRect();
    if (e.clientY < rect.top + rect.height / 2) {
      list.insertBefore(dragging, over);
    } else {
      list.insertBefore(dragging, over.nextSibling);
    }
  });

  document.getElementById('pr-admin-week-select').onchange = function () {
    loadWeek(parseInt(this.value));
  };

  document.getElementById('pr-admin-save').onclick = async () => {
    const week = parseInt(document.getElementById('pr-admin-week-select').value);
    const weekArr = [...list.querySelectorAll('li')].map(li => ({
      teamId: li.dataset.teamId,
      note: (li.querySelector('.pr-note-input')?.innerHTML || '').trim(),
    }));
    allData[String(week)] = weekArr;

    const msg = document.getElementById('pr-admin-msg');
    try {
      await adminFetch('admin-content', {
        method: 'POST',
        body: JSON.stringify([{ key: 'power_rankings_data', value: JSON.stringify(allData), season_id: seasonId }]),
      });
      if (!config.DB.contentBlocks) config.DB.contentBlocks = {};
      config.DB.contentBlocks.power_rankings_data = JSON.stringify(allData);
      const prSel = document.getElementById('pr-week-select');
      if (typeof window.renderPowerRankings === 'function') {
        window.renderPowerRankings(prSel ? parseInt(prSel.value) || week : week);
      }
      msg.innerHTML = '<p class="msg success">Saved.</p>';
      setTimeout(() => { msg.innerHTML = ''; }, 3000);
    } catch (err) {
      msg.innerHTML = `<p class="msg error">${err.message || 'Save failed.'}</p>`;
    }
  };
}
