/**
 * Unit tests for roster display ordering (lib/roster.js)
 */
import { describe, it, expect } from 'vitest';
import { orderRosterForDisplay } from '../lib/roster.js';

// Deliberately in draft order, which is what the DB hands back.
const draftOrder = [
  { id: '1', name: 'Zaki Rizvi' },
  { id: '2', name: 'Ahmed Syed' },
  { id: '3', name: 'Raza Saiyed' },
  { id: '4', name: 'ali zaidi' },
  { id: '5', name: 'Meesam Naqvi' },
];
const names = (rows) => rows.map(r => (typeof r === 'string' ? r : r.name));

describe('orderRosterForDisplay', () => {
  it('sorts alphabetically by first name instead of draft order', () => {
    expect(names(orderRosterForDisplay(draftOrder))).toEqual([
      'Ahmed Syed', 'ali zaidi', 'Meesam Naqvi', 'Raza Saiyed', 'Zaki Rizvi',
    ]);
  });

  it('pins the captain first, then sorts the rest', () => {
    expect(names(orderRosterForDisplay(draftOrder, 'Raza Saiyed'))).toEqual([
      'Raza Saiyed', 'Ahmed Syed', 'ali zaidi', 'Meesam Naqvi', 'Zaki Rizvi',
    ]);
  });

  it('matches the captain regardless of case or padding', () => {
    expect(names(orderRosterForDisplay(draftOrder, '  ALI ZAIDI '))[0]).toBe('ali zaidi');
  });

  it('ignores a captain who is not on the roster', () => {
    const out = names(orderRosterForDisplay(draftOrder, 'Someone Else'));
    expect(out[0]).toBe('Ahmed Syed');
    expect(out).toHaveLength(5);
  });

  it('sorts case-insensitively rather than putting lowercase last', () => {
    const out = names(orderRosterForDisplay([{ name: 'bilal Khan' }, { name: 'Ali Raza' }]));
    expect(out).toEqual(['Ali Raza', 'bilal Khan']);
  });

  it('works on a list of plain name strings too', () => {
    expect(orderRosterForDisplay(['Zaki Rizvi', 'Ahmed Syed'], 'Zaki Rizvi'))
      .toEqual(['Zaki Rizvi', 'Ahmed Syed']);
  });

  it('keeps the original item objects, not copies', () => {
    const out = orderRosterForDisplay(draftOrder, 'Raza Saiyed');
    expect(out[0]).toBe(draftOrder[2]);
  });

  it('does not mutate the input', () => {
    const before = names(draftOrder);
    orderRosterForDisplay(draftOrder, 'Raza Saiyed');
    expect(names(draftOrder)).toEqual(before);
  });

  it('handles empty, missing and malformed input', () => {
    expect(orderRosterForDisplay([])).toEqual([]);
    expect(orderRosterForDisplay(null)).toEqual([]);
    expect(orderRosterForDisplay(undefined, 'X')).toEqual([]);
    // Rows are returned as-is, so a nameless one keeps its undefined name and
    // sorts first (it compares as an empty string).
    expect(names(orderRosterForDisplay([{ id: 'a' }, { name: 'Ali' }]))).toEqual([undefined, 'Ali']);
  });

  it('treats an empty captain as no captain', () => {
    expect(names(orderRosterForDisplay(draftOrder, '   '))[0]).toBe('Ahmed Syed');
  });
});
