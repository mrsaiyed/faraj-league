/**
 * Standings — pure functions, no DOM.
 *
 * The league is ranked as one pool. Conferences only group the tables on screen;
 * they play no part in who is ahead of whom, so a six-team league is seeded 1 to 6
 * rather than 1 to 3 twice.
 *
 * Teams are ranked by wins, and teams level on wins by the league's tiebreakers,
 * in the order the league sets them (the admin's Rules page; `tiebreakers` in
 * the `game_rules` block). Head-to-head is counted among the tied teams only, so
 * it cannot be a comparison of two teams at a time: a tie is broken a group at
 * a time (`rankTeams`).
 */

/** The tiebreakers on offer, as the admin and the standings page name them. */
export const TIEBREAKERS = Object.freeze({
  h2h: 'Head-to-head record',
  h2hpd: 'Head-to-head point differential',
  pd: 'Point differential',
  pf: 'Points scored',
  pa: 'Fewest points allowed',
});

/** Head-to-head, then point differential, then points scored. */
export const DEFAULT_TIEBREAKERS = Object.freeze(['h2h', 'pd', 'pf']);

/**
 * A tiebreaker order as stored, tidied: known keys only, each once, in the
 * order given. Anything that is not a list takes the default; an empty list
 * is kept, and leaves teams level on wins in the order they are listed.
 * @param {unknown} list
 * @returns {string[]}
 */
export function tiebreakerList(list) {
  if (!Array.isArray(list)) return [...DEFAULT_TIEBREAKERS];
  return [...new Set(list.filter(k => Object.hasOwn(TIEBREAKERS, k)))];
}

/** "head-to-head record, then point differential, then points scored"; '' for none. */
export function tiebreakerText(list) {
  return tiebreakerList(list).map(k => TIEBREAKERS[k].toLowerCase()).join(', then ');
}

/**
 * A game's result as the standings count it, or null when it has not been
 * played. A forfeit decides the winner whatever the score; a game with a score
 * goes to the team with more points (a level score goes to the away team, as
 * it always has here — basketball games do not end level).
 */
function gameResult(g) {
  const scored = Boolean(g.s1 && g.s2);
  if (!scored && !g.forfeit) return null;
  const s1 = scored ? parseInt(g.s1, 10) : 0;
  const s2 = scored ? parseInt(g.s2, 10) : 0;
  const homeWon = g.forfeit ? g.forfeit !== 't1' : s1 > s2;
  return { scored, s1, s2, homeWon };
}

/**
 * Standings calculation — pure function for testability.
 * @param {Array<{ name: string, conf: string, id: string }>} teams
 * @param {Array<{ t1: string, t2: string, s1: string, s2: string, forfeit?: 't1'|'t2'|null }>} scores
 * @returns {Record<string, { w: number, l: number, pf: number, pa: number, conf: string, id: string }>}
 */
export function calcStandings(teams, scores) {
  const rec = {};
  (teams || []).forEach((t) => {
    rec[t.name] = { w: 0, l: 0, pf: 0, pa: 0, conf: t.conf, id: t.id };
  });
  (scores || []).forEach((g) => {
    if (!rec[g.t1] || !rec[g.t2]) return;
    const r = gameResult(g);
    if (!r) return;
    // PF/PA always count from actual scores, a forfeit's included.
    if (r.scored) {
      rec[g.t1].pf += r.s1;
      rec[g.t1].pa += r.s2;
      rec[g.t2].pf += r.s2;
      rec[g.t2].pa += r.s1;
    }
    const [win, lose] = r.homeWon ? [g.t1, g.t2] : [g.t2, g.t1];
    rec[win].w++;
    rec[lose].l++;
  });
  return rec;
}

/**
 * The record of each team in `group` in the games between them.
 * @returns {Record<string, { w: number, l: number, pd: number, games: number }>}
 */
function headToHead(group, scores) {
  const h = Object.fromEntries(group.map(n => [n, { w: 0, l: 0, pd: 0, games: 0 }]));
  (scores || []).forEach((g) => {
    if (!h[g.t1] || !h[g.t2] || g.t1 === g.t2) return;
    const r = gameResult(g);
    if (!r) return;
    const [win, lose] = r.homeWon ? [g.t1, g.t2] : [g.t2, g.t1];
    h[win].w++;
    h[lose].l++;
    h[g.t1].games++;
    h[g.t2].games++;
    if (r.scored) {
      h[g.t1].pd += r.s1 - r.s2;
      h[g.t2].pd += r.s2 - r.s1;
    }
  });
  return h;
}

/**
 * What one tiebreaker says about each team in a tied group, higher being
 * better — or null when it cannot decide anything for this group. Head-to-head
 * counts only once every tied team has played at least one of the others;
 * before that it would rank a team on games it has not had the chance to play.
 * @returns {((name: string) => number) | null}
 */
function tiebreakerValue(key, group, rec, scores) {
  switch (key) {
    case 'pd': return (n) => rec[n].pf - rec[n].pa;
    case 'pf': return (n) => rec[n].pf;
    case 'pa': return (n) => -rec[n].pa;
    case 'h2h':
    case 'h2hpd': {
      const h = headToHead(group, scores);
      if (group.some(n => !h[n].games)) return null;
      return key === 'h2h' ? (n) => h[n].w / (h[n].w + h[n].l) : (n) => h[n].pd;
    }
    default: return null;
  }
}

/** Split a group into runs of equal value, best first; each run keeps the group's order. */
function splitBy(group, valueOf) {
  const sorted = [...group].sort((a, b) => valueOf(b) - valueOf(a));
  const runs = [];
  sorted.forEach((n) => {
    const last = runs[runs.length - 1];
    if (last && valueOf(last[0]) === valueOf(n)) last.push(n);
    else runs.push([n]);
  });
  return runs;
}

/**
 * The whole league in order, best first: by wins, and teams level on wins by
 * the tiebreakers in turn. A tiebreaker that separates some of a tied group
 * but not all of it leaves smaller ties, and each of those starts again from
 * the first tiebreaker — head-to-head between two teams can settle what it
 * could not settle among three. Teams level on everything keep the order they
 * are listed in.
 *
 * @param {Array<{ name: string }>} teams
 * @param {Array} scores
 * @param {string[]} [tiebreakers] keys of `TIEBREAKERS`, in order
 * @returns {string[]} team names
 */
export function rankTeams(teams, scores, tiebreakers = DEFAULT_TIEBREAKERS) {
  const rec = calcStandings(teams, scores);
  const keys = tiebreakerList(tiebreakers);
  const names = [...new Set((teams || []).map(t => t.name))].filter(n => rec[n]);
  const breakTie = (group) => {
    if (group.length < 2) return group;
    for (const key of keys) {
      const valueOf = tiebreakerValue(key, group, rec, scores);
      if (!valueOf) continue;
      const runs = splitBy(group, valueOf);
      if (runs.length > 1) return runs.flatMap(breakTie);
    }
    return group;
  };
  return splitBy(names, n => rec[n].w).flatMap(breakTie);
}

/**
 * Seeds for the whole league: 1 is the best team of all of them, whichever
 * conference it is in, by `rankTeams`. Returns 'TBD' for every team until a
 * game has been scored.
 * @param {Array} teams
 * @param {Array} scores
 * @param {string[]} [tiebreakers]
 * @returns {Record<string, number|'TBD'>}
 */
export function calcSeeds(teams, scores, tiebreakers = DEFAULT_TIEBREAKERS) {
  const seeds = {};
  const played = (scores || []).some(g => g.s1 && g.s2);
  if (!played) {
    (teams || []).forEach((t) => { seeds[t.name] = 'TBD'; });
    return seeds;
  }
  rankTeams(teams, scores, tiebreakers).forEach((name, i) => { seeds[name] = i + 1; });
  return seeds;
}

/**
 * The rows of one conference's standings table. The tables stay grouped by
 * conference, but each row carries its league-wide seed and the rows are in seed
 * order, so one conference might hold seeds 1, 3 and 4 and the other 2, 5 and 6.
 * @param {Array} teams
 * @param {Array} scores
 * @param {string} conf the conference id, as teams carry it in `conf`
 * @param {string[]} [tiebreakers]
 * @returns {Array<{ name: string, id: string, w: number, l: number, pf: number, pa: number, seed: number|null }>}
 *   `seed` is null until a game has been scored
 */
export function conferenceStandings(teams, scores, conf, tiebreakers = DEFAULT_TIEBREAKERS) {
  const rec = calcStandings(teams, scores);
  const seeds = calcSeeds(teams, scores, tiebreakers);
  const order = (row) => row.seed ?? Infinity;
  return (teams || [])
    .filter(t => t.conf === conf)
    .map(t => ({
      w: 0, l: 0, pf: 0, pa: 0,
      ...rec[t.name],
      name: t.name,
      id: t.id,
      seed: typeof seeds[t.name] === 'number' ? seeds[t.name] : null,
    }))
    .sort((a, b) => (order(a) === order(b) ? 0 : order(a) - order(b)));
}
