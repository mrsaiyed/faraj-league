/**
 * Standings calculation — pure function for testability.
 * @param {Array<{ name: string, conf: string, id: string }>} teams
 * @param {Array<{ t1: string, t2: string, s1: string, s2: string }>} scores
 * @returns {Record<string, { w: number, l: number, pf: number, pa: number, conf: string, id: string }>}
 */
/**
 * Calculates per-conference seeds for all teams.
 * Tiebreakers (in order): conference record → point differential → points for.
 * Returns 'TBD' for all teams when no scored games exist.
 * @param {Array} teams
 * @param {Array} scores
 * @returns {Record<string, number|'TBD'>}
 */
export function calcSeeds(teams, scores) {
  const played = (scores || []).some(g => g.s1 && g.s2);
  const rec = calcStandings(teams, scores);

  const byConf = {};
  (teams || []).forEach(t => {
    const c = t.conf || '__none__';
    if (!byConf[c]) byConf[c] = [];
    byConf[c].push(t.name);
  });

  const seeds = {};
  Object.values(byConf).forEach(names => {
    if (!played) {
      names.forEach(n => { seeds[n] = 'TBD'; });
      return;
    }

    // Group by win count within conference
    const byW = {};
    names.forEach(n => {
      const w = (rec[n] || { w: 0 }).w;
      if (!byW[w]) byW[w] = [];
      byW[w].push(n);
    });

    const sorted = [];
    Object.keys(byW).sort((a, b) => Number(b) - Number(a)).forEach(w => {
      const group = byW[w];
      if (group.length === 1) { sorted.push(group[0]); return; }

      group.sort((a, b) => {
        const pda = (rec[a]?.pf || 0) - (rec[a]?.pa || 0);
        const pdb = (rec[b]?.pf || 0) - (rec[b]?.pa || 0);
        if (pdb !== pda) return pdb - pda;
        return (rec[b]?.pf || 0) - (rec[a]?.pf || 0);
      });
      sorted.push(...group);
    });

    sorted.forEach((name, i) => { seeds[name] = i + 1; });
  });

  return seeds;
}

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
