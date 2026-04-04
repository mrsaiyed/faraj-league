/**
 * Draft timer — snake draft order, 1‑minute countdown, DRAFTING NOW indicator.
 * Admin sets rounds; timer advances on expiry or when a player is dragged to the active team.
 */

import { config } from '../../js/config.js';

const TICK_MS = 1000;
const DEFAULT_TIMER_SECONDS = 60;

let tickInterval = null;
let onStateChange = null;

/** Build snake order: 0,1,2,3,4,5, 5,4,3,2,1,0, 0,1,2,... */
function buildSnakeOrder(teamCount, rounds) {
  const order = [];
  for (let r = 0; r < rounds; r++) {
    const forward = r % 2 === 0;
    for (let i = 0; i < teamCount; i++) {
      order.push(forward ? i : teamCount - 1 - i);
    }
  }
  return order;
}

function getTimerSeconds() {
  const blocks = config.DB?.contentBlocks || {};
  const val = parseInt(blocks.draft_timer_seconds, 10);
  return Number.isFinite(val) && val >= 1 ? val : DEFAULT_TIMER_SECONDS;
}

function getState() {
  const blocks = config.DB?.contentBlocks || {};
  const rounds = parseInt(blocks.draft_rounds, 10) || 7;
  const timerSeconds = getTimerSeconds();
  const currentPick = parseInt(blocks.draft_current_pick, 10) || 0;
  const running = blocks.draft_running === 'true';
  const paused = blocks.draft_paused === 'true';
  const remaining = parseInt(blocks.draft_remaining_seconds, 10);
  return { rounds, timerSeconds, currentPick, running, paused, remaining: Number.isFinite(remaining) ? remaining : timerSeconds };
}

/** Team index (0–5) for the current pick in snake order. */
export function getCurrentTeamIndex() {
  const { rounds, currentPick } = getState();
  const order = (config.DB?.draftTeamOrder?.length ? config.DB.draftTeamOrder : null)
    || (config.DB?.teams || []).slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).map(t => t.id);
  if (order.length === 0) return -1;
  const snake = buildSnakeOrder(order.length, rounds);
  if (currentPick >= snake.length) return -1;
  return snake[currentPick];
}

/** Team ID for the current pick. Falls back to teams by sort_order if draftTeamOrder is empty. */
export function getCurrentTeamId() {
  const idx = getCurrentTeamIndex();
  const order = (config.DB?.draftTeamOrder?.length ? config.DB.draftTeamOrder : null)
    || (config.DB?.teams || []).slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).map(t => t.id);
  return idx >= 0 ? (order[idx] ?? null) : null;
}

/** Total picks in the draft. */
export function getTotalPicks() {
  const { rounds } = getState();
  const order = (config.DB?.draftTeamOrder?.length ? config.DB.draftTeamOrder : null)
    || (config.DB?.teams || []).slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).map(t => t.id);
  return order.length * rounds;
}

export function isDraftRunning() {
  return getState().running;
}

export function isDraftPaused() {
  return getState().paused;
}

export function getTimeRemaining() {
  return getState().remaining;
}

export function getRounds() {
  return getState().rounds;
}

export function isDraftComplete() {
  const { currentPick } = getState();
  return currentPick >= getTotalPicks();
}

/** Format seconds as M:SS */
export function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function notifyChange() {
  if (typeof onStateChange === 'function') onStateChange();
}

export function setOnStateChange(fn) {
  onStateChange = fn;
}

function stopTick() {
  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
  }
}

async function saveState(state, adminFetch) {
  if (!adminFetch || !window.adminSeasonId) return;
  const seasonId = window.adminSeasonId;
  const items = [
    { key: 'draft_rounds', value: String(state.rounds), season_id: seasonId },
    { key: 'draft_timer_seconds', value: String(state.timerSeconds ?? getTimerSeconds()), season_id: seasonId },
    { key: 'draft_current_pick', value: String(state.currentPick), season_id: seasonId },
    { key: 'draft_running', value: state.running ? 'true' : 'false', season_id: seasonId },
    { key: 'draft_paused', value: state.paused ? 'true' : 'false', season_id: seasonId },
    { key: 'draft_remaining_seconds', value: String(state.remaining), season_id: seasonId },
  ];
  try {
    await adminFetch('admin-content', {
      method: 'POST',
      body: JSON.stringify(items),
    });
    if (config.DB?.contentBlocks) {
      items.forEach(({ key, value }) => { config.DB.contentBlocks[key] = value; });
    }
  } catch (e) {
    console.error('Draft state save failed:', e);
    throw e;
  }
}

/**
 * Advance to next pick: reset timer, move DRAFTING NOW to next team.
 * @param {Function} adminFetch
 * @param {{ fromPlayerDrop?: boolean }} [opts] - When true: always advance, never use atLastPick (avoids premature end)
 */
export async function advancePick(adminFetch, opts = {}) {
  const state = getState();
  const total = getTotalPicks();
  const fromPlayerDrop = opts.fromPlayerDrop === true;

  if (fromPlayerDrop) {
    state.currentPick += 1;
    state.remaining = getTimerSeconds();
    state.running = true;
    state.paused = false;
    const willEnd = total > 0 && state.currentPick >= total;
    if (willEnd) {
      state.running = false;
      stopTick();
    }
  } else {
    const atLastPick = total > 0 && state.currentPick >= total - 1;
    if (atLastPick) {
      state.running = false;
      state.paused = false;
      state.currentPick = total;
      stopTick();
    } else {
      state.currentPick += 1;
      state.remaining = getTimerSeconds();
      state.running = true;
      state.paused = false;
    }
  }
  await saveState(state, adminFetch);
  notifyChange();
}

/**
 * Advance from player drop: stop tick, advance pick (using player-drop path), restart tick if still running.
 */
export async function advancePickFromPlayerDrop(adminFetch) {
  stopTick();
  await advancePick(adminFetch, { fromPlayerDrop: true });
  if (getState().running && !getState().paused) {
    startTick(adminFetch);
  }
}

/**
 * Move draft position back one pick (manual admin control).
 */
export async function goBackPick(adminFetch) {
  const state = getState();
  if (state.currentPick <= 0) return;
  state.currentPick -= 1;
  state.remaining = getTimerSeconds();
  if (!state.running && !state.paused) {
    state.running = true;
    state.paused = false;
    startTick(adminFetch);
  }
  await saveState(state, adminFetch);
  notifyChange();
}

/**
 * Advance draft position one pick (manual admin control). Resets timer, does not end draft at last pick.
 */
export async function advancePickManual(adminFetch) {
  stopTick();
  await advancePick(adminFetch, { fromPlayerDrop: true });
  if (getState().running && !getState().paused) {
    startTick(adminFetch);
  }
}

/**
 * Start the draft from pick 0 (always resets to the first team on the left).
 * Use Resume (from Pause) to continue mid-draft.
 */
export async function startDraft(adminFetch) {
  const state = getState();
  state.running = true;
  state.paused = false;
  state.currentPick = 0;
  state.remaining = getTimerSeconds();
  stopTick();
  await saveState(state, adminFetch);
  notifyChange();
  startTick(adminFetch);
}

/**
 * Pause the draft. Stops the timer, stores remaining seconds.
 */
export async function pauseDraft(adminFetch) {
  const state = getState();
  state.paused = true;
  state.running = false;
  stopTick();
  await saveState(state, adminFetch);
  notifyChange();
}

/**
 * End the draft entirely. Stops the timer, clears DRAFTING NOW, and resets
 * to pick 0 so the next Start Draft begins from the first team.
 */
export async function endDraft(adminFetch) {
  const state = getState();
  state.running = false;
  state.paused = false;
  state.currentPick = 0;
  state.remaining = getTimerSeconds();
  stopTick();
  await saveState(state, adminFetch);
  notifyChange();
}

/**
 * Resume the draft from paused state.
 */
export async function resumeDraft(adminFetch) {
  const state = getState();
  state.running = true;
  state.paused = false;
  if (state.remaining <= 0) state.remaining = getTimerSeconds();
  stopTick();
  await saveState(state, adminFetch);
  notifyChange();
  startTick(adminFetch);
}

function startTick(adminFetch) {
  stopTick();
  tickInterval = setInterval(async () => {
    const state = getState();
    if (!state.running || state.paused) {
      stopTick();
      return;
    }
    state.remaining = Math.max(0, state.remaining - 1);
    if (config.DB?.contentBlocks) {
      config.DB.contentBlocks.draft_remaining_seconds = String(state.remaining);
    }
    notifyChange();
    if (state.remaining <= 0) {
      stopTick();
      await advancePick(adminFetch);
      if (getState().running && !getState().paused) {
        startTick(adminFetch);
      }
    }
  }, TICK_MS);
}

/**
 * Set number of rounds and persist.
 */
export async function setRounds(rounds, adminFetch) {
  const state = getState();
  state.rounds = Math.max(1, Math.min(20, parseInt(rounds, 10) || 7));
  await saveState(state, adminFetch);
  notifyChange();
}

/**
 * Set timer length in seconds and persist.
 */
export async function setTimerSeconds(seconds, adminFetch) {
  const state = getState();
  state.timerSeconds = Math.max(1, Math.min(300, parseInt(seconds, 10) || 60));
  await saveState(state, adminFetch);
  notifyChange();
}

/**
 * Initialize draft timer UI and tick when draft is running.
 * Call from initAdminOverlays.
 */
export function initDraftTimer(adminFetch) {
  const state = getState();
  if (state.running && !state.paused) {
    startTick(adminFetch);
  } else {
    stopTick();
  }
}

/**
 * Update draft UI: timer, DRAFTING NOW, buttons, rounds dropdown.
 * Call on init and on state change.
 */
export function updateDraftUI(adminMode = false) {
  const timerEl = document.getElementById('draft-timer');
  const timerWrap = document.getElementById('draft-timer-wrap');
  const adminControls = document.getElementById('draft-admin-controls');
  const startBtn = document.getElementById('draft-start-btn');
  const pauseBtn = document.getElementById('draft-pause-btn');
  const roundsSelect = document.getElementById('draft-rounds-select');

  const state = getState();
  const running = state.running && !state.paused;
  const complete = isDraftComplete();

  if (timerEl) timerEl.textContent = formatTime(state.remaining);
  if (timerWrap) timerWrap.style.display = running ? 'flex' : 'none';
  if (adminControls) adminControls.style.display = adminMode ? 'flex' : 'none';

  if (pauseBtn) {
    pauseBtn.textContent = state.paused ? 'Resume Draft' : 'Pause Draft';
    pauseBtn.disabled = !state.running && !state.paused;
  }
  if (startBtn) startBtn.disabled = running || complete;

  const prevBtn = document.getElementById('draft-prev-btn');
  const nextBtn = document.getElementById('draft-next-btn');
  const total = getTotalPicks();
  if (prevBtn) prevBtn.disabled = state.currentPick <= 0;
  if (nextBtn) nextBtn.disabled = state.currentPick >= total;

  const currentTeamId = getCurrentTeamId();
  document.querySelectorAll('.draft-drafting-now').forEach((el) => {
    el.style.display = el.dataset.teamId === currentTeamId && running ? 'block' : 'none';
  });
}

/**
 * Initialize draft controls: rounds dropdown, button handlers.
 * Call from initAdminOverlays when on draft page.
 */
const TIMER_OPTIONS = [
  { value: 1, label: '1 sec' },
  { value: 5, label: '5 sec' },
  { value: 10, label: '10 sec' },
  { value: 30, label: '30 sec' },
  { value: 45, label: '45 sec' },
  { value: 60, label: '1 min' },
  { value: 90, label: '1.5 min' },
  { value: 120, label: '2 min' },
  { value: 180, label: '3 min' },
  { value: 300, label: '5 min' },
];

export function initDraftTimerUI(adminFetch) {
  const roundsSelect = document.getElementById('draft-rounds-select');
  const timerSelect = document.getElementById('draft-timer-select');
  const startBtn = document.getElementById('draft-start-btn');
  const pauseBtn = document.getElementById('draft-pause-btn');
  const teamCount = (config.DB?.draftTeamOrder || config.DB?.teams || []).length;

  if (roundsSelect && teamCount > 0) {
    const current = getRounds();
    roundsSelect.innerHTML = '';
    for (let r = 1; r <= 20; r++) {
      const opt = document.createElement('option');
      opt.value = r;
      opt.textContent = r;
      if (r === current) opt.selected = true;
      roundsSelect.appendChild(opt);
    }
    roundsSelect.onchange = () => setRounds(roundsSelect.value, adminFetch).then(() => updateDraftUI(true));
  }

  if (timerSelect) {
    const current = getTimerSeconds();
    const values = [...new Set([...TIMER_OPTIONS.map((o) => o.value), current])].sort((a, b) => a - b);
    timerSelect.innerHTML = '';
    values.forEach((value) => {
      const found = TIMER_OPTIONS.find((o) => o.value === value);
      const label = found ? found.label : value >= 60 ? `${value / 60} min` : `${value} sec`;
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = label;
      if (value === current) opt.selected = true;
      timerSelect.appendChild(opt);
    });
    timerSelect.onchange = () => setTimerSeconds(timerSelect.value, adminFetch).then(() => updateDraftUI(true));
  }

  if (startBtn && !startBtn.dataset.draftInit) {
    startBtn.dataset.draftInit = '1';
    startBtn.onclick = () => startDraft(adminFetch).then(() => updateDraftUI(true));
  }
  if (pauseBtn && !pauseBtn.dataset.draftInit) {
    pauseBtn.dataset.draftInit = '1';
    pauseBtn.onclick = () => {
      if (getState().paused) resumeDraft(adminFetch).then(() => updateDraftUI(true));
      else pauseDraft(adminFetch).then(() => updateDraftUI(true));
    };
  }
  const endBtn = document.getElementById('draft-end-btn');
  if (endBtn && !endBtn.dataset.draftInit) {
    endBtn.dataset.draftInit = '1';
    endBtn.onclick = () => endDraft(adminFetch).then(() => updateDraftUI(true));
  }

  const prevBtn = document.getElementById('draft-prev-btn');
  const nextBtn = document.getElementById('draft-next-btn');
  if (prevBtn && !prevBtn.dataset.draftInit) {
    prevBtn.dataset.draftInit = '1';
    prevBtn.onclick = () => goBackPick(adminFetch).then(() => updateDraftUI(true));
  }
  if (nextBtn && !nextBtn.dataset.draftInit) {
    nextBtn.dataset.draftInit = '1';
    nextBtn.onclick = () => advancePickManual(adminFetch).then(() => updateDraftUI(true));
  }

  setOnStateChange(() => updateDraftUI(true));
  updateDraftUI(true);
}
