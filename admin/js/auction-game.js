/**
 * The admin's Game tab: an auction for teams of league players, run by one
 * person on one screen (`lib/auction.js` has the rules).
 *
 * Setup asks how many are bidding, how many players each team gets and the
 * budget. Each player then comes up with his numbers (PPG, games, points,
 * record, both seasons combined) but no name; the bidders' panels sit round
 * him, the admin taps their bids in, and Sold gives him to the high bid and
 * shows who he was. Once every team is full the teams are shown side by side,
 * best PPG first.
 *
 * The game is kept in this device's localStorage, so a refresh or a locked
 * phone picks up where it was.
 */

import {
  DEFAULT_BUDGET, ppg, setupProblem, newGame, maxBid, minBid, freeTaker, highBidder, highBid,
  placeBid, raise, resetBids, purchase, nextLot, finalTeams,
} from '../../lib/auction.js';

const STORAGE_KEY = 'faraj_auction_game';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ppgText = (p) => ppg(p).toFixed(1);

function loadGame() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return s && Array.isArray(s.bidders) && Array.isArray(s.pool) ? s : null;
  } catch (_) { return null; }
}

function saveGame(state) {
  try {
    if (state) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    else localStorage.removeItem(STORAGE_KEY);
  } catch (_) { /* a private window: the game still runs, it just won't survive a refresh */ }
}

/** Everyone who has played, with his totals over both seasons (the `player_career_stats` view). */
async function loadPlayers(supabase) {
  const { data, error } = await supabase
    .from('player_career_stats')
    .select('person_id,name,games,wins,losses,points')
    .eq('stage', 'all')
    .gt('games', 0);
  if (error) throw new Error(error.message || 'Could not load the players.');
  return (data || []).map(r => ({ id: r.person_id, name: r.name, games: r.games, points: r.points, wins: r.wins, losses: r.losses }));
}

export async function renderAuctionGame(content, { supabase }) {
  if (!content) return;
  let state = loadGame();
  let players = null;
  let message = '';
  let names = ['Player 1', 'Player 2'];

  const setState = (next, error = '') => {
    state = next;
    message = error;
    saveGame(state);
    render();
  };

  function render() {
    if (!state) renderSetup();
    else if (state.phase === 'over') renderEnd();
    else renderBoard();
  }

  // ---- Setup -------------------------------------------------------------

  async function renderSetup() {
    content.innerHTML = '<p class="loading">Loading players...</p>';
    if (!players) {
      try { players = await loadPlayers(supabase); }
      catch (err) { content.innerHTML = `<p class="ag-error">${esc(err.message)}</p>`; return; }
    }
    content.innerHTML = `
      <div class="ag-setup">
        <p class="ag-intro">Each player comes up with his numbers from both seasons but not his name. Bid on him, and whoever wins finds out who he is. Players are drawn at random from the ${players.length} who have played.</p>
        <div class="ag-setup-grid">
          <label class="ag-field"><span>People bidding</span><input type="number" id="ag-bidders" min="2" max="12" value="${names.length}" inputmode="numeric"></label>
          <label class="ag-field"><span>Players per team</span><input type="number" id="ag-per-team" min="1" value="6" inputmode="numeric"></label>
          <label class="ag-field"><span>Budget ($)</span><input type="number" id="ag-budget" min="1" value="${DEFAULT_BUDGET}" inputmode="numeric"></label>
        </div>
        <div class="ag-names" id="ag-names"></div>
        <p class="ag-summary" id="ag-summary"></p>
        <button type="button" class="ag-btn ag-btn-primary" id="ag-start">Start game</button>
      </div>`;

    const biddersEl = content.querySelector('#ag-bidders');
    const perTeamEl = content.querySelector('#ag-per-team');
    const budgetEl = content.querySelector('#ag-budget');
    const namesEl = content.querySelector('#ag-names');
    const summaryEl = content.querySelector('#ag-summary');
    const startBtn = content.querySelector('#ag-start');
    const num = (el) => (el.value.trim() === '' ? NaN : Number(el.value));
    const settings = () => ({ bidders: num(biddersEl), perTeam: num(perTeamEl), budget: num(budgetEl), available: players.length });

    const drawNames = () => {
      const n = Math.max(0, Math.min(12, Math.floor(num(biddersEl)) || 0));
      while (names.length < n) names.push(`Player ${names.length + 1}`);
      namesEl.innerHTML = Array.from({ length: n }, (_, i) =>
        `<label class="ag-field"><span>Bidder ${i + 1}</span><input type="text" class="ag-name-input" data-i="${i}" value="${esc(names[i])}" maxlength="24"></label>`).join('');
    };
    const update = () => {
      const s = settings();
      const problem = setupProblem(s);
      summaryEl.textContent = problem || `${s.bidders * s.perTeam} players, ${s.perTeam} per team, $${s.budget} each.`;
      summaryEl.classList.toggle('ag-error', Boolean(problem));
      startBtn.disabled = Boolean(problem);
    };

    biddersEl.addEventListener('input', () => { drawNames(); update(); });
    perTeamEl.addEventListener('input', update);
    budgetEl.addEventListener('input', update);
    namesEl.addEventListener('input', (e) => {
      const i = Number(e.target.dataset.i);
      if (Number.isInteger(i)) names[i] = e.target.value;
    });
    startBtn.addEventListener('click', () => {
      const s = settings();
      if (setupProblem(s)) return;
      const chosen = names.slice(0, s.bidders).map((n, i) => n.trim() || `Player ${i + 1}`);
      setState(newGame({ names: chosen, perTeam: s.perTeam, budget: s.budget, players }));
    });
    drawNames();
    update();
  }

  // ---- The board ---------------------------------------------------------

  function panelHtml(b, i) {
    const bidding = state.phase === 'bidding';
    const full = b.team.length >= state.perTeam;
    const broke = !full && b.budget <= 0;
    const isHigh = bidding && highBidder(state) === i;
    const max = maxBid(state, i);
    // The opener wins ties, so their quick bid matches the high bid; anyone else's goes $1 over it.
    const next = minBid(state, i);
    const quick = isHigh ? 'High bid' : state.bids.some(b => b > 0) && next === highBid(state) ? `Match $${next}` : `+1 → $${next}`;
    const canRaise = bidding && !full && !isHigh && next <= max;
    const bid = bidding ? state.bids[i] : 0;
    const cls = ['ag-panel', bidding && state.opener === i ? 'is-turn' : '', isHigh ? 'is-high' : '', full || broke ? 'is-full' : ''].filter(Boolean).join(' ');
    // Side by side on a wide screen: bidders down the left and right, the player between them.
    const col = i % 2 === 0 ? 1 : 3;
    const row = Math.floor(i / 2) + 1;
    return `<section class="${cls}" style="--ag-col:${col};--ag-row:${row}">
      <header class="ag-panel-head">
        <span class="ag-panel-name">${esc(b.name)}</span>
        ${bidding && state.opener === i ? '<span class="ag-badge">Opens</span>' : ''}
        ${full ? '<span class="ag-badge ag-badge-full">Full</span>' : ''}
        ${broke ? '<span class="ag-badge ag-badge-full">Out of money</span>' : ''}
      </header>
      <div class="ag-money"><span class="ag-left">$${b.budget}</span> left</div>
      <div class="ag-bid${isHigh ? ' ag-bid-high' : ''}">${bid ? `$${bid}` : '—'}</div>
      ${bidding && !full && !broke ? `
      <div class="ag-controls">
        <button type="button" class="ag-btn ag-btn-raise" data-raise="${i}" ${canRaise ? '' : 'disabled'}>${quick}</button>
        <input type="number" class="ag-amount" data-amount="${i}" min="${next}" max="${max}" placeholder="$" inputmode="numeric" aria-label="${esc(b.name)}'s bid">
        <button type="button" class="ag-btn" data-bid="${i}">Bid</button>
      </div>` : ''}
      <ol class="ag-team">
        ${b.team.map(p => `<li><span class="ag-team-name">${esc(p.name)}</span><span class="ag-team-meta">${ppgText(p)} · $${p.price}</span></li>`).join('')}
        ${Array.from({ length: state.perTeam - b.team.length }, () => '<li class="ag-team-empty">—</li>').join('')}
      </ol>
    </section>`;
  }

  function lotHtml() {
    const count = `<div class="ag-lot-count">Player ${state.lot + 1} of ${state.pool.length}</div>`;
    const p = state.phase === 'sold' ? state.sold.player : state.pool[state.lot];
    const stats = `<dl class="ag-stats">
        <div><dt>Games</dt><dd>${p.games}</dd></div>
        <div><dt>Points</dt><dd>${p.points}</dd></div>
        <div><dt>Record</dt><dd>${p.wins}-${p.losses}</dd></div>
      </dl>`;
    const rows = Math.ceil(state.bidders.length / 2);
    const place = `style="--ag-rows:${rows}"`;
    if (state.phase === 'sold') {
      const winner = state.bidders[state.sold.bidder];
      const last = state.lot + 1 >= state.pool.length;
      return `<div class="ag-lot is-sold" ${place}>
        ${count}
        <div class="ag-reveal">${esc(p.name)}</div>
        <div class="ag-ppg">${ppgText(p)} <small>PPG</small></div>
        ${stats}
        <div class="ag-sold-to">Sold to <strong>${esc(winner.name)}</strong> for $${state.sold.price}</div>
        <button type="button" class="ag-btn ag-btn-primary" data-next>${last ? 'See the teams' : 'Next player'}</button>
      </div>`;
    }
    // With no bids the player goes for nothing to whoever is out of money (freeTaker).
    const hi = highBidder(state);
    const taker = hi >= 0 ? hi : freeTaker(state);
    const takerName = taker >= 0 ? esc(state.bidders[taker].name) : '';
    const high = hi >= 0
      ? `High bid <strong>$${state.bids[hi]}</strong> · ${takerName}`
      : `No bids · goes to <strong>${takerName}</strong> for $0 if nobody bids`;
    const sell = hi >= 0 ? `Sold to ${takerName} for $${state.bids[hi]}` : `Give to ${takerName} for $0`;
    return `<div class="ag-lot" ${place}>
      ${count}
      <div class="ag-mystery" aria-label="Name hidden">?</div>
      <div class="ag-ppg">${ppgText(p)} <small>PPG</small></div>
      ${stats}
      <div class="ag-high">${high}</div>
      <button type="button" class="ag-btn ag-btn-primary" data-purchase ${taker >= 0 ? '' : 'disabled'}>${sell}</button>
      <button type="button" class="ag-btn ag-btn-quiet" data-reset>Reset bids</button>
      <p class="ag-msg${message ? ' ag-error' : ''}" role="status">${esc(message)}</p>
    </div>`;
  }

  function renderBoard() {
    content.innerHTML = `
      <div class="ag-bar">
        <span>${state.bidders.length} bidders · ${state.perTeam} per team · $${state.budget} each</span>
        <button type="button" class="ag-btn ag-btn-quiet" data-quit>End game</button>
      </div>
      <div class="ag-board">
        ${state.bidders.map(panelHtml).join('')}
        ${lotHtml()}
      </div>`;
  }

  // ---- The end -----------------------------------------------------------

  function renderEnd() {
    const teams = finalTeams(state);
    const best = Math.max(...teams.map(t => t.totalPpg));
    content.innerHTML = `
      <div class="ag-end">
        <h3 class="ag-end-title">Final teams</h3>
        <div class="ag-final" style="--ag-teams:${teams.length}">
          ${teams.map(t => `
          <section class="ag-final-team${t.totalPpg === best ? ' is-best' : ''}">
            <h4>${esc(t.name)}</h4>
            <ol>
              ${t.players.map(p => `<li><span class="ag-team-name">${esc(p.name)}</span><span class="ag-final-ppg">${ppgText(p)}</span></li>`).join('')}
            </ol>
            <footer><strong>${t.totalPpg.toFixed(1)}</strong> PPG combined · spent $${t.spent} of $${state.budget}</footer>
          </section>`).join('')}
        </div>
        <button type="button" class="ag-btn ag-btn-primary" data-new>New game</button>
      </div>`;
  }

  // ---- Taps --------------------------------------------------------------

  const bidFrom = (i) => {
    const input = content.querySelector(`.ag-amount[data-amount="${i}"]`);
    const amount = input && input.value.trim() !== '' ? Number(input.value) : NaN;
    const result = placeBid(state, i, amount);
    setState(result.state, result.error || '');
  };

  content.onclick = (e) => {
    const t = e.target.closest('button');
    if (!t || !state) return;
    if (t.dataset.raise != null) { const r = raise(state, Number(t.dataset.raise)); setState(r.state, r.error || ''); }
    else if (t.dataset.bid != null) bidFrom(Number(t.dataset.bid));
    else if (t.hasAttribute('data-purchase')) setState(purchase(state));
    else if (t.hasAttribute('data-next')) setState(nextLot(state));
    else if (t.hasAttribute('data-reset')) setState(resetBids(state));
    else if (t.hasAttribute('data-new')) setState(null);
    else if (t.hasAttribute('data-quit') && confirm('End this game? The teams so far will be lost.')) setState(null);
  };
  content.onkeydown = (e) => {
    if (e.key === 'Enter' && e.target.matches?.('.ag-amount')) bidFrom(Number(e.target.dataset.amount));
  };

  render();
}
