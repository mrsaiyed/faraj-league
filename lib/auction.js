/**
 * The admin's auction game — pure, no DOM.
 *
 * Players are drawn at random from everyone who has played (both seasons
 * combined) and put up one at a time with their numbers but not their name.
 * Bidders take turns opening: the opener's bid starts at $1, anyone may raise
 * (up to all the money they have left), and the admin sells the player to the
 * highest bid, which reveals the name. It ends once every team is full.
 *
 * Ties go to the opener: whoever's turn it is may match the high bid to take
 * it (putting in all they have against a bid of the same), while everyone else
 * has to beat it. So a bid is never matched back and forth.
 *
 * A bidder can spend down to $0, and then cannot bid. While someone is at $0
 * nobody has to open, and a player nobody bids on goes to them for nothing
 * (`freeTaker()`): so whoever still has money chooses whom to take and whom to
 * leave. Once everyone is at $0 the players go out one each, in turn.
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
  if (!Number.isInteger(budget) || budget < 1) return 'The budget must be at least $1.';
  if (bidders * perTeam > available) return `That needs ${bidders * perTeam} players, and only ${available} have played.`;
  return null;
}

const openSpots = (state, i) => state.perTeam - state.bidders[i].team.length;

/** The most bidder `i` can bid: all the money they have left; 0 once their team is full. */
export function maxBid(state, i) {
  return openSpots(state, i) > 0 ? state.bidders[i].budget : 0;
}

/**
 * Who gets the player if nobody bids: the first bidder out of money with a spot
 * open, counting round from the opener. -1 when nobody is out of money, which
 * is when the opener has to bid.
 */
export function freeTaker(state) {
  const n = state.bidders.length;
  for (let k = 0; k < n; k++) {
    const i = (state.opener + k) % n;
    if (openSpots(state, i) > 0 && state.bidders[i].budget <= 0) return i;
  }
  return -1;
}

/** The index of the bidder holding the high bid, or -1. The opener wins a tie. */
export function highBidder(state) {
  let best = -1;
  state.bids.forEach((b, i) => {
    if (b <= 0) return;
    if (best < 0 || b > state.bids[best] || (b === state.bids[best] && i === state.opener)) best = i;
  });
  return best;
}

export function highBid(state) {
  const i = highBidder(state);
  return i < 0 ? 0 : state.bids[i];
}

/** The least bidder `i` can bid to take the lead: the high bid itself for the opener, $1 more for anyone else. */
export function minBid(state, i) {
  return Math.max(1, i === state.opener ? highBid(state) : highBid(state) + 1);
}

/** The opener starts at $1, unless someone is out of money: then nobody has to bid. */
function openLot(state, opener) {
  const lot = { ...state, opener, phase: 'bidding', sold: null };
  const forced = freeTaker(lot) < 0;
  return { ...lot, bids: state.bidders.map((_, i) => (forced && i === opener ? 1 : 0)) };
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
  if (state.bidders[i].budget <= 0) return `${name} is out of money.`;
  if (!Number.isInteger(amount) || amount < 1) return 'Bids are whole dollars.';
  if (highBidder(state) === i) return `${name} already has the high bid.`;
  if (amount < minBid(state, i)) {
    if (i === state.opener) return `The bid has to be at least $${highBid(state)}.`;
    const opener = state.bidders[state.opener]?.name || 'The opener';
    return amount === highBid(state)
      ? `Ties go to ${opener}, whose turn it is: the bid has to beat $${highBid(state)}.`
      : `The bid has to beat $${highBid(state)}.`;
  }
  if (amount > maxBid(state, i)) return `${name} only has $${state.bidders[i].budget} left.`;
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

/** Bidder `i` takes the lead for as little as they can: $1 over the high bid, or the opener matching it. */
export function raise(state, i) {
  return placeBid(state, i, minBid(state, i));
}

/** Back to how the player was opened, for a bid entered by mistake. */
export function resetBids(state) {
  return state.phase === 'bidding' ? openLot(state, state.opener) : state;
}

/** The player goes to the high bidder for their bid, or with no bids to `freeTaker()` for $0. */
export function purchase(state) {
  if (state.phase !== 'bidding') return state;
  const bidder = highBidder(state);
  const winner = bidder >= 0 ? bidder : freeTaker(state);
  if (winner < 0) return state;
  const price = bidder >= 0 ? state.bids[winner] : 0;
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
