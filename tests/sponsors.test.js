/**
 * Unit tests for sponsor slot handling (lib/sponsors.js)
 */
import { describe, it, expect } from 'vitest';
import {
  SPONSOR_SLOTS, hasSponsor, sponsorName, sponsorOverridesFrom, highlightSponsorNames,
} from '../lib/sponsors.js';

describe('hasSponsor / sponsorName', () => {
  it('treats the placeholder as unset', () => {
    expect(hasSponsor('[Sponsor 2A]', '[Sponsor 2A]')).toBe(false);
    expect(sponsorName('[Sponsor 2A]', '[Sponsor 2A]')).toBe('');
  });

  it('treats blank, whitespace and null as unset', () => {
    ['', '   ', null, undefined].forEach(v => expect(hasSponsor(v, '[x]')).toBe(false));
  });

  it('returns a real name trimmed', () => {
    expect(sponsorName('  Acme Motors ', '[x]')).toBe('Acme Motors');
  });
});

describe('sponsorOverridesFrom', () => {
  it('returns every field even when the season has no sponsors', () => {
    const o = sponsorOverridesFrom([]);
    SPONSOR_SLOTS.forEach(({ key }) => {
      expect(o).toHaveProperty(key, null);
      expect(o).toHaveProperty(`${key}_LOGO`, null);
      expect(o).toHaveProperty(`${key}_DESC`, '');
    });
  });

  it('is complete for a missing list too, so applying it always resets', () => {
    expect(Object.keys(sponsorOverridesFrom(undefined))).toHaveLength(SPONSOR_SLOTS.length * 3);
  });

  it('maps each row onto its slot', () => {
    const o = sponsorOverridesFrom([
      { type: 'title', name: 'Acme', logo_url: 'a.png', label: 'Proud partner' },
      { type: 'conference_mecca', name: 'Bolt', logo_url: null, label: '' },
    ]);
    expect(o.SP1).toBe('Acme');
    expect(o.SP1_LOGO).toBe('a.png');
    expect(o.SP1_DESC).toBe('Proud partner');
    expect(o.SP2A).toBe('Bolt');
    expect(o.SP2A_LOGO).toBe(null);
  });

  it('leaves slots with no row null rather than carrying anything over', () => {
    const o = sponsorOverridesFrom([{ type: 'title', name: 'Acme' }]);
    expect(o.SP2A).toBe(null);
    expect(o.SP2B).toBe(null);
    expect(o.SP2B_LOGO).toBe(null);
  });

  it('treats a blank name on a row as no name', () => {
    expect(sponsorOverridesFrom([{ type: 'conference_mecca', name: '   ' }]).SP2A).toBe(null);
  });

  it('ignores unknown sponsor types', () => {
    expect(sponsorOverridesFrom([{ type: 'nonsense', name: 'X' }]).SP1).toBe(null);
  });
});

describe('highlightSponsorNames', () => {
  const brands = [
    { name: 'Acme Motors', brandClass: 'brand-sponsor-a' },
    { name: 'Bolt', brandClass: 'brand-sponsor-b' },
  ];

  it('wraps a configured sponsor name', () => {
    expect(highlightSponsorNames('Acme Motors Mecca Conference', brands))
      .toBe('<span class="brand-sponsor-a">Acme Motors</span> Mecca Conference');
  });

  it('is case-insensitive but preserves the original casing', () => {
    expect(highlightSponsorNames('bolt wins', brands)).toContain('>bolt</span>');
  });

  it('highlights nothing when the season has no sponsors', () => {
    expect(highlightSponsorNames('Mecca Conference', [])).toBe('Mecca Conference');
    expect(highlightSponsorNames('Mecca Conference', undefined)).toBe('Mecca Conference');
  });

  it('no longer highlights names that are not this season\'s sponsors', () => {
    expect(highlightSponsorNames('TOYOMOTORS Mecca Conference', brands))
      .toBe('TOYOMOTORS Mecca Conference');
  });

  it('prefers the longer name when one contains the other', () => {
    const overlapping = [
      { name: 'Bolt', brandClass: 'brand-sponsor-b' },
      { name: 'Bolt Energy', brandClass: 'brand-sponsor-a' },
    ];
    expect(highlightSponsorNames('Bolt Energy Cup', overlapping))
      .toBe('<span class="brand-sponsor-a">Bolt Energy</span> Cup');
  });

  it('does not match inside a longer word', () => {
    expect(highlightSponsorNames('Boltage', brands)).toBe('Boltage');
  });

  it('treats regex characters in a name literally', () => {
    const tricky = [{ name: 'A+B (Co.)', brandClass: 'brand-sponsor-a' }];
    expect(highlightSponsorNames('A+B (Co.) wins', tricky)).toContain('>A+B (Co.)</span>');
  });

  it('skips blank brand entries', () => {
    expect(highlightSponsorNames('text', [{ name: '  ', brandClass: 'x' }])).toBe('text');
  });
});
