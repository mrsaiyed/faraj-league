/**
 * The admin's auction game — pure, no DOM.
 *
 * Players are drawn at random from everyone who has played (both seasons
 * combined) and put up one at a time with their numbers but not their name.
 * Bidders take turns opening: the opener's bid starts at $1, anyone may raise,
 * and the admin sells the player to the highest bid, which reveals the name.
 * A bidder must keep $1 for every other open spot on their team, so nobody is
 * ever left unable to open. It ends once every team is full.
 *
 * The state is plain data (saved as JSON so a refresh resumes the game); every
 * step returns a new state rather than changing the one given.
 */

export const DEFAULT_BUDGET = 20;

/** Points per game over every game played. */
export function ppg(player) {
  return player?.games > 0 ? player.points / player.games : 0;
}

/** A shuffled copy (Fisher-Yates); `random` is replaceable for tests. */
export function shuffle(list, random = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Why a game cannot start with these settings, in words; null when it can. */
export function setupProblem({ bidders, perTeam, budget, available }) {
  if (!Number.isInteger(bidders) || bidders < 2) return 'At least 2 people need to be bidding.';
  if (!Number.isInteger(perTeam) || perTeam < 1) return 'Each team needs at least 1 player.';
  if (!Number.isInteger(budget) || budget < perTeam) return `The budget must be at least $${perTeam}, $1 for each player on a team.`;
  if (bidders * perTeam > available) return `That needs ${bidders * perTeam} players, and only ${available} have played.`;
  return null;
}

const openSpots = (state, i) => state.perTeam - state.bidders[i].team.length;

/** The most bidder `i` can bid: their budget less $1 for each other open spot; 0 once their team is full. */
export function maxBid(state, i) {
  const open = openSpots(state, i);
  return open > 0 ? state.bidders[i].budget - (open - 1) : 0;
}

/** The index of the bidder holding the high bid, or -1. */
export function highBidder(state) {
  let best = -1;
  state.bids.forEach((b, i) => { if (b > 0 && (best < 0 || b > state.bids[best])) best = i; });
  return best;
}

export function highBid(state) {
  const i = highBidder(state);
  return i < 0 ? 0 : state.bids[i];
}

function openLot(state, opener) {
  return { ...state, opener, bids: state.bidders.map((_, i) => (i === opener ? 1 : 0)), phase: 'bidding', sold: null };
}

/**
 * A new game: `names.length` bidders, `perTeam` players each, `budget` dollars each,
 * the players drawn at random from `players` ({ id, name, games, points, wins, losses }).
 */
export function newGame({ names, perTeam, budget = DEFAULT_BUDGET, players, random = Math.random }) {
  const pool = shuffle(players, random).slice(0, names.length * perTeam);
  return openLot({
    perTeam,
    budget,
    pool,
    lot: 0,
    bidders: names.map(name => ({ name, budget, team: [] })),
  }, 0);
}

/** Why bidder `i` cannot bid `amount` now, in words; null when they can. */
export function bidProblem(state, i, amount) {
  const name = state.bidders[i]?.name || 'That bidder';
  if (state.phase !== 'bidding') return 'Bidding on this player is closed.';
  if (openSpots(state, i) <= 0) return `${name}'s team is full.`;
  if (!Number.isInteger(amount) || amount < 1) return 'Bids are whole dollars.';
  if (highBidder(state) === i) return `${name} already has the high bid.`;
  if (amount <= highBid(state)) return `The bid has to beat $${highBid(state)}.`;
  const max = maxBid(state, i);
  if (amount > max) return `${name} can bid at most $${max}: they need $1 for each other open spot.`;
  return null;
}

/** @returns {{ state: object, error?: string }} the state unchanged, with the reason, when the bid is refused */
export function placeBid(state, i, amount) {
  const error = bidProblem(state, i, amount);
  if (error) return { state, error };
  const bids = [...state.bids];
  bids[i] = amount;
  return { state: { ...state, bids } };
}

/** Bidder `i` goes $1 over the high bid. */
export function raise(state, i) {
  return placeBid(state, i, highBid(state) + 1);
}

/** Back to the opener's $1, for a bid entered by mistake. */
export function resetBids(state) {
  return state.phase === 'bidding' ? openLot(state, state.opener) : state;
}

/** The player goes to the high bidder for their bid. */
export function purchase(state) {
  if (state.phase !== 'bidding') return state;
  const winner = highBidder(state);
  if (winner < 0) return state;
  const price = state.bids[winner];
  const player = state.pool[state.lot];
  const bidders = state.bidders.map((b, i) =>
    (i === winner ? { ...b, budget: b.budget - price, team: [...b.team, { ...player, price }] } : b));
  return { ...state, bidders, phase: 'sold', sold: { bidder: winner, price, player } };
}

/** On to the next player, opened by the next bidder whose team is not full; or the end. */
export function nextLot(state) {
  if (state.phase !== 'sold') return state;
  const lot = state.lot + 1;
  if (lot >= state.pool.length) return { ...state, lot, sold: null, phase: 'over' };
  const n = state.bidders.length;
  let opener = state.opener;
  for (let k = 1; k <= n; k++) {
    const c = (state.opener + k) % n;
    if (openSpots(state, c) > 0) { opener = c; break; }
  }
  return openLot({ ...state, lot }, opener);
}

/** Each team for the end screen: its players best PPG first, its total PPG and what it spent. */
export function finalTeams(state) {
  return state.bidders.map(b => ({
    name: b.name,
    players: [...b.team].sort((x, y) => ppg(y) - ppg(x) || x.name.localeCompare(y.name)),
    totalPpg: b.team.reduce((sum, p) => sum + ppg(p), 0),
    spent: state.budget - b.budget,
  }));
}
