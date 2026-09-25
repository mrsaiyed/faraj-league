/**
 * Unit tests for the per-season champions photo (lib/champion-photo.js)
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { championPhoto, photoSources, CHAMPION_PHOTOS, DEFAULT_PHOTO } from '../lib/champion-photo.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** A JPEG's pixel size, read from its start-of-frame segment. */
function jpegSize(buf) {
  for (let i = 2; i + 9 < buf.length && buf[i] === 0xff;) {
    const marker = buf[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

describe('championPhoto', () => {
  it("shows Spring 2026's own winners on its page", () => {
    expect(championPhoto('spring2026')).toBe(CHAMPION_PHOTOS.spring2026);
  });

  it('shows the newest champions on a season still being played', () => {
    expect(championPhoto('fall2026')).toBe(DEFAULT_PHOTO);
    expect(DEFAULT_PHOTO).toBe(CHAMPION_PHOTOS.spring2026);
  });

  it("puts a season's winners on its own page and the next season's once their photo is added", () => {
    const spring = { base: 'spring' }, fall = { base: 'fall' };
    const photos = { spring2026: spring, fall2026: fall };
    expect(championPhoto('spring2026', photos)).toBe(spring); // earlier seasons keep their own
    expect(championPhoto('fall2026', photos)).toBe(fall); // replaces Spring's on Fall's page
    expect(championPhoto('spring2027', photos)).toBe(fall); // and carries over to the next season
  });

  it('falls back to the newest photo when no season is known yet', () => {
    expect(championPhoto(null)).toBe(DEFAULT_PHOTO);
    expect(championPhoto(undefined)).toBe(DEFAULT_PHOTO);
    expect(championPhoto('')).toBe(DEFAULT_PHOTO);
  });

  it('does not mistake inherited object keys for seasons', () => {
    expect(championPhoto('toString')).toBe(DEFAULT_PHOTO);
    expect(championPhoto('constructor')).toBe(DEFAULT_PHOTO);
  });

  it('has nothing to show before any photo is listed', () => {
    expect(championPhoto('fall2026', {})).toBeNull();
  });
});

describe('photoSources', () => {
  const photo = { base: 'images/champions/x', widths: [1600, 800, 2345, 1200], height: 1623 };

  it('lists every width for srcset, smallest first, at its true width', () => {
    expect(photoSources(photo).srcset).toBe('images/champions/x-800.jpg 800w, images/champions/x-1200.jpg 1200w, images/champions/x-1600.jpg 1600w, images/champions/x-2345.jpg 2345w');
  });

  it('falls back to the first width of at least 1200px, and reports the largest size', () => {
    expect(photoSources(photo)).toMatchObject({ src: 'images/champions/x-1200.jpg', width: 2345, height: 1623 });
    expect(photoSources({ ...photo, widths: [640, 900] }).src).toBe('images/champions/x-900.jpg');
  });

  it('maps every path through the host resolver', () => {
    const out = photoSources(photo, (p) => `/faraj-league/${p}`);
    expect(out.src).toBe('/faraj-league/images/champions/x-1200.jpg');
    expect(out.srcset.split(', ').every(s => s.startsWith('/faraj-league/images/'))).toBe(true);
  });
});

describe('champions photo assets', () => {
  const cssRatio = (() => {
    const m = read('css/main.css').match(/\.hero-photo\{height:auto;aspect-ratio:(\d+)\/(\d+);/);
    return m && Number(m[1]) / Number(m[2]);
  })();

  it('has a file for every width of every photo, each at its true width', () => {
    for (const [slug, photo] of Object.entries(CHAMPION_PHOTOS)) {
      const largest = Math.max(...photo.widths);
      for (const w of photo.widths) {
        const file = path.join(ROOT, `${photo.base}-${w}.jpg`);
        expect(fs.existsSync(file), `${slug} ${w}`).toBe(true);
        const size = jpegSize(fs.readFileSync(file));
        expect(size?.width, `${slug} ${w}`).toBe(w);
        // Every width is the same crop, so the listed height holds for all of them.
        expect(Math.abs(size.height - w * photo.height / largest), `${slug} ${w}`).toBeLessThanOrEqual(1);
      }
      expect(photo.alt, slug).toBeTruthy();
    }
  });

  it('crops every photo to the framing the hero is laid out for', () => {
    expect(cssRatio).toBeTruthy();
    for (const [slug, photo] of Object.entries(CHAMPION_PHOTOS)) {
      expect(Math.abs(Math.max(...photo.widths) / photo.height - cssRatio), slug).toBeLessThan(0.005);
    }
  });

  it('ships the newest photo in all three copies of the hero, so the current season never flashes', () => {
    for (const [file, prefix] of [['index.html', ''], ['admin/index.html', '../'], ['admin/js/page-templates.js', '../']]) {
      const img = read(file).match(/<img class="hero-photo-img" id="hero-champions-photo"[^>]*>/)?.[0];
      expect(img, file).toBeTruthy();
      const attr = (name) => img.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
      const want = photoSources(DEFAULT_PHOTO, (p) => prefix + p);
      expect(attr('src'), file).toBe(want.src);
      expect(attr('srcset'), file).toBe(want.srcset);
      expect(attr('width'), file).toBe(String(want.width));
      expect(attr('height'), file).toBe(String(want.height));
      expect(attr('alt'), file).toBe(DEFAULT_PHOTO.alt);
    }
  });
});
