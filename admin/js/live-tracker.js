/**
 * Live game stat tracker — ADMIN ONLY.
 *
 * Loaded solely from admin/js/sections.js, so the public site never ships it.
 *
 * Interaction is built for a tablet at courtside and a laptop equally:
 *  - Drag a token (+1/+2/+3, foul, rebound…) onto a player. Pointer Events are
 *    used rather than HTML5 drag-and-drop, which iOS Safari does not fire.
 *  - Or tap a token to arm it, then tap a player. Faster than dragging when
 *    you are watching the game rather than the screen, and the reliable path
 *    on a tablet.
 *  - Substitute by dragging (or arming) a bench player onto the player coming
 *    off; the incoming player takes the same spot on the floor.
 *
 * The event log is the source of truth and lives in localStorage per game, so
 * a refresh, a locked tablet or a dropped connection mid-game loses nothing.
 * Saving derives totals and posts them through the existing admin-game-stats
 * function, which already recomputes the final score.
 */

import {
  deriveState, appendEvent, undo, redo, canUndo, canRedo,
  toStatValues, missingStatSlugs, describeEvent, formatClock,
  STAT_LABELS, LINEUP_SIZE, DEFAULT_PERIOD_SECONDS,
} from '../../lib/game-tracker.js';

const storageKey = (gameId) => `faraj_live_tracker_${gameId}`;

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Tokens dragged onto players. Points first — they are the common case. */
const TOKENS = [
  { key: 'p1', label: '+1', kind: 'score', points: 1, cls: 'lt-token-score' },
  { key: 'p2', label: '+2', kind: 'score', points: 2, cls: 'lt-token-score' },
  { key: 'p3', label: '+3', kind: 'score', points: 3, cls: 'lt-token-score' },
  { key: 'foul', label: 'Foul', kind: 'foul', cls: 'lt-token-foul' },
  { key: 'reb', label: 'Reb', kind: 'stat', stat: 'reb', cls: 'lt-token-stat' },
  { key: 'ast', label: 'Ast', kind: 'stat', stat: 'ast', cls: 'lt-token-stat' },
  { key: 'stl', label: 'Stl', kind: 'stat', stat: 'stl', cls: 'lt-token-stat' },
  { key: 'blk', label: 'Blk', kind: 'stat', stat: 'blk', cls: 'lt-token-stat' },
  { key: 'to', label: 'TO', kind: 'stat', stat: 'to', cls: 'lt-token-stat' },
];

/**
 * Open the tracker for one game.
 * @param {object} game a `config.DB.scores` row: { gameId, t1Id, t2Id, t1, t2, week }
 * @param {{ adminFetch: Function, config: object, onSaved?: Function }} ctx
 */
export function openLiveTracker(game, ctx) {
  const { adminFetch, config } = ctx;
  const teams = config.DB.teams || [];
  const homeTeam = teams.find(t => t.id === game.t1Id);
  const awayTeam = teams.find(t => t.id === game.t2Id);
  if (!homeTeam || !awayTeam) {
    alert('Both teams need to be set on this game before tracking stats.');
    return;
  }

  const rosterOf = (t) => (t.roster || []).filter(p => p.id);
  const nameById = {};
  [homeTeam, awayTeam].forEach(t => rosterOf(t).forEach(p => { nameById[p.id] = p.name; }));
  const nameOf = (id) => nameById[id] || '—';
  const cfg = { homeTeamId: homeTeam.id, awayTeamId: awayTeam.id };

  // ---- persisted session -------------------------------------------------
  const blank = {
    events: [],
    cursor: 0,
    periodSeconds: DEFAULT_PERIOD_SECONDS,
    clock: DEFAULT_PERIOD_SECONDS,
    period: 1,
    running: false,
  };
  let session = blank;
  try {
    const saved = localStorage.getItem(storageKey(game.gameId));
    if (saved) session = { ...blank, ...JSON.parse(saved), running: false };
  } catch (_) { /* corrupt or unavailable storage — start fresh */ }

  const persist = () => {
    try {
      localStorage.setItem(storageKey(game.gameId), JSON.stringify({ ...session, running: false }));
    } catch (_) { /* private mode / quota — the game still works in memory */ }
  };

  // ---- shell -------------------------------------------------------------
  const wrap = document.createElement('div');
  wrap.className = 'lt-backdrop';
  wrap.innerHTML = `
    <div class="lt-panel" role="dialog" aria-label="Live stat tracker">
      <div class="lt-header">
        <div class="lt-scoreboard">
          <div class="lt-team-score"><span class="lt-team-name">${esc(homeTeam.name)}</span><span class="lt-score" id="lt-home-score">0</span></div>
          <div class="lt-clock-wrap">
            <button type="button" class="lt-clock" id="lt-clock" title="Tap to set the clock">20:00</button>
            <div class="lt-clock-controls">
              <button type="button" id="lt-startstop" class="lt-btn lt-btn-go">Start</button>
              <button type="button" id="lt-period" class="lt-btn">H1</button>
            </div>
          </div>
          <div class="lt-team-score"><span class="lt-team-name">${esc(awayTeam.name)}</span><span class="lt-score" id="lt-away-score">0</span></div>
        </div>
        <div class="lt-actions">
          <button type="button" id="lt-undo" class="lt-btn">↶ Undo</button>
          <button type="button" id="lt-redo" class="lt-btn">↷ Redo</button>
          <button type="button" id="lt-save" class="lt-btn lt-btn-save">Save stats</button>
          <button type="button" id="lt-close" class="lt-btn">Close</button>
        </div>
      </div>

      <div class="lt-armed" id="lt-armed" hidden></div>

      <div class="lt-courts">
        <div class="lt-court" data-team="${esc(homeTeam.id)}">
          <div class="lt-court-title">${esc(homeTeam.name)} <span class="lt-team-fouls" id="lt-fouls-${esc(homeTeam.id)}"></span></div>
          <div class="lt-floor" id="lt-floor-${esc(homeTeam.id)}"></div>
          <div class="lt-bench-title">Bench</div>
          <div class="lt-bench" id="lt-bench-${esc(homeTeam.id)}"></div>
        </div>
        <div class="lt-court" data-team="${esc(awayTeam.id)}">
          <div class="lt-court-title">${esc(awayTeam.name)} <span class="lt-team-fouls" id="lt-fouls-${esc(awayTeam.id)}"></span></div>
          <div class="lt-floor" id="lt-floor-${esc(awayTeam.id)}"></div>
          <div class="lt-bench-title">Bench</div>
          <div class="lt-bench" id="lt-bench-${esc(awayTeam.id)}"></div>
        </div>
      </div>

      <div class="lt-tokens" id="lt-tokens">
        ${TOKENS.map(t => `<button type="button" class="lt-token ${t.cls}" data-token="${t.key}">${esc(t.label)}</button>`).join('')}
      </div>
      <p class="lt-hint">Drag a token onto a player, or tap the token then tap the player. Substitute by dragging a bench player onto whoever is coming off.</p>

      <div class="lt-log-wrap">
        <div class="lt-log-title">Play log</div>
        <div class="lt-log" id="lt-log"></div>
      </div>
      <div class="lt-msg" id="lt-msg"></div>
    </div>`;
  document.body.appendChild(wrap);

  const $ = (id) => wrap.querySelector('#' + id);

  // ---- state helpers -----------------------------------------------------
  const state = () => deriveState(session.events, session.cursor, cfg);

  function lineupFor(teamId, derived) {
    const onCourt = derived.teams[teamId]?.onCourt || [];
    if (onCourt.length) return onCourt;
    return [];
  }

  function record(event) {
    const next = appendEvent(session.events, session.cursor, {
      ...event, period: session.period, clock: session.clock, at: Date.now(),
    });
    session.events = next.events;
    session.cursor = next.cursor;
    persist();
    render();
  }

  // ---- rendering ---------------------------------------------------------
  function playerTile(p, derived, { onCourt }) {
    const s = derived.players[p.id] || {};
    const fouls = s.foul || 0;
    return `<button type="button" class="lt-player${onCourt ? ' lt-on-court' : ' lt-bench-chip'}${fouls >= 5 ? ' lt-fouled-out' : ''}"
      data-player="${esc(p.id)}" data-team="${esc(p.teamId)}" data-oncourt="${onCourt ? '1' : '0'}">
      <span class="lt-player-name">${esc(p.name)}</span>
      <span class="lt-player-stats"><b>${s.pts || 0}</b> pts${fouls ? ` · ${fouls}f` : ''}</span>
    </button>`;
  }

  function render() {
    const derived = state();

    $('lt-home-score').textContent = derived.teams[homeTeam.id]?.score ?? 0;
    $('lt-away-score').textContent = derived.teams[awayTeam.id]?.score ?? 0;
    $('lt-clock').textContent = formatClock(session.clock);
    $('lt-period').textContent = session.period <= 2 ? `H${session.period}` : `OT${session.period - 2}`;
    $('lt-startstop').textContent = session.running ? 'Pause' : 'Start';
    $('lt-startstop').classList.toggle('lt-btn-go', !session.running);
    $('lt-startstop').classList.toggle('lt-btn-stop', session.running);

    [homeTeam, awayTeam].forEach(team => {
      const roster = rosterOf(team).map(p => ({ ...p, teamId: team.id }));
      const onCourt = lineupFor(team.id, derived);
      const floor = $(`lt-floor-${team.id}`);
      const bench = $(`lt-bench-${team.id}`);
      const teamFouls = derived.teams[team.id]?.fouls || 0;
      $(`lt-fouls-${team.id}`).textContent = teamFouls ? `${teamFouls} team fouls` : '';

      if (!onCourt.length) {
        floor.innerHTML = `<div class="lt-pick-five">Pick the starting ${LINEUP_SIZE} — tap players below.</div>`;
        bench.innerHTML = roster.map(p => playerTile(p, derived, { onCourt: false })).join('')
          || '<span class="lt-empty">No players on this team yet.</span>';
        return;
      }

      floor.innerHTML = onCourt
        .map(id => roster.find(p => p.id === id))
        .filter(Boolean)
        .map(p => playerTile(p, derived, { onCourt: true })).join('');
      bench.innerHTML = roster.filter(p => !onCourt.includes(p.id))
        .map(p => playerTile(p, derived, { onCourt: false })).join('')
        || '<span class="lt-empty">Everyone is on the floor.</span>';
    });

    $('lt-undo').disabled = !canUndo(session.cursor);
    $('lt-redo').disabled = !canRedo(session.events, session.cursor);
    const last = session.events[session.cursor - 1];
    $('lt-undo').title = last ? `Undo: ${describeEvent(last, nameOf)}` : 'Nothing to undo';

    const shown = session.events.slice(0, session.cursor).slice(-40).reverse();
    $('lt-log').innerHTML = shown.length
      ? shown.map(e => `<div class="lt-log-row"><span class="lt-log-clock">${esc(`${e.period <= 2 ? 'H' : 'OT'}${e.period <= 2 ? e.period : e.period - 2} ${formatClock(e.clock)}`)}</span>${esc(describeEvent(e, nameOf))}</div>`).join('')
      : '<div class="lt-empty">Nothing recorded yet.</div>';

    renderArmed();
  }

  // ---- arm / drag --------------------------------------------------------
  /** { kind:'token', token } | { kind:'sub', playerId, teamId } | null */
  let armed = null;

  function renderArmed() {
    const bar = $('lt-armed');
    wrap.querySelectorAll('.lt-token, .lt-player').forEach(el => el.classList.remove('lt-armed-el'));
    if (!armed) { bar.hidden = true; return; }
    bar.hidden = false;
    if (armed.kind === 'token') {
      const t = TOKENS.find(x => x.key === armed.token);
      bar.textContent = `${t.label} armed — tap a player. (Tap again to cancel.)`;
      wrap.querySelector(`.lt-token[data-token="${armed.token}"]`)?.classList.add('lt-armed-el');
    } else {
      bar.textContent = `${nameOf(armed.playerId)} coming in — tap the player coming off.`;
      wrap.querySelector(`.lt-player[data-player="${armed.playerId}"]`)?.classList.add('lt-armed-el');
    }
  }

  function applyToken(tokenKey, playerId, teamId) {
    const t = TOKENS.find(x => x.key === tokenKey);
    if (!t) return;
    if (t.kind === 'score') record({ type: 'score', playerId, teamId, points: t.points });
    else if (t.kind === 'foul') record({ type: 'foul', playerId, teamId });
    else record({ type: 'stat', playerId, teamId, stat: t.stat });
  }

  /** A tap on a player: completes whatever is armed, or picks the starting five. */
  function onPlayerActivated(playerId, teamId, isOnCourt) {
    const derived = state();
    const onCourt = lineupFor(teamId, derived);

    if (armed?.kind === 'token') {
      applyToken(armed.token, playerId, teamId);
      return;
    }
    if (armed?.kind === 'sub') {
      if (armed.teamId !== teamId) { flash('Substitutions have to stay within one team.'); armed = null; renderArmed(); return; }
      if (!isOnCourt) { flash('Tap the player coming off the floor.'); return; }
      const secs = session.periodSeconds - session.clock;
      record({ type: 'sub', teamId, playerInId: armed.playerId, playerOutId: playerId, secondsPlayed: Math.max(0, secs) });
      armed = null;
      return;
    }

    // Nothing armed: build the starting five, or arm a bench player for a sub.
    if (!onCourt.length) {
      const picked = pending[teamId] || [];
      const next = picked.includes(playerId) ? picked.filter(x => x !== playerId) : [...picked, playerId];
      pending[teamId] = next.slice(0, LINEUP_SIZE);
      if (pending[teamId].length === LINEUP_SIZE) {
        record({ type: 'lineup', teamId, playerIds: pending[teamId] });
        pending[teamId] = [];
      } else {
        highlightPending(teamId);
      }
      return;
    }
    if (!isOnCourt) { armed = { kind: 'sub', playerId, teamId }; renderArmed(); }
  }

  const pending = {};
  function highlightPending(teamId) {
    wrap.querySelectorAll(`.lt-player[data-team="${teamId}"]`).forEach(el => {
      el.classList.toggle('lt-picked', (pending[teamId] || []).includes(el.dataset.player));
    });
  }

  function flash(msg) {
    const el = $('lt-msg');
    el.textContent = msg;
    clearTimeout(flash._t);
    flash._t = setTimeout(() => { el.textContent = ''; }, 2600);
  }

  // Pointer-based drag: works with touch, pen and mouse alike. A press that
  // never moves far is treated as a tap, so both interaction styles coexist.
  let drag = null;
  wrap.addEventListener('pointerdown', (e) => {
    const token = e.target.closest('.lt-token');
    const player = e.target.closest('.lt-player');
    const src = token || player;
    if (!src) return;
    drag = { src, startX: e.clientX, startY: e.clientY, moved: false, ghost: null };
  });

  wrap.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.startX, dy = e.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 8) return;
    if (!drag.moved) {
      drag.moved = true;
      drag.ghost = document.createElement('div');
      drag.ghost.className = 'lt-ghost';
      drag.ghost.textContent = drag.src.classList.contains('lt-token')
        ? drag.src.textContent.trim()
        : nameOf(drag.src.dataset.player);
      document.body.appendChild(drag.ghost);
      e.preventDefault();
    }
    drag.ghost.style.left = `${e.clientX}px`;
    drag.ghost.style.top = `${e.clientY}px`;
    const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('.lt-player');
    wrap.querySelectorAll('.lt-player').forEach(el => el.classList.toggle('lt-drop-target', el === over));
  });

  wrap.addEventListener('pointerup', (e) => {
    if (!drag) return;
    const { src, moved, ghost } = drag;
    drag = null;
    ghost?.remove();
    wrap.querySelectorAll('.lt-player').forEach(el => el.classList.remove('lt-drop-target'));

    if (!moved) {
      // A tap.
      if (src.classList.contains('lt-token')) {
        const key = src.dataset.token;
        armed = armed?.kind === 'token' && armed.token === key ? null : { kind: 'token', token: key };
        renderArmed();
      } else {
        onPlayerActivated(src.dataset.player, src.dataset.team, src.dataset.oncourt === '1');
      }
      return;
    }

    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('.lt-player');
    if (!target) return;
    const targetId = target.dataset.player;
    const targetTeam = target.dataset.team;

    if (src.classList.contains('lt-token')) {
      applyToken(src.dataset.token, targetId, targetTeam);
      return;
    }
    // Player dragged onto player = substitution.
    if (src.dataset.team !== targetTeam) { flash('Substitutions have to stay within one team.'); return; }
    if (src.dataset.oncourt === '1' || target.dataset.oncourt !== '1') {
      flash('Drag a bench player onto someone on the floor.');
      return;
    }
    record({
      type: 'sub', teamId: targetTeam,
      playerInId: src.dataset.player, playerOutId: targetId,
      secondsPlayed: Math.max(0, session.periodSeconds - session.clock),
    });
  });

  wrap.addEventListener('pointercancel', () => { drag?.ghost?.remove(); drag = null; });

  // ---- clock -------------------------------------------------------------
  let ticker = null;
  function stopClock() {
    session.running = false;
    if (ticker) { clearInterval(ticker); ticker = null; }
  }
  function startClock() {
    if (session.running) return;
    session.running = true;
    ticker = setInterval(() => {
      session.clock = Math.max(0, session.clock - 1);
      $('lt-clock').textContent = formatClock(session.clock);
      if (session.clock === 0) { stopClock(); persist(); render(); flash('Period over.'); }
    }, 1000);
  }

  $('lt-startstop').onclick = () => { session.running ? stopClock() : startClock(); persist(); render(); };
  $('lt-clock').onclick = () => {
    stopClock();
    const entry = prompt('Set the clock (minutes, or mm:ss):', formatClock(session.clock));
    if (entry == null) { render(); return; }
    const m = String(entry).trim().match(/^(\d+)(?::(\d{1,2}))?$/);
    if (!m) { flash('Enter minutes like 20, or mm:ss like 12:30.'); render(); return; }
    const secs = Number(m[1]) * 60 + Number(m[2] || 0);
    session.clock = secs;
    // A fresh setting also becomes the period length, so minutes played stay right.
    if (secs > session.periodSeconds) session.periodSeconds = secs;
    persist(); render();
  };
  $('lt-period').onclick = () => {
    stopClock();
    session.period += 1;
    session.clock = session.periodSeconds;
    record({ type: 'period', period: session.period });
  };

  // ---- undo / redo / save ------------------------------------------------
  $('lt-undo').onclick = () => { session.cursor = undo(session.cursor); persist(); render(); };
  $('lt-redo').onclick = () => { session.cursor = redo(session.events, session.cursor); persist(); render(); };

  $('lt-close').onclick = () => {
    stopClock();
    persist();
    wrap.remove();
  };

  $('lt-save').onclick = async () => {
    stopClock();
    const derived = state();
    const defs = config.DB.statDefinitions || [];
    const missing = missingStatSlugs(defs);
    const values = toStatValues(derived.players, defs);

    if (!values.length) {
      flash('No stat columns are defined yet — add at least "points" on the Stats tab.');
      return;
    }
    if (!confirm('Save these stats? This replaces whatever is currently recorded for this game.')) return;

    // Anyone on the roster who never appeared is a DNP for this game.
    const appeared = new Set(Object.keys(derived.players));
    session.events.slice(0, session.cursor).forEach(e => {
      if (e.type === 'lineup') (e.playerIds || []).forEach(id => appeared.add(id));
      if (e.type === 'sub') { appeared.add(e.playerInId); appeared.add(e.playerOutId); }
    });
    const dnp = [...rosterOf(homeTeam), ...rosterOf(awayTeam)]
      .map(p => p.id).filter(id => !appeared.has(id));

    $('lt-save').disabled = true;
    flash('Saving…');
    try {
      await adminFetch('admin-game-stats', {
        method: 'POST',
        body: JSON.stringify({ game_id: game.gameId, values, dnp_player_ids: dnp }),
      });
      flash(`Saved. ${missing.length ? `Not recorded (no stat column yet): ${missing.join(', ')}.` : ''}`);
      if (ctx.onSaved) await ctx.onSaved();
    } catch (err) {
      flash(`Save failed: ${err.message}`);
    } finally {
      $('lt-save').disabled = false;
    }
  };

  render();
  if (missingStatSlugs(config.DB.statDefinitions || []).length) {
    flash(`Heads up: no stat column for ${missingStatSlugs(config.DB.statDefinitions || []).join(', ')} — those will not be saved.`);
  }
}
