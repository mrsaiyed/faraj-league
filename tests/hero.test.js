/**
 * The home hero: the champions' photo, with the season badge and the logo lockup over it and
 * the hadith and Reigning Champs plaque below. Pins the three copies of the hero to one markup;
 * which photo they show is tests/champion-photo.test.js.
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

  it('loads the photo straight away, never lazily', () => {
    expect(photo).not.toMatch(/loading="lazy"/);
    expect(attr('alt')).toBeTruthy();
  });
});
