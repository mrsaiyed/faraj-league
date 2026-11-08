/**
 * Unit tests for the admin's auction game (lib/auction.js)
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_BUDGET, ppg, shuffle, setupProblem, newGame, maxBid, freeTaker, highBidder, highBid,
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
    expect(setupProblem({ bidders: 2, perTeam: 6, budget: 0, available: 56 })).toMatch(/at least \$1/);
    expect(setupProblem({ bidders: 2, perTeam: 6, budget: 3, available: 56 })).toBeNull();
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

  it('anyone but the opener has to beat the high bid', () => {
    const g = game(); // Ali opens at $1
    expect(placeBid(g, 1, 1).error).toMatch(/Ties go to Ali.*beat \$1/);
    expect(placeBid(g, 1, 2).state.bids).toEqual([1, 2]);
  });

  it('the opener wins ties: they can match the high bid to take it', () => {
    const g = placeBid(game(), 1, 4).state; // Sami bids $4 over Ali's $1
    expect(placeBid(g, 0, 3).error).toMatch(/at least \$4/);
    const matched = placeBid(g, 0, 4).state;
    expect(matched.bids).toEqual([4, 4]);
    expect(highBidder(matched)).toBe(0);
    expect(raise(matched, 1).state.bids).toEqual([4, 5]);
  });

  it('the opener can put all they have in against a bid of the same', () => {
    let g = game();
    g = { ...g, bidders: [{ ...g.bidders[0], budget: 8 }, { ...g.bidders[1], budget: 10 }] };
    g = placeBid(g, 0, 7).state;
    g = placeBid(g, 1, 8).state; // Ali, opening with $8 left, faces $8
    expect(raise(g, 0).state.bids).toEqual([8, 8]);
    const allIn = placeBid(g, 0, 8).state;
    expect(highBidder(allIn)).toBe(0);
    expect(purchase(allIn).sold).toMatchObject({ bidder: 0, price: 8 });
    expect(placeBid(allIn, 1, 8).error).toMatch(/Ties go to Ali/);
    expect(placeBid(allIn, 1, 9).state.bids).toEqual([8, 9]);
  });

  it('the high bidder cannot bid against themselves', () => {
    expect(bidProblem(game(), 0, 3)).toMatch(/already has the high bid/);
  });

  it('a bidder can bid all the money they have left, and no more', () => {
    const g = game(); // $10 each
    expect(maxBid(g, 1)).toBe(10);
    expect(placeBid(g, 1, 11).error).toMatch(/only has \$10/);
    expect(placeBid(g, 1, 10).error).toBeUndefined();
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

describe('out of money', () => {
  // $2 each: Sami spends it all on the first player.
  const broke = () => nextLot(purchase(placeBid(game({ budget: 2 }), 1, 2).state));

  it('a bidder at $0 cannot bid', () => {
    const g = broke();
    expect(g.bidders[1].budget).toBe(0);
    expect(maxBid(g, 1)).toBe(0);
    expect(bidProblem(g, 1, 1)).toMatch(/out of money/);
  });

  it('on their own turn nobody has to open, and if nobody bids the player is theirs for $0', () => {
    const g = broke(); // Sami's turn
    expect(g.opener).toBe(1);
    expect(g.bids).toEqual([0, 0]);
    expect(freeTaker(g)).toBe(1);
    const sold = purchase(g);
    expect(sold.sold).toMatchObject({ bidder: 1, price: 0 });
    expect(sold.bidders[1].team).toHaveLength(2);
  });

  it('or whoever has money bids and takes him', () => {
    const g = purchase(raise(broke(), 0).state);
    expect(g.sold).toMatchObject({ bidder: 0, price: 1 });
  });

  it('on the other bidder\'s turn they need not open: not bidding gives the player away', () => {
    const g = nextLot(purchase(broke())); // Sami took one free; now Ali's turn
    expect(g.opener).toBe(0);
    expect(g.bids).toEqual([0, 0]);
    expect(purchase(g).sold).toMatchObject({ bidder: 1, price: 0 });
  });

  it('once everyone is at $0 the players go out one each, in turn', () => {
    let g = newGame({ names: ['Ali', 'Sami'], perTeam: 3, budget: 1, players: PLAYERS, random: noShuffle });
    g = sell(g); // Ali opens at $1 and takes him: Ali $0
    g = sell(g, [[1, 1]]); // Sami bids his $1: Sami $0
    expect(g.bidders.map(b => b.budget)).toEqual([0, 0]);
    const owners = [];
    while (g.phase === 'bidding') {
      expect(g.bids).toEqual([0, 0]);
      g = purchase(g);
      owners.push(g.sold.bidder);
      g = nextLot(g);
    }
    expect(owners).toEqual([0, 1, 0, 1]);
    expect(g.phase).toBe('over');
  });

  it('with nobody at $0 the opener still has to start at $1', () => {
    expect(freeTaker(game())).toBe(-1);
    expect(game().bids).toEqual([1, 0]);
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
