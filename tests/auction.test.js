/**
 * Unit tests for the admin's auction game (lib/auction.js)
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_BUDGET, ppg, shuffle, setupProblem, newGame, maxBid, highBidder, highBid,
  bidProblem, placeBid, raise, resetBids, purchase, nextLot, finalTeams,
} from '../lib/auction.js';

const player = (n, points, games = 4) => ({ id: `p${n}`, name: `Player ${n}`, games, points, wins: 2, losses: games - 2 });
const PLAYERS = Array.from({ length: 20 }, (_, i) => player(i + 1, (i + 1) * 4));
const noShuffle = () => 0.999999; // Fisher-Yates with j = i keeps the order

const game = (opts = {}) => newGame({ names: ['Ali', 'Sami'], perTeam: 3, budget: 10, players: PLAYERS, random: noShuffle, ...opts });

/** Run a whole lot: optional raises, then sell and move on. */
function sell(state, raises = []) {
  let s = state;
  raises.forEach(([i, amount]) => { s = placeBid(s, i, amount).state; });
  return nextLot(purchase(s));
}

describe('setup', () => {
  it('defaults the budget to $20', () => {
    expect(DEFAULT_BUDGET).toBe(20);
    expect(newGame({ names: ['A', 'B'], perTeam: 1, players: PLAYERS }).bidders[0].budget).toBe(20);
  });

  it('refuses settings that cannot make a game', () => {
    expect(setupProblem({ bidders: 1, perTeam: 6, budget: 20, available: 56 })).toMatch(/at least 2/i);
    expect(setupProblem({ bidders: 2, perTeam: 0, budget: 20, available: 56 })).toMatch(/at least 1 player/i);
    expect(setupProblem({ bidders: 2, perTeam: 6, budget: 5, available: 56 })).toMatch(/at least \$6/);
    expect(setupProblem({ bidders: 10, perTeam: 6, budget: 20, available: 56 })).toMatch(/60 players.*56/);
    expect(setupProblem({ bidders: 2, perTeam: 6, budget: 20, available: 56 })).toBeNull();
  });

  it('draws bidders × per-team players, all different, at random', () => {
    const g = newGame({ names: ['A', 'B'], perTeam: 6, budget: 20, players: PLAYERS });
    expect(g.pool).toHaveLength(12);
    expect(new Set(g.pool.map(p => p.id)).size).toBe(12);
    expect(shuffle([1, 2, 3, 4], () => 0)).toEqual([2, 3, 4, 1]);
  });

  it('starts with the first bidder opening at $1', () => {
    const g = game();
    expect(g.phase).toBe('bidding');
    expect(g.opener).toBe(0);
    expect(g.bids).toEqual([1, 0]);
    expect(highBidder(g)).toBe(0);
  });
});

describe('bidding', () => {
  it('a raise goes $1 over the high bid', () => {
    const { state } = raise(game(), 1);
    expect(state.bids).toEqual([1, 2]);
    expect(highBidder(state)).toBe(1);
    expect(highBid(state)).toBe(2);
  });

  it('a typed bid has to beat the high bid', () => {
    const g = placeBid(game(), 1, 4).state;
    expect(placeBid(g, 0, 4).error).toMatch(/beat \$4/);
    expect(placeBid(g, 0, 5).state.bids).toEqual([5, 4]);
  });

  it('the high bidder cannot bid against themselves', () => {
    expect(bidProblem(game(), 0, 3)).toMatch(/already has the high bid/);
  });

  it('keeps $1 back for every other open spot', () => {
    const g = game(); // $10, 3 spots: at most $8 on the first player
    expect(maxBid(g, 1)).toBe(8);
    expect(placeBid(g, 1, 9).error).toMatch(/at most \$8/);
    expect(placeBid(g, 1, 8).error).toBeUndefined();
  });

  it('refuses a bid that is not whole dollars, and leaves the state as it was', () => {
    const g = game();
    const result = placeBid(g, 1, 2.5);
    expect(result.error).toMatch(/whole dollars/);
    expect(result.state).toBe(g);
  });

  it('resetting goes back to the opener\'s $1', () => {
    const g = placeBid(game(), 1, 6).state;
    expect(resetBids(g).bids).toEqual([1, 0]);
  });
});

describe('selling', () => {
  it('gives the player to the high bidder, takes the money, and reveals who it was', () => {
    const g = purchase(placeBid(game(), 1, 4).state);
    expect(g.phase).toBe('sold');
    expect(g.sold).toMatchObject({ bidder: 1, price: 4, player: { name: 'Player 1' } });
    expect(g.bidders[1].budget).toBe(6);
    expect(g.bidders[1].team).toEqual([expect.objectContaining({ name: 'Player 1', price: 4 })]);
    expect(g.bidders[0].team).toEqual([]);
  });

  it('the opener gets the player for $1 when nobody raises', () => {
    const g = purchase(game());
    expect(g.sold).toMatchObject({ bidder: 0, price: 1 });
  });

  it('the turn to open passes round in order', () => {
    let g = sell(game());
    expect([g.lot, g.opener, g.bids]).toEqual([1, 1, [0, 1]]);
    g = sell(g);
    expect(g.opener).toBe(0);
  });

  it('skips a bidder whose team is full, and they cannot bid', () => {
    let g = game();
    g = sell(g); // Ali opens, Ali buys (1)
    g = sell(g, [[0, 2]]); // Sami opens, Ali buys (2)
    g = sell(g); // Ali opens, Ali buys (3): Ali is full
    expect(g.bidders[0].team).toHaveLength(3);
    expect(g.opener).toBe(1);
    expect(maxBid(g, 0)).toBe(0);
    expect(bidProblem(g, 0, 5)).toMatch(/team is full/);
    g = sell(g);
    expect(g.opener).toBe(1);
  });

  it('ends once every team is full', () => {
    let g = game();
    for (let k = 0; k < 6; k++) g = sell(g);
    expect(g.phase).toBe('over');
    expect(g.bidders.every(b => b.team.length === 3)).toBe(true);
  });
});

describe('the end screen', () => {
  it('lists each team best PPG first, with its total and what it spent', () => {
    let g = game();
    for (let k = 0; k < 6; k++) g = sell(g);
    const [ali] = finalTeams(g);
    expect(ali.players.map(p => p.name)).toEqual(['Player 5', 'Player 3', 'Player 1']);
    expect(ali.totalPpg).toBeCloseTo(ppg(PLAYERS[4]) + ppg(PLAYERS[2]) + ppg(PLAYERS[0]));
    expect(ali.spent).toBe(3);
  });

  it('PPG is points over games, and 0 with no games', () => {
    expect(ppg({ points: 129, games: 7 })).toBeCloseTo(18.43, 2);
    expect(ppg({ points: 0, games: 0 })).toBe(0);
  });
});
