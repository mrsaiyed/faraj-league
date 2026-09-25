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
      expect(html, file).toContain(`alt="${DEFAULT_LOGO.alt}"`);
    }
  });
});

describe('the link preview', () => {
  // What iMessage, WhatsApp and social sites show when farajleague.org is shared. Without
  // an og:image they pick the largest picture on the page, which is the champions photo.
  const head = read('index.html').split('</head>')[0];
  const meta = (key) => head.match(new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"`))?.[1];

  it('is the league logo, as a committed 1200x630 PNG', () => {
    const url = meta('og:image');
    expect(url).toMatch(/^https:\/\/farajleague\.org\/images\/logos\/[\w-]+\.png$/);
    const png = fs.readFileSync(path.join(ROOT, url.replace('https://farajleague.org/', '')));
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    // IHDR: width and height, which the tags must state truthfully.
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
    expect([meta('og:image:width'), meta('og:image:height')]).toEqual(['1200', '630']);
  });

  it('shows the same picture on every site', () => {
    expect(meta('twitter:image')).toBe(meta('og:image'));
    expect(meta('twitter:card')).toBe('summary_large_image');
  });
});
