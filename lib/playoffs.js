/**
 * The postseason — pure functions, no DOM.
 *
 * The admin marks the postseason's weeks in the season's `playoffs_by_week`
 * block, and the standings leave every marked week out. The last marked week
 * is the bracket: two semifinals (games 1 and 2) and the final (game 3). A
 * marked week before it is a play-in, shown as an ordinary week of games: it
 * decides who the bracket's four seeds are rather than anyone's record.
 *
 * The play-in pairs the regular season's seeds 1 v 2, 3 v 6 and 4 v 5. Both of
 * the top two go through — the winner of their game as the first seed, the
 * loser as the second — and the winners of the other two games are the third
 * and fourth seeds, the better regular-season seed of the two third. The first
 * seed plays the fourth in semifinal 1, the week's first game; the second
 * plays the third in semifinal 2.
 *
 * A season without a play-in week keeps the bracket Spring 2026 had: the games
 * the admin scheduled, as conference finals and a championship.
 */

import { gameResult } from './standings.js';
import { isFinal } from './game-clock.js';

/**
 * Which of the marked weeks is the bracket and which are the play-in.
 * @param {Record<string, unknown>} playoffWeeks `config.DB.playoffWeeks`
 * @returns {{ bracketWeek: number|null, playInWeeks: number[] }}
 */
export function postseasonWeeks(playoffWeeks) {
  const weeks = Object.keys(playoffWeeks || {})
    .filter(k => playoffWeeks[k])
    .map(Number)
    .filter(Number.isInteger)
    .sort((a, b) => a - b);
  return { bracketWeek: weeks.length ? weeks[weeks.length - 1] : null, playInWeeks: weeks.slice(0, -1) };
}

/** Who won and who lost a game that is over; null until it is. */
export function gameOutcome(g) {
  if (!g || !isFinal(g)) return null;
  const r = gameResult(g);
  if (!r) return null;
  return r.homeWon ? { winner: g.t1, loser: g.t2 } : { winner: g.t2, loser: g.t1 };
}

/**
 * The bracket's seeds 1 to 4 after the play-in, by team name; null for a seed
 * the play-in has not settled yet. The third and fourth wait for both of the
 * other play-in games, since either result can move the other winner.
 * @param {string[]} order the regular season's standings, best first (`rankTeams`)
 * @param {Array<{ t1: string, t2: string }>} playInGames `config.DB.scores` rows
 * @returns {{ seeds: Record<1|2|3|4, string|null>, topGame: object|null }}
 *   `topGame` is the play-in game the first seed is in
 */
export function playInSeeds(order, playInGames) {
  const seedOf = (n) => { const i = (order || []).indexOf(n); return i < 0 ? Infinity : i + 1; };
  const games = (playInGames || []).filter(g => g?.t1 && g?.t2);
  const topGame = games.find(g => seedOf(g.t1) === 1 || seedOf(g.t2) === 1) || null;
  const rest = games.filter(g => g !== topGame);
  const seeds = { 1: null, 2: null, 3: null, 4: null };

  const top = gameOutcome(topGame);
  if (top) { seeds[1] = top.winner; seeds[2] = top.loser; }

  const outcomes = rest.map(gameOutcome);
  if (rest.length >= 2 && outcomes.every(Boolean)) {
    outcomes.map(o => o.winner).sort((a, b) => seedOf(a) - seedOf(b)).slice(0, 2)
      .forEach((name, i) => { seeds[3 + i] = name; });
  }
  return { seeds, topGame };
}

/**
 * The bracket's three games as they stand: each side's seed, its team once it
 * is known, and what decides it until then ("Winner of A vs B").
 * @param {string[]} order the regular season's standings, best first
 * @param {Array} playInGames the play-in's games
 * @param {Array<{ game: number }>} bracketGames the bracket week's games, for the final
 * @returns {Array<{ game: 1|2|3, round: 'semifinal'|'final',
 *   home: { seed: number|null, team: string|null, note: string },
 *   away: { seed: number|null, team: string|null, note: string } }>}
 *   `home` is the better seed; in the final, the first semifinal's winner while
 *   the seeds are not both known
 */
export function bracketSlots(order, playInGames, bracketGames) {
  const { seeds, topGame } = playInSeeds(order, playInGames);
  const seedOf = (n) => { const i = (order || []).indexOf(n); return i < 0 ? Infinity : i + 1; };
  const topPair = topGame ? [topGame.t1, topGame.t2].sort((a, b) => seedOf(a) - seedOf(b)).join(' vs ') : '';
  const notes = {
    1: topPair ? `Winner of ${topPair}` : 'Play-in winner',
    2: topPair ? `Loser of ${topPair}` : 'Play-in',
    3: 'Play-in winner',
    4: 'Play-in winner',
  };
  const side = (seed) => ({ seed, team: seeds[seed], note: seeds[seed] ? '' : notes[seed] });

  const semis = [
    { game: 1, round: 'semifinal', home: side(1), away: side(4) },
    { game: 2, round: 'semifinal', home: side(2), away: side(3) },
  ];

  const bracketSeedOf = (name) => {
    const hit = Object.entries(seeds).find(([, n]) => n && n === name);
    return hit ? Number(hit[0]) : null;
  };
  const finalist = (semi) => {
    const winner = gameOutcome((bracketGames || []).find(g => g.game === semi.game))?.winner || null;
    return { seed: winner ? bracketSeedOf(winner) : null, team: winner, note: winner ? '' : `Winner of Semifinal ${semi.game}` };
  };
  const f1 = finalist(semis[0]);
  const f2 = finalist(semis[1]);
  const swap = f1.seed != null && f2.seed != null && f2.seed < f1.seed;
  return [...semis, { game: 3, round: 'final', home: swap ? f2 : f1, away: swap ? f1 : f2 }];
}
