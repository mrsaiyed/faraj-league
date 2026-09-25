/**
 * The home hero: the champions' photo, with the season badge and the logo lockup over it and
 * the hadith and Reigning Champs plaque below. Pins the three copies of the hero to one markup
 * and the photo's srcset to the files actually committed.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const COPIES = [['index.html', ''], ['admin/index.html', '../'], ['admin/js/page-templates.js', '../']];

/** A page's hero block, with the admin's `../` asset prefix taken off. */
function hero(file, prefix) {
  const src = read(file);
  const block = src.slice(src.indexOf('<div class="hero">'), src.indexOf('<div class="historic-banner"'));
  return prefix ? block.replaceAll(`${prefix}images/`, 'images/') : block;
}

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

const html = hero('index.html', '');
const photo = html.match(/<img class="hero-photo-img"[^>]*>/)[0];
const attr = (name) => photo.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];

describe('the champions photo hero', () => {
  it('is the same markup in all three copies of the hero', () => {
    for (const [file, prefix] of COPIES.slice(1)) {
      expect(hero(file, prefix), file).toBe(html);
    }
  });

  it('puts the badge and the logo lockup over the photo, and the hadith below it', () => {
    // The CSS overlays .hero-top on the photo and draws the gold rule from the sponsor
    // banner's own ::before, so both depend on this nesting.
    expect(html).toMatch(/<div class="hero-photo">\s*<img class="hero-photo-img"[^>]*>\s*<div class="hero-top">\s*<div class="hero-badge" id="hero-badge">[^<]*<\/div>\s*<div class="hero-lockup">\s*<img [^>]*id="hero-league-logo"[^>]*>\s*<div id="title-sponsor-banner"><\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<div class="hero-content">\s*<p class="hero-hadith-ar">/);
  });

  it('offers every photo size at its true width', () => {
    const candidates = attr('srcset').split(',').map(s => s.trim().split(/\s+/));
    expect(candidates.length).toBeGreaterThan(1);
    const [W, H] = [Number(attr('width')), Number(attr('height'))];
    for (const [src, w] of candidates) {
      const file = path.join(ROOT, src);
      expect(fs.existsSync(file), src).toBe(true);
      const size = jpegSize(fs.readFileSync(file));
      expect(size, src).not.toBeNull();
      expect(`${size.width}w`, src).toBe(w);
      // Every size is the same crop, so the width/height attributes hold for all of them.
      expect(Math.abs(size.height - size.width * H / W), src).toBeLessThanOrEqual(1);
    }
    expect(candidates.map(([src]) => src)).toContain(attr('src'));
    expect(candidates.map(([, w]) => w)).toContain(`${W}w`);
  });

  it('keeps the phone layout in step with the photo, which it shows whole', () => {
    expect(read('css/main.css')).toContain(`aspect-ratio:${attr('width')}/${attr('height')}`);
  });

  it('loads the photo straight away, never lazily', () => {
    expect(photo).not.toMatch(/loading="lazy"/);
    expect(attr('alt')).toBeTruthy();
  });
});
