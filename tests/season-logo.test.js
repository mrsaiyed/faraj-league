/**
 * Unit tests for the per-season hero logo (lib/season-logo.js)
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seasonLogo, SEASON_LOGOS, DEFAULT_LOGO } from '../lib/season-logo.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('seasonLogo', () => {
  it('keeps the original badge for the inaugural season', () => {
    expect(seasonLogo('spring2026')).toMatchObject({ src: 'faraj-logo.png', variant: 'badge' });
  });

  it('shows the City Edition for Fall 2026', () => {
    expect(seasonLogo('fall2026')).toMatchObject({
      src: 'images/logos/fall2026-city-edition.svg',
      variant: 'mark',
    });
  });

  it('gives a season with no entry the newest edition, not the old badge', () => {
    expect(seasonLogo('spring2027')).toBe(DEFAULT_LOGO);
    expect(DEFAULT_LOGO.variant).not.toBe('badge');
  });

  it('falls back when no season is known yet', () => {
    expect(seasonLogo(undefined)).toBe(DEFAULT_LOGO);
    expect(seasonLogo(null)).toBe(DEFAULT_LOGO);
    expect(seasonLogo('')).toBe(DEFAULT_LOGO);
  });

  it('does not mistake inherited object keys for seasons', () => {
    // "constructor" is a valid slug shape; it must not return Object's function.
    expect(seasonLogo('constructor')).toBe(DEFAULT_LOGO);
    expect(seasonLogo('toString')).toBe(DEFAULT_LOGO);
  });
});

describe('season logo assets', () => {
  const all = [DEFAULT_LOGO, ...Object.values(SEASON_LOGOS)];

  it('points every logo at a file that is committed', () => {
    all.forEach(logo => expect(fs.existsSync(path.join(ROOT, logo.src)), logo.src).toBe(true));
  });

  it('has a CSS treatment for every variant', () => {
    const css = read('css/main.css');
    new Set(all.map(l => l.variant)).forEach(v => {
      expect(css, `.hero-league-logo--${v}`).toContain(`.hero-league-logo--${v}{`);
    });
  });

  it('ships the default logo in all three copies of the hero, so it never flashes', () => {
    // The page paints before the season loads. If the HTML started on any
    // other logo, visitors to the active season would see it swap on load.
    for (const [file, prefix] of [
      ['index.html', ''],
      ['admin/index.html', '../'],
      ['admin/js/page-templates.js', '../'],
    ]) {
      const html = read(file);
      expect(html, file).toContain(`src="${prefix}${DEFAULT_LOGO.src}" id="hero-league-logo"`);
      expect(html, file).toContain(`hero-league-logo--${DEFAULT_LOGO.variant}"`);
    }
  });
});
