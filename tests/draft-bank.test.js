/**
 * Unit tests for the draft player-bank search (lib/draft-bank.js)
 */
import { describe, it, expect } from 'vitest';
import { filterBankPlayers } from '../lib/draft-bank.js';

const bank = [
  { id: '1', name: 'Raza Saiyed' },
  { id: '2', name: 'Ali Rizvi' },
  { id: '3', name: 'Raamiz Jafri' },
  { id: '4', name: 'Ali Zaidi' },
  { id: '5', name: 'Omeed Tafreshi' },
];
const names = (rows) => rows.map(r => r.name);

describe('filterBankPlayers', () => {
  it('returns everyone for an empty query', () => {
    expect(filterBankPlayers(bank, '')).toHaveLength(5);
    expect(filterBankPlayers(bank, '   ')).toHaveLength(5);
  });

  it('shows names starting with the typed letter', () => {
    expect(names(filterBankPlayers(bank, 'R'))).toContain('Raza Saiyed');
    expect(names(filterBankPlayers(bank, 'R'))).toContain('Raamiz Jafri');
  });

  it('is case-insensitive', () => {
    expect(names(filterBankPlayers(bank, 'raz'))).toEqual(['Raza Saiyed']);
    expect(names(filterBankPlayers(bank, 'RAZ'))).toEqual(['Raza Saiyed']);
  });

  it('narrows as more letters are typed', () => {
    expect(filterBankPlayers(bank, 'Ra')).toHaveLength(2);
    expect(names(filterBankPlayers(bank, 'Raa'))).toEqual(['Raamiz Jafri']);
  });

  it('also matches a surname', () => {
    expect(names(filterBankPlayers(bank, 'zaidi'))).toEqual(['Ali Zaidi']);
  });

  it('does not match mid-word', () => {
    expect(filterBankPlayers(bank, 'aidi')).toEqual([]);
  });

  it('preserves the original order so chips do not jump', () => {
    expect(names(filterBankPlayers(bank, 'a'))).toEqual(['Ali Rizvi', 'Ali Zaidi']);
  });

  it('returns an empty list when nothing matches', () => {
    expect(filterBankPlayers(bank, 'zzz')).toEqual([]);
  });

  it('ignores surrounding whitespace in the query', () => {
    expect(names(filterBankPlayers(bank, '  omeed '))).toEqual(['Omeed Tafreshi']);
  });

  it('survives missing or malformed input', () => {
    expect(filterBankPlayers(null, 'a')).toEqual([]);
    expect(filterBankPlayers(undefined, '')).toEqual([]);
    expect(filterBankPlayers([{ id: 'x' }, { id: 'y', name: '' }], 'a')).toEqual([]);
  });

  it('does not mutate the input list', () => {
    const copy = [...bank];
    filterBankPlayers(bank, 'r');
    expect(bank).toEqual(copy);
  });
});
