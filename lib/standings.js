/**
 * Standings — pure functions, no DOM.
 *
 * The league is ranked as one pool. Conferences only group the tables on screen;
 * they play no part in who is ahead of whom, so a six-team league is seeded 1 to 6
 * rather than 1 to 3 twice.
 */

/**
 * Standings calculation — pure function for testability.
 * @param {Array<{ name: string, conf: string, id: string }>} teams
 * @param {Array<{ t1: string, t2: string, s1: string, s2: string }>} scores
 * @returns {Record<string, { w: number, l: number, pf: number, pa: number, conf: string, id: string }>}
 */
export function calcStandings(teams, scores) {
  const rec = {};
  (teams || []).forEach((t) => {
    rec[t.name] = { w: 0, l: 0, pf: 0, pa: 0, conf: t.conf, id: t.id };
  });
  (scores || []).forEach((g) => {
    if (!rec[g.t1] || !rec[g.t2]) return;
    if (!g.s1 || !g.s2) {
      // No scores yet — only process if forfeit declared
      if (g.forfeit) {
        if (g.forfeit === 't1') { rec[g.t1].l++; rec[g.t2].w++; }
        else                    { rec[g.t2].l++; rec[g.t1].w++; }
      }
      return;
    }
    const s1 = parseInt(g.s1, 10);
    const s2 = parseInt(g.s2, 10);
    // PF/PA always count from actual scores
    rec[g.t1].pf += s1;
    rec[g.t1].pa += s2;
    rec[g.t2].pf += s2;
    rec[g.t2].pa += s1;
    // Forfeit overrides W/L regardless of score
    if (g.forfeit) {
      if (g.forfeit === 't1') { rec[g.t1].l++; rec[g.t2].w++; }
      else                    { rec[g.t2].l++; rec[g.t1].w++; }
    } else if (s1 > s2) {
      rec[g.t1].w++;
      rec[g.t2].l++;
    } else {
      rec[g.t2].w++;
      rec[g.t1].l++;
    }
  });
  return rec;
}

/**
 * Which of two records ranks higher, for `sort`: more wins, then the better point
 * differential, then more points for. 0 when they are level on all three, so a
 * caller that sorts with it keeps the order it was given. Takes the records
 * `calcStandings` returns; anything missing counts as 0.
 * @param {{ w?: number, pf?: number, pa?: number }} [a]
 * @param {{ w?: number, pf?: number, pa?: number }} [b]
 * @returns {number} negative when `a` ranks ahead of `b`
 */
export function compareRecords(a, b) {
  const x = a || {}, y = b || {};
  const pd = (r) => (r.pf || 0) - (r.pa || 0);
  return ((y.w || 0) - (x.w || 0))
    || (pd(y) - pd(x))
    || ((y.pf || 0) - (x.pf || 0));
}

/**
 * Seeds for the whole league: 1 is the best team of all of them, whichever
 * conference it is in. Ranked by `compareRecords` — wins, then point
 * differential, then points for — and a team still level on all three keeps its
 * listed order. Returns 'TBD' for every team until a game has been scored.
 * @param {Array} teams
 * @param {Array} scores
 * @returns {Record<string, number|'TBD'>}
 */
export function calcSeeds(teams, scores) {
  const names = (teams || []).map(t => t.name);
  const seeds = {};
  const played = (scores || []).some(g => g.s1 && g.s2);
  if (!played) {
    names.forEach(n => { seeds[n] = 'TBD'; });
    return seeds;
  }
  const rec = calcStandings(teams, scores);
  [...names]
    .sort((a, b) => compareRecords(rec[a], rec[b]))
    .forEach((name, i) => { seeds[name] = i + 1; });
  return seeds;
}

/**
 * The rows of one conference's standings table. The tables stay grouped by
 * conference, but each row carries its league-wide seed and the rows are in seed
 * order, so one conference might hold seeds 1, 3 and 4 and the other 2, 5 and 6.
 * @param {Array} teams
 * @param {Array} scores
 * @param {string} conf the conference id, as teams carry it in `conf`
 * @returns {Array<{ name: string, id: string, w: number, l: number, pf: number, pa: number, seed: number|null }>}
 *   `seed` is null until a game has been scored
 */
export function conferenceStandings(teams, scores, conf) {
  const rec = calcStandings(teams, scores);
  const seeds = calcSeeds(teams, scores);
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
