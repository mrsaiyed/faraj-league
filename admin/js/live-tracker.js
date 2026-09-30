/**
 * Live game stat tracker — ADMIN ONLY.
 *
 * Loaded solely from admin/js/sections.js, so the public site never ships it.
 *
 * Interaction is built for a tablet at courtside and a laptop equally:
 *  - Tap a player and their options open under their name: +1, +2, +3, Foul
 *    and −Foul (a foul found to be wrong later — undo only reaches the last
 *    thing recorded). Tap one and it is recorded; tap anywhere else to close.
 *  - A bench player's options also say who they come on "In for", one button
 *    per player on the floor, so a substitution is two taps. Dragging a bench
 *    player onto whoever is coming off works too — Pointer Events, not HTML5
 *    drag-and-drop, which iOS Safari does not fire. The incoming player takes
 *    the same spot on the floor.
 *  - Until a team's starting five is set, tapping its players picks them.
 *
 * The event log is the source of truth and lives in localStorage per game, so
 * a refresh, a locked tablet or a dropped connection mid-game loses nothing.
 * Saving derives totals and posts them through the existing admin-game-stats
 * function, which already recomputes the final score.
 */

import {
  deriveState, appendEvent, undo, redo, canUndo, canRedo,
  toStatValues, missingStatSlugs, describeEvent, formatClock, livePlayerSeconds, hasRecordedStats,
  changedStatValues, statValueKey, bonusFor, bonusLabel, periodLabel, rewindClock, PERIOD_OPTIONS, MAX_PERIOD,
  LINEUP_SIZE, DEFAULT_PERIOD_SECONDS,
} from '../../lib/game-tracker.js';
import { playBonusHorn } from './tracker-sound.js';

const storageKey = (gameId) => `faraj_live_tracker_${gameId}`;

/**
 * Wait after the last tap before pushing. Short enough to feel immediate,
 * long enough that a quick correction (tap, undo) is a single write.
 */
const AUTO_SYNC_MS = 900;

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A player's options: points first — they are the common case — then fouls. */
const ACTIONS = [
  { act: 'p1', label: '+1', cls: 'lt-opt-score' },
  { act: 'p2', label: '+2', cls: 'lt-opt-score' },
  { act: 'p3', label: '+3', cls: 'lt-opt-score' },
  { act: 'foul', label: 'Foul', cls: 'lt-opt-foul' },
  { act: 'unfoul', label: '−Foul', cls: 'lt-opt-unfoul' },
];

/**
 * Open the tracker for one game.
 * @param {object} game a `config.DB.scores` row: { gameId, t1Id, t2Id, t1, t2, week }
 * @param {{ adminFetch: Function, config: object, onSaved?: Function }} ctx
 */
export function openLiveTracker(game, ctx) {
  const { adminFetch, config, autoSync } = ctx;
  const teams = config.DB.teams || [];
  const homeTeam = teams.find(t => t.id === game.t1Id);
  const awayTeam = teams.find(t => t.id === game.t2Id);
  if (!homeTeam || !awayTeam) {
    alert('Both teams need to be set on this game before tracking stats.');
    return;
  }

  const rosterOf = (t) => (t.roster || []).filter(p => p.id);
  const nameById = {};
  const numberById = {};
  [homeTeam, awayTeam].forEach(t => rosterOf(t).forEach(p => {
    nameById[p.id] = p.name;
    if (p.jersey_number != null && p.jersey_number !== '') numberById[p.id] = String(p.jersey_number);
  }));
  const nameOf = (id) => nameById[id] || '—';
  /** "#23 Name" where the player has a number — how a scorekeeper spots them on the floor. */
  const labelOf = (id) => (numberById[id] != null ? `#${numberById[id]} ` : '') + nameOf(id);
  /** "#23 Saif" — number and first name, for the tight "In for" buttons. */
  const shortLabelOf = (id) => (numberById[id] != null ? `#${numberById[id]} ` : '') + String(nameOf(id)).split(' ')[0];
  const cfg = { homeTeamId: homeTeam.id, awayTeamId: awayTeam.id };

  // ---- persisted session -------------------------------------------------
  const blank = {
    events: [],
    cursor: 0,
    periodSeconds: DEFAULT_PERIOD_SECONDS,
    clock: DEFAULT_PERIOD_SECONDS,
    period: 1,
    running: false,
    /** Mirrors games.status so a reopened tracker knows where it left off. */
    status: null,
    // Cumulative seconds the clock has actually run, across periods. Minutes
    // played are derived from this rather than from the countdown: setting the
    // clock forward never adds minutes, and setting it back within a period
    // takes those seconds back (see the clock handler and `rewindClock`).
    elapsed: 0,
    // The schedule shows the home team blue and the away team white; teams
    // whose jerseys are the other way round get swapped here, per game.
    colorsSwapped: false,
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
          <div class="lt-team-score" data-team="${esc(homeTeam.id)}"><span class="lt-team-name">${esc(homeTeam.name)}</span><span class="lt-score" id="lt-home-score">0</span></div>
          <div class="lt-clock-wrap">
            <button type="button" class="lt-clock" id="lt-clock" title="Tap to set the clock">20:00</button>
            <div class="lt-clock-controls">
              <button type="button" id="lt-startstop" class="lt-btn lt-btn-go">Start</button>
              <select id="lt-period" class="lt-btn lt-period-select" title="Jump to a period">
                ${PERIOD_OPTIONS.map(o => `<option value="${o.value}">${esc(o.label)}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="lt-team-score" data-team="${esc(awayTeam.id)}"><span class="lt-team-name">${esc(awayTeam.name)}</span><span class="lt-score" id="lt-away-score">0</span></div>
        </div>
        <div class="lt-actions">
          <button type="button" id="lt-undo" class="lt-btn">↶ Undo</button>
          <button type="button" id="lt-redo" class="lt-btn">↷ Redo</button>
          <button type="button" id="lt-swap-colors" class="lt-btn" title="Swap which team is white and which is blue">⇄ Swap colors</button>
          <button type="button" id="lt-not-started" class="lt-btn" title="Put this game back to not started: no score, not live">Mark not started</button>
          <button type="button" id="lt-end" class="lt-btn">End game</button>
          <button type="button" id="lt-save" class="lt-btn lt-btn-save">Save stats</button>
          <button type="button" id="lt-close" class="lt-btn">Close</button>
        </div>
        <div class="lt-sync" id="lt-sync">Live · not yet saved</div>
        <div class="lt-sync lt-sync-note" id="lt-clock-note" hidden></div>
      </div>

      <div class="lt-courts">
        <div class="lt-court" data-team="${esc(homeTeam.id)}">
          <div class="lt-court-title">
            <span class="lt-court-head"><span class="lt-court-team">${esc(homeTeam.name)}</span><span class="lt-bonus" id="lt-bonus-${esc(homeTeam.id)}" hidden></span></span>
            <span class="lt-team-fouls" id="lt-fouls-${esc(homeTeam.id)}"></span>
          </div>
          <div class="lt-floor" id="lt-floor-${esc(homeTeam.id)}"></div>
          <div class="lt-bench-title">Bench</div>
          <div class="lt-bench" id="lt-bench-${esc(homeTeam.id)}"></div>
        </div>
        <div class="lt-court" data-team="${esc(awayTeam.id)}">
          <div class="lt-court-title">
            <span class="lt-court-head"><span class="lt-court-team">${esc(awayTeam.name)}</span><span class="lt-bonus" id="lt-bonus-${esc(awayTeam.id)}" hidden></span></span>
            <span class="lt-team-fouls" id="lt-fouls-${esc(awayTeam.id)}"></span>
          </div>
          <div class="lt-floor" id="lt-floor-${esc(awayTeam.id)}"></div>
          <div class="lt-bench-title">Bench</div>
          <div class="lt-bench" id="lt-bench-${esc(awayTeam.id)}"></div>
        </div>
      </div>

      <p class="lt-hint">Tap a player for +1, +2, +3, a foul or −Foul. Tap someone on the bench to sub them in, or drag them onto whoever is coming off.</p>

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
  /** 'blue' for the home team and 'white' for the away team, as the schedule shows them, unless swapped. */
  const teamColor = (teamId) => ((teamId === homeTeam.id) !== !!session.colorsSwapped ? 'blue' : 'white');

  function lineupFor(teamId, derived) {
    const onCourt = derived.teams[teamId]?.onCourt || [];
    if (onCourt.length) return onCourt;
    return [];
  }

  function record(event) {
    if (resetting) return;
    const next = appendEvent(session.events, session.cursor, {
      ...event, period: session.period, clock: session.clock,
      elapsed: session.elapsed, at: Date.now(),
    });
    session.events = next.events;
    session.cursor = next.cursor;
    persist();
    render();
    queueAutoSync();
    // The first thing recorded is what makes a game live for viewers.
    if (!session.status || session.status === 'scheduled') pushGameState('live');
  }

  // ---- live sync ---------------------------------------------------------
  // The public site polls for score and stat changes, so totals are pushed as
  // the game is scored rather than only when Save is pressed. Debounced: a
  // flurry of taps during a scoring run becomes one write.
  let syncTimer = null;
  let syncing = false;
  let syncPending = false;
  /** True while the game is being marked not started: taps and pushes wait. */
  let resetting = false;
  /** `player:def` → value last written, so each push carries only the diff. */
  let lastSent = new Map();

  function queueAutoSync() {
    if (autoSync === false || resetting) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(runAutoSync, AUTO_SYNC_MS);
  }

  async function runAutoSync() {
    if (autoSync === false) return;
    if (syncing) { syncPending = true; return; }       // fold into the next run
    const defs = config.DB.statDefinitions || [];
    if (!defs.length) return;

    const derived = state();
    // Never push an untouched game: zero-filled rows would set it to 0-0,
    // which the site reads as played.
    if (!hasRecordedStats(derived.players)) return;
    const rosterIds = [...rosterOf(homeTeam), ...rosterOf(awayTeam)].map(p => p.id);
    // Zero-fill every roster player: without it an undone basket leaves the
    // old total sitting in the database.
    const values = toStatValues(derived.players, defs, rosterIds);
    const changed = changedStatValues(values, lastSent);
    if (!changed.length) { setSyncState('saved'); return; }

    syncing = true;
    setSyncState('saving');
    try {
      // No DNP list mid-game — players simply may not have come on yet.
      await adminFetch('admin-game-stats', {
        method: 'POST',
        body: JSON.stringify({ game_id: game.gameId, values: changed, dnp_player_ids: [] }),
      });
      // Only now: a failed write must be retried, not treated as sent.
      changed.forEach(v => lastSent.set(statValueKey(v), v.value));
      setSyncState('saved');
    } catch (err) {
      // Keep scoring; the next event retries and Save is still the backstop.
      setSyncState('error', err.message);
    } finally {
      syncing = false;
      if (syncPending) { syncPending = false; queueAutoSync(); }
    }
  }

  /**
   * Publish the clock and status so viewers see a live game as live.
   *
   * Written only when the state actually changes — start, pause, period, end —
   * never per second: viewers extrapolate from the stored anchor instead.
   *
   * @param {string} status one of scheduled | live | halftime | final
   */
  /** Cleared once the database turns out not to have the clock columns yet. */
  let clockSupported = true;
  /** The state push in flight, if any. Pushes run in order, and a reset waits for them. */
  let statePush = Promise.resolve();

  function pushGameState(status) {
    statePush = statePush.then(() => writeGameState(status));
    return statePush;
  }

  async function writeGameState(status) {
    if (!clockSupported) return;
    try {
      await adminFetch('admin-games', {
        method: 'POST',
        body: JSON.stringify({
          id: game.gameId,
          status,
          period: session.period,
          clock_seconds: Math.max(0, Math.round(session.clock)),
          clock_running: status === 'live' ? !!session.running : false,
        }),
      });
      session.status = status;
      persist();
    } catch (err) {
      // A database without migration 012 has no clock columns. Say so once, in
      // its own line, rather than repeatedly flashing a save failure over the
      // stats status — the stats themselves are saving fine.
      if (/column|schema cache/i.test(err.message || '')) {
        clockSupported = false;
        const note = $('lt-clock-note');
        if (note) {
          note.hidden = false;
          note.textContent = 'Live clock off — run migration 012. Stats are still saving.';
        }
        return;
      }
      // Anything else: scoring continues, the next change retries.
      setSyncState('error', err.message);
    }
  }

  function setSyncState(kind, detail) {
    const el = $('lt-sync');
    if (!el) return;
    el.className = `lt-sync lt-sync-${kind}`;
    el.textContent = kind === 'saving' ? 'Saving…'
      : kind === 'saved' ? `Live · updated ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
      : `Not saved — ${detail || 'will retry'}`;
  }

  // ---- rendering ---------------------------------------------------------
  /**
   * teamId → bonus level already on screen. The horn sounds on the crossing
   * only, so a repaint at 8 team fouls stays silent while the 7th sounds.
   */
  const bonusShown = {};
  /**
   * Seeded by the first paint. Reopening a game that is already in the double
   * bonus must not blare as the panel appears — only a foul recorded here does.
   */
  let bonusPrimed = false;

  /** The player whose options are open under their tile, or null. */
  let menuFor = null;

  function playerTile(p, derived, { onCourt, floor = [] }) {
    const s = derived.players[p.id] || {};
    const fouls = s.foul || 0;
    const mins = formatClock(livePlayerSeconds(derived, p.id, session.elapsed));
    const number = numberById[p.id];
    const open = menuFor === p.id;
    return `<div class="lt-slot${open ? ' lt-slot-open' : ''}">
      <button type="button" class="lt-player${onCourt ? ' lt-on-court' : ' lt-bench-chip'}${fouls >= 5 ? ' lt-fouled-out' : ''}${open ? ' lt-menu-open' : ''}"
        data-player="${esc(p.id)}" data-team="${esc(p.teamId)}" data-oncourt="${onCourt ? '1' : '0'}" aria-expanded="${open}">
        <span class="lt-player-num${number == null ? ' lt-player-num-none' : ''}">${number == null ? '–' : esc(number)}</span>
        <span class="lt-player-name">${esc(p.name)}</span>
        <span class="lt-player-stats"><span class="lt-fouls">${fouls}F</span><span class="lt-pts">${s.pts || 0} pts</span></span>
        <span class="lt-player-mins" data-mins-for="${esc(p.id)}">${mins}</span>
      </button>
      ${open ? playerMenu(p, fouls, onCourt, floor) : ''}
    </div>`;
  }

  /** +1 +2 +3 Foul −Foul, and for a bench player who they come on for. */
  function playerMenu(p, fouls, onCourt, floor) {
    const who = `data-player="${esc(p.id)}" data-team="${esc(p.teamId)}"`;
    const subs = onCourt || !floor.length ? '' : `<div class="lt-menu-row lt-menu-subs"><span class="lt-menu-label">In for</span>${floor
      .map(id => `<button type="button" class="lt-opt lt-opt-sub" data-act="sub" ${who} data-out="${esc(id)}">${esc(shortLabelOf(id))}</button>`).join('')}</div>`;
    const button = (a) => `<button type="button" class="lt-opt ${a.cls}" data-act="${a.act}" ${who}${a.act === 'unfoul' && !fouls ? ' disabled' : ''}>${esc(a.label)}</button>`;
    const group = (acts) => `<div class="lt-menu-row">${ACTIONS.filter(a => acts.includes(a.act)).map(button).join('')}</div>`;
    return `<div class="lt-menu" aria-label="${esc(labelOf(p.id))}">${subs}<div class="lt-menu-acts">${group(['p1', 'p2', 'p3'])}${group(['foul', 'unfoul'])}</div></div>`;
  }

  function render() {
    const derived = state();
    // `session.period` exists only to label the picker and to stamp new
    // events — the event log (replayed by deriveState) is what undo/redo
    // actually move through. Re-deriving it on every paint, rather than only
    // ever incrementing it, is what makes undo/redo work across a period
    // change: without this, undoing back out of a period you had advanced
    // into rolled the score back correctly but left the picker (and every
    // event recorded after) stuck on that period.
    session.period = derived.period;

    $('lt-home-score').textContent = derived.teams[homeTeam.id]?.score ?? 0;
    $('lt-away-score').textContent = derived.teams[awayTeam.id]?.score ?? 0;
    $('lt-clock').textContent = formatClock(session.clock);
    const periodSelect = $('lt-period');
    // Normally one of the five listed options; a stray value from before the
    // picker existed (or a game that ran past OT3) gets a matching option
    // added on the fly rather than showing blank.
    if (derived.period > MAX_PERIOD && !periodSelect.querySelector(`option[value="${derived.period}"]`)) {
      periodSelect.insertAdjacentHTML('beforeend', `<option value="${derived.period}">${esc(periodLabel(derived.period))}</option>`);
    }
    periodSelect.value = String(session.period);
    // Each team in its colour — the court, its players and its scoreboard block.
    [homeTeam, awayTeam].forEach(team => {
      const color = teamColor(team.id);
      wrap.querySelectorAll(`.lt-court[data-team="${team.id}"], .lt-team-score[data-team="${team.id}"]`)
        .forEach(el => { el.dataset.color = color; });
    });
    $('lt-startstop').textContent = session.running ? 'Pause' : 'Start';
    $('lt-startstop').classList.toggle('lt-btn-go', !session.running);
    $('lt-startstop').classList.toggle('lt-btn-stop', session.running);

    [homeTeam, awayTeam].forEach(team => {
      const roster = rosterOf(team).map(p => ({ ...p, teamId: team.id }));
      const onCourt = lineupFor(team.id, derived);
      const floor = $(`lt-floor-${team.id}`);
      const bench = $(`lt-bench-${team.id}`);
      // The bonus is a per-half count, and it is the OPPONENT's fouls that
      // put this team in it — see `bonusFor`.
      const opponentId = team.id === homeTeam.id ? awayTeam.id : homeTeam.id;
      const { halfFouls, penalty, bonus } = bonusFor(derived, team.id, opponentId);

      const foulsEl = $(`lt-fouls-${team.id}`);
      foulsEl.textContent = halfFouls ? `${halfFouls} team fouls` : '';
      foulsEl.classList.toggle('lt-fouls-bonus', penalty === 1);
      foulsEl.classList.toggle('lt-fouls-double', penalty === 2);

      const bonusEl = $(`lt-bonus-${team.id}`);
      bonusEl.textContent = bonusLabel(bonus);
      bonusEl.hidden = !bonus;
      bonusEl.classList.toggle('lt-bonus-double', bonus === 2);

      // Rising only: half time drops the level back to none in silence, and
      // the next 7th foul sounds again.
      const was = bonusShown[team.id] ?? 0;
      bonusShown[team.id] = bonus;
      if (bonusPrimed && bonus > was) {
        playBonusHorn(bonus);
        // Say it as well as sound it: a muted tablet is the normal case in a gym.
        flash(`${team.name} — ${bonusLabel(bonus)}.`);
      }

      if (!onCourt.length) {
        floor.innerHTML = `<div class="lt-pick-five">Pick the starting ${LINEUP_SIZE} — tap players below.</div>`;
        bench.innerHTML = roster.map(p => playerTile(p, derived, { onCourt: false })).join('')
          || '<span class="lt-empty">No players on this team yet.</span>';
        return;
      }

      floor.innerHTML = onCourt
        .map(id => roster.find(p => p.id === id))
        .filter(Boolean)
        .map(p => playerTile(p, derived, { onCourt: true, floor: onCourt })).join('');
      bench.innerHTML = roster.filter(p => !onCourt.includes(p.id))
        .map(p => playerTile(p, derived, { onCourt: false, floor: onCourt })).join('')
        || '<span class="lt-empty">Everyone is on the floor.</span>';
    });

    $('lt-undo').disabled = !canUndo(session.cursor);
    $('lt-redo').disabled = !canRedo(session.events, session.cursor);
    const last = session.events[session.cursor - 1];
    $('lt-undo').title = last ? `Undo${describeEvent(last, nameOf) ? `: ${describeEvent(last, nameOf)}` : ''}` : 'Nothing to undo';

    // An older game's rebounds, assists and the like have no description any more.
    const shown = session.events.slice(0, session.cursor).filter(e => describeEvent(e, nameOf)).slice(-40).reverse();
    $('lt-log').innerHTML = shown.length
      ? shown.map(e => `<div class="lt-log-row"><span class="lt-log-clock">${esc(`${periodLabel(e.period)} ${formatClock(e.clock)}`)}</span>${esc(describeEvent(e, nameOf))}</div>`).join('')
      : '<div class="lt-empty">Nothing recorded yet.</div>';

    bonusPrimed = true;
    placeMenu();
  }

  /** Repaint just the minutes, so the per-second tick never rebuilds the tiles. */
  function paintMinutes() {
    const derived = state();
    wrap.querySelectorAll('.lt-player-mins[data-mins-for]').forEach(el => {
      el.textContent = formatClock(livePlayerSeconds(derived, el.dataset.minsFor, session.elapsed));
    });
  }

  // ---- player options ----------------------------------------------------
  /**
   * Keep the open options inside their court — centred under the tile, nudged
   * in from either edge — and in view, since on a phone lying down each court
   * scrolls on its own. Placed in the tile's own box, so opening them never
   * moves a tile.
   */
  function placeMenu() {
    const menu = wrap.querySelector('.lt-menu');
    if (!menu) { menuFor = null; return; }
    const court = menu.closest('.lt-court');
    menu.style.maxWidth = `${Math.min(440, court.clientWidth - 12)}px`;
    menu.style.setProperty('--nudge', '0px');
    const c = court.getBoundingClientRect(), m = menu.getBoundingClientRect();
    const k = court.offsetWidth ? c.width / court.offsetWidth : 1;  // the desktop html{zoom}
    const edge = 6 * k;
    let dx = 0;
    if (m.left < c.left + edge) dx = c.left + edge - m.left;
    else if (m.right > c.right - edge) dx = c.right - edge - m.right;
    if (dx) menu.style.setProperty('--nudge', `${dx / k}px`);
    menu.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  /** A tap on a player: picks the starting five until it is set, then opens their options. */
  function onPlayerTap(playerId, teamId) {
    const onCourt = lineupFor(teamId, state());
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
    menuFor = menuFor === playerId ? null : playerId;
    render();
  }

  /** One of the options under a player. */
  function onAction(btn) {
    if (btn.disabled) return;
    const { act, player: playerId, team: teamId, out } = btn.dataset;
    menuFor = null;
    if (resetting) { render(); return; }
    if (act === 'p1' || act === 'p2' || act === 'p3') record({ type: 'score', playerId, teamId, points: Number(act.slice(1)) });
    else if (act === 'foul') record({ type: 'foul', playerId, teamId });
    else if (act === 'unfoul') record({ type: 'unfoul', playerId, teamId });
    else if (act === 'sub') record({ type: 'sub', teamId, playerInId: playerId, playerOutId: out });
    else render();
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

  // Pointer-based: works with touch, pen and mouse alike. A press on a player
  // that never moves far is a tap; one that does is a drag, which is how a
  // bench player can be dropped onto whoever is coming off.
  let drag = null;
  wrap.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.lt-opt')) return;
    const src = e.target.closest('.lt-player');
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
      drag.ghost.textContent = labelOf(drag.src.dataset.player);
      document.body.appendChild(drag.ghost);
      e.preventDefault();
    }
    drag.ghost.style.left = `${e.clientX}px`;
    drag.ghost.style.top = `${e.clientY}px`;
    const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('.lt-player');
    wrap.querySelectorAll('.lt-player').forEach(el => el.classList.toggle('lt-drop-target', el === over));
  });

  wrap.addEventListener('pointerup', (e) => {
    const opt = e.target.closest('.lt-opt');
    if (opt && !drag) { onAction(opt); return; }
    if (!drag) {
      // A tap anywhere else closes the options.
      if (menuFor && !e.target.closest('.lt-menu')) { menuFor = null; render(); }
      return;
    }
    const { src, moved, ghost } = drag;
    drag = null;
    ghost?.remove();
    wrap.querySelectorAll('.lt-player').forEach(el => el.classList.remove('lt-drop-target'));

    if (!moved) { onPlayerTap(src.dataset.player, src.dataset.team); return; }

    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('.lt-player');
    if (!target) return;
    // Player dragged onto player = substitution.
    if (src.dataset.team !== target.dataset.team) { flash('Substitutions have to stay within one team.'); return; }
    if (src.dataset.oncourt === '1' || target.dataset.oncourt !== '1') {
      flash('Drag a bench player onto someone on the floor.');
      return;
    }
    menuFor = null;
    record({ type: 'sub', teamId: target.dataset.team, playerInId: src.dataset.player, playerOutId: target.dataset.player });
  });

  wrap.addEventListener('pointercancel', () => { drag?.ghost?.remove(); drag = null; });

  // Keyboard: Enter or Space on a player or an option does what a tap does
  // (a click with no pointer behind it), and Escape closes the options. Every
  // one repaints the tiles, so focus is put back where the next key belongs.
  const focusTile = (id) => wrap.querySelector(`.lt-player[data-player="${CSS.escape(id)}"]`)?.focus();
  wrap.addEventListener('click', (e) => {
    if (e.detail !== 0) return;
    const opt = e.target.closest('.lt-opt');
    if (opt) {
      const id = opt.dataset.player;
      onAction(opt);
      focusTile(id);
      return;
    }
    const tile = e.target.closest('.lt-player');
    if (!tile) return;
    const id = tile.dataset.player;
    onPlayerTap(id, tile.dataset.team);
    const first = menuFor === id && wrap.querySelector('.lt-menu .lt-opt:not(:disabled)');
    if (first) first.focus(); else focusTile(id);
  });
  const onKeydown = (e) => {
    if (e.key !== 'Escape' || !menuFor) return;
    const id = menuFor;
    menuFor = null;
    render();
    focusTile(id);
  };
  document.addEventListener('keydown', onKeydown);

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
      if (session.clock <= 0) { stopClock(); persist(); render(); flash('Period over.'); return; }
      session.clock -= 1;
      session.elapsed += 1;
      $('lt-clock').textContent = formatClock(session.clock);
      paintMinutes();
      if (session.clock === 0) {
        stopClock(); persist(); render();
        // End of the first half is the break; later periods wait for the
        // scorekeeper to call the game.
        const atBreak = session.period < 2;
        pushGameState(atBreak ? 'halftime' : 'live');
        flash(atBreak ? 'Half time.' : 'Period over.');
      }
    }, 1000);
  }

  $('lt-startstop').onclick = () => {
    session.running ? stopClock() : startClock();
    persist(); render();
    pushGameState('live');
  };
  $('lt-clock').onclick = () => {
    stopClock();
    const entry = prompt('Set the clock (minutes, or mm:ss).\nSetting it back also takes that time off the minutes of whoever was on the floor.', formatClock(session.clock));
    if (entry == null) { render(); return; }
    const m = String(entry).trim().match(/^(\d+)(?::(\d{1,2}))?$/);
    if (!m) { flash('Enter minutes like 20, or mm:ss like 12:30.'); render(); return; }
    const secs = Number(m[1]) * 60 + Number(m[2] || 0);
    // Time put back on the clock within a period is time it should never have
    // run — nearly always a clock left running through a stoppage — so whoever
    // was on the floor for it gives those seconds back. Setting it forward
    // leaves minutes alone.
    if (secs > session.clock) {
      const { events, elapsed, rewound } = rewindClock(session.events, {
        elapsed: session.elapsed, seconds: secs - session.clock,
        periodStart: state().periodStartElapsed, clock: secs, period: session.period,
      });
      session.events = events;
      session.elapsed = elapsed;
      if (rewound) flash(`Clock set back ${formatClock(rewound)} — taken off the minutes of whoever was on the floor.`);
    }
    session.clock = secs;
    // A fresh setting also becomes the period length, so minutes played stay right.
    if (secs > session.periodSeconds) session.periodSeconds = secs;
    persist(); render();
    if (session.status && session.status !== 'scheduled') pushGameState(session.status);
  };
  // Jump straight to a period — replaces the old "click to advance one at a
  // time" button, which had no way back and no cap (mis-tap it enough times
  // and you're in "OT9"). Picking a period always appends a fresh `period`
  // event (same as every other action here), so nothing already recorded is
  // erased — undo is still how you take back a wrong pick.
  $('lt-period').onchange = (e) => {
    const next = Number(e.target.value);
    if (!Number.isFinite(next) || next === session.period) return;
    stopClock();
    session.period = next;
    session.clock = session.periodSeconds;
    record({ type: 'period', period: next });
    pushGameState('live');
  };

  // ---- undo / redo / save ------------------------------------------------
  $('lt-undo').onclick = () => { session.cursor = undo(session.cursor); persist(); render(); queueAutoSync(); };
  $('lt-redo').onclick = () => { session.cursor = redo(session.events, session.cursor); persist(); render(); queueAutoSync(); };
  $('lt-swap-colors').onclick = () => { session.colorsSwapped = !session.colorsSwapped; persist(); render(); };

  // ---- mark not started --------------------------------------------------
  /**
   * Put the game back to not started — no score, no stats, not live — on the
   * site and in this tracker. A queued push is cancelled and one in flight is
   * waited for first, or a basket tapped a moment earlier (or the "live" it
   * set off) would land after the reset and undo it.
   */
  async function markNotStarted() {
    resetting = true;
    stopClock();
    try {
      clearTimeout(syncTimer);
      syncPending = false;
      while (syncing) await new Promise(r => setTimeout(r, 100));
      await statePush;
      const rosterIds = [...rosterOf(homeTeam), ...rosterOf(awayTeam)].map(p => p.id);
      const { clearGame } = await import('./game-reset.js');
      await clearGame({ adminFetch, gameId: game.gameId, rosterPlayerIds: rosterIds });
      lastSent = new Map();
      game.s1 = ''; game.s2 = '';
      // The database is genuinely fresh now (score nulled, status back to
      // scheduled) — reset the local session to match, or the picker and
      // clock stay wherever they were left (e.g. still showing "OT1"),
      // which reads as if the reset hadn't really worked. The period
      // length and the team colours are deliberate choices, so they — and
      // only they — survive it.
      session = { ...blank, periodSeconds: session.periodSeconds, clock: session.periodSeconds, colorsSwapped: session.colorsSwapped };
      persist();
      render();
      const sync = $('lt-sync');
      sync.className = 'lt-sync';
      sync.textContent = 'Not started';
    } finally {
      resetting = false;
    }
    if (ctx.onSaved) await ctx.onSaved();
  }

  $('lt-not-started').onclick = async () => {
    const scored = hasRecordedStats(state().players) || [game.s1, game.s2].some(v => v !== '' && v != null);
    if (!confirm(scored
      ? 'Mark this game as not started?\n\nIts score and every stat recorded for it are cleared, here and on the site. Viewers will see it as scheduled again.'
      : 'Mark this game as not started?\n\nViewers will see it as scheduled again, not live.')) return;
    $('lt-not-started').disabled = true;
    flash('Marking not started…');
    try {
      await markNotStarted();
      flash('Marked not started — viewers see it as scheduled again.');
    } catch (err) {
      flash(`Could not mark it not started: ${err.message}`);
    } finally {
      $('lt-not-started').disabled = false;
    }
  };

  $('lt-end').onclick = async () => {
    if (!confirm('End this game?\n\nViewers will see the final score and the winner instead of a running clock.')) return;
    stopClock();
    render();
    await runAutoSync();          // make sure the last baskets are in
    await pushGameState('final');
    flash('Game ended — viewers now see the final score.');
  };

  $('lt-close').onclick = () => {
    stopClock();
    persist();
    document.removeEventListener('keydown', onKeydown);
    wrap.remove();
  };

  $('lt-save').onclick = async () => {
    stopClock();
    const derived = state();
    const defs = config.DB.statDefinitions || [];
    const missing = missingStatSlugs(defs);
    const rosterIds = [...rosterOf(homeTeam), ...rosterOf(awayTeam)].map(p => p.id);
    const values = toStatValues(derived.players, defs, rosterIds);

    if (!defs.length) {
      flash('No stat columns are defined yet — add at least "points" on the Stats tab.');
      return;
    }

    // Nothing recorded (a fresh sheet, or everything undone) is a legitimate
    // thing to save: it is how you take a game back to "not played". Saving
    // empty stats alone would leave the score at 0–0, which still reads as
    // played everywhere, so clear the score too.
    if (!hasRecordedStats(derived.players)) {
      if (!confirm('Nothing is recorded for this game.\n\nMark it as not started? Its score and stats are cleared, here and on the site.')) return;
      $('lt-save').disabled = true;
      flash('Marking not started…');
      try {
        await markNotStarted();
        flash('Marked not started — viewers see it as scheduled again.');
      } catch (err) {
        flash(`Could not mark it not started: ${err.message}`);
      } finally {
        $('lt-save').disabled = false;
      }
      return;
    }

    if (!confirm('Save these stats? This replaces whatever is currently recorded for this game.')) return;

    // Anyone on the roster who never appeared is a DNP for this game.
    const appeared = new Set(Object.keys(derived.players));
    session.events.slice(0, session.cursor).forEach(e => {
      if (e.type === 'lineup') (e.playerIds || []).forEach(id => appeared.add(id));
      if (e.type === 'sub') { appeared.add(e.playerInId); appeared.add(e.playerOutId); }
    });
    const dnp = rosterIds.filter(id => !appeared.has(id));

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
