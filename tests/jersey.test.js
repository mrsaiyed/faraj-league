/**
 * Unit tests for jersey numbers (lib/jersey.js)
 */
import { describe, it, expect } from 'vitest';
import { hasJersey, jerseyValue, typedJersey, numberDuplicates } from '../lib/jersey.js';

describe('hasJersey', () => {
  it('counts #0 as a number', () => {
    expect(hasJersey(0)).toBe(true);
    expect(hasJersey('0')).toBe(true);
  });

  it('does not count nothing', () => {
    expect(hasJersey(null)).toBe(false);
    expect(hasJersey(undefined)).toBe(false);
    expect(hasJersey('')).toBe(false);
    expect(hasJersey('  ')).toBe(false);
  });
});

describe('jerseyValue', () => {
  it('reads whole numbers from 0 to 99', () => {
    expect(jerseyValue('23')).toBe(23);
    expect(jerseyValue(' 12 ')).toBe(12);
    expect(jerseyValue('99')).toBe(99);
    expect(jerseyValue(5)).toBe(5);
    expect(jerseyValue('007')).toBe(7);
  });

  it('keeps #0 as 0, not as "no number"', () => {
    expect(jerseyValue('0')).toBe(0);
    expect(jerseyValue(0)).toBe(0);
  });

  it('reads a blank as no number', () => {
    expect(jerseyValue('')).toBeNull();
    expect(jerseyValue('   ')).toBeNull();
    expect(jerseyValue(null)).toBeNull();
    expect(jerseyValue(undefined)).toBeNull();
  });

  it('rejects anything else as NaN', () => {
    expect(jerseyValue('100')).toBeNaN();
    expect(jerseyValue('-1')).toBeNaN();
    expect(jerseyValue('7.5')).toBeNaN();
    expect(jerseyValue('abc')).toBeNaN();
    expect(jerseyValue('1 2')).toBeNaN();
  });
});

describe('typedJersey', () => {
  it('keeps digits only', () => {
    expect(typedJersey('a1b2')).toBe('12');
    expect(typedJersey('#7')).toBe('7');
    expect(typedJersey('-')).toBe('');
    expect(typedJersey('7.5')).toBe('75');
  });

  it('holds two digits: a third pushes the first out', () => {
    expect(typedJersey('23')).toBe('23');
    expect(typedJersey('235')).toBe('35');
    expect(typedJersey('007')).toBe('07');
  });

  it('turns nothing into an empty box', () => {
    expect(typedJersey('')).toBe('');
    expect(typedJersey(null)).toBe('');
    expect(typedJersey(undefined)).toBe('');
  });

  it('always leaves something jerseyValue accepts', () => {
    for (const raw of ['', '0', '9', '99', '123', 'x4y5z6', '00']) {
      expect(jerseyValue(typedJersey(raw))).not.toBeNaN();
    }
  });
});

describe('numberDuplicates', () => {
  const roster = (...numbers) => numbers.map((number, i) => ({ id: `p${i + 1}`, number }));

  it('finds a number worn by two players', () => {
    expect(numberDuplicates(roster(7, 12, 7, 5))).toEqual([{ number: 7, ids: ['p1', 'p3'] }]);
  });

  it('finds every shared number, in ascending order', () => {
    expect(numberDuplicates(roster(23, 4, 23, 4, 4))).toEqual([
      { number: 4, ids: ['p2', 'p4', 'p5'] },
      { number: 23, ids: ['p1', 'p3'] },
    ]);
  });

  it('treats a typed "7" and a stored 7 as the same number', () => {
    expect(numberDuplicates(roster('7', 7))).toEqual([{ number: 7, ids: ['p1', 'p2'] }]);
  });

  it('counts two players on #0 — falsy is not the same as none', () => {
    expect(numberDuplicates(roster(0, 0, 3))).toEqual([{ number: 0, ids: ['p1', 'p2'] }]);
  });

  it('never counts players with no number, or one that is not valid', () => {
    expect(numberDuplicates(roster(null, null, '', undefined, 'abc', 'abc', 100, 100))).toEqual([]);
  });

  it('finds nothing when every number is different', () => {
    expect(numberDuplicates(roster(1, 2, 3))).toEqual([]);
    expect(numberDuplicates([])).toEqual([]);
    expect(numberDuplicates(undefined)).toEqual([]);
  });
});
