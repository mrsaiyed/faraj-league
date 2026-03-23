/**
 * Unit tests for calcStandings
 */
import { describe, it, expect } from 'vitest';
import { calcStandings } from '../lib/standings.js';

describe('calcStandings', () => {
  it('computes W/L and PF/PA for two teams each winning one game', () => {
    const teams = [
      { name: 'Team A', conf: 'Mecca', id: 'a1' },
      { name: 'Team B', conf: 'Mecca', id: 'b1' },
    ];
    const scores = [
      { t1: 'Team A', t2: 'Team B', s1: '50', s2: '40' },
      { t1: 'Team B', t2: 'Team A', s1: '55', s2: '45' },
    ];
    const rec = calcStandings(teams, scores);
    expect(rec['Team A']).toEqual({ w: 1, l: 1, pf: 95, pa: 95, conf: 'Mecca', id: 'a1' });
    expect(rec['Team B']).toEqual({ w: 1, l: 1, pf: 95, pa: 95, conf: 'Mecca', id: 'b1' });
  });

  it('handles tie game (same score) — both get a loss in typical basketball rules', () => {
    const teams = [
      { name: 'Team X', conf: 'Medina', id: 'x1' },
      { name: 'Team Y', conf: 'Medina', id: 'y1' },
    ];
    const scores = [
      { t1: 'Team X', t2: 'Team Y', s1: '50', s2: '50' },
    ];
    const rec = calcStandings(teams, scores);
    expect(rec['Team X']).toEqual({ w: 0, l: 1, pf: 50, pa: 50, conf: 'Medina', id: 'x1' });
    expect(rec['Team Y']).toEqual({ w: 1, l: 0, pf: 50, pa: 50, conf: 'Medina', id: 'y1' });
  });

  it('team with no games has 0-0, 0 PF, 0 PA', () => {
    const teams = [
      { name: 'Solo', conf: 'Mecca', id: 's1' },
    ];
    const scores = [];
    const rec = calcStandings(teams, scores);
    expect(rec['Solo']).toEqual({ w: 0, l: 0, pf: 0, pa: 0, conf: 'Mecca', id: 's1' });
  });

  it('ignores games with missing scores', () => {
    const teams = [
      { name: 'A', conf: 'X', id: '1' },
      { name: 'B', conf: 'X', id: '2' },
    ];
    const scores = [
      { t1: 'A', t2: 'B', s1: '', s2: '40' },
      { t1: 'A', t2: 'B', s1: '50', s2: '40' },
    ];
    const rec = calcStandings(teams, scores);
    expect(rec['A'].w).toBe(1);
    expect(rec['A'].pf).toBe(50);
    expect(rec['B'].l).toBe(1);
  });
});
