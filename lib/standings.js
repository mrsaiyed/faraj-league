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
    if (!g.s1 || !g.s2 || !rec[g.t1] || !rec[g.t2]) return;
    const s1 = parseInt(g.s1, 10);
    const s2 = parseInt(g.s2, 10);
    rec[g.t1].pf += s1;
    rec[g.t1].pa += s2;
    rec[g.t2].pf += s2;
    rec[g.t2].pa += s1;
    if (s1 > s2) {
      rec[g.t1].w++;
      rec[g.t2].l++;
    } else {
      rec[g.t2].w++;
      rec[g.t1].l++;
    }
  });
  return rec;
}
