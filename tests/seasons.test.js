/**
 * Unit tests for season helpers (lib/seasons.js)
 */
import { describe, it, expect } from 'vitest';
import {
  slugifySeasonLabel,
  isValidSeasonSlug,
  sortSeasons,
  activeSeasonSlug,
} from '../lib/seasons.js';

describe('slugifySeasonLabel', () => {
  it('joins a season word and year into one token', () => {
    expect(slugifySeasonLabel('Fall 2026')).toBe('fall2026');
    expect(slugifySeasonLabel('Spring 2026')).toBe('spring2026');
  });

  it('lowercases and hyphenates other separators', () => {
    expect(slugifySeasonLabel('Summer 2027 — Div II')).toBe('summer2027-div-ii');
  });

  it('trims surrounding whitespace and punctuation', () => {
    expect(slugifySeasonLabel('  Winter 2028!  ')).toBe('winter2028');
  });

  it('returns an empty string when there is nothing usable', () => {
    expect(slugifySeasonLabel('')).toBe('');
    expect(slugifySeasonLabel('—')).toBe('');
    expect(slugifySeasonLabel(null)).toBe('');
  });

  it('produces slugs that pass validation', () => {
    ['Fall 2026', 'Spring 2026', 'Summer 2027 — Div II'].forEach(label => {
      expect(isValidSeasonSlug(slugifySeasonLabel(label))).toBe(true);
    });
  });
});

describe('isValidSeasonSlug', () => {
  it('accepts lowercase alphanumeric slugs with hyphens', () => {
    expect(isValidSeasonSlug('fall2026')).toBe(true);
    expect(isValidSeasonSlug('summer2027-div-ii')).toBe(true);
  });

  it('rejects empty, uppercase, spaced, or leading-hyphen slugs', () => {
    expect(isValidSeasonSlug('')).toBe(false);
    expect(isValidSeasonSlug('Fall2026')).toBe(false);
    expect(isValidSeasonSlug('fall 2026')).toBe(false);
    expect(isValidSeasonSlug('-fall2026')).toBe(false);
    expect(isValidSeasonSlug('fall/2026')).toBe(false);
  });
});

describe('sortSeasons', () => {
  const seasons = [
    { slug: 'spring2026', label: 'Spring 2026', is_current: false, created_at: '2026-01-01T00:00:00Z' },
    { slug: 'fall2026', label: 'Fall 2026', is_current: true, created_at: '2026-08-01T00:00:00Z' },
    { slug: 'summer2026', label: 'Summer 2026', is_current: false, created_at: '2026-05-01T00:00:00Z' },
  ];

  it('puts the active season first, then past seasons newest-first', () => {
    expect(sortSeasons(seasons).map(s => s.slug)).toEqual(['fall2026', 'summer2026', 'spring2026']);
  });

  it('falls back to newest-first when no season is active', () => {
    const none = seasons.map(s => ({ ...s, is_current: false }));
    expect(sortSeasons(none).map(s => s.slug)).toEqual(['fall2026', 'summer2026', 'spring2026']);
  });

  it('does not mutate the input', () => {
    const copy = seasons.slice();
    sortSeasons(seasons);
    expect(seasons).toEqual(copy);
  });

  it('handles an empty or missing list', () => {
    expect(sortSeasons([])).toEqual([]);
    expect(sortSeasons(undefined)).toEqual([]);
  });
});

describe('activeSeasonSlug', () => {
  it('returns the active season slug', () => {
    expect(activeSeasonSlug([
      { slug: 'spring2026', is_current: false, created_at: '2026-01-01T00:00:00Z' },
      { slug: 'fall2026', is_current: true, created_at: '2026-08-01T00:00:00Z' },
    ])).toBe('fall2026');
  });

  it('falls back to the newest season when none is active', () => {
    expect(activeSeasonSlug([
      { slug: 'spring2026', created_at: '2026-01-01T00:00:00Z' },
      { slug: 'fall2026', created_at: '2026-08-01T00:00:00Z' },
    ])).toBe('fall2026');
  });

  it('returns null for an empty list', () => {
    expect(activeSeasonSlug([])).toBe(null);
  });
});
