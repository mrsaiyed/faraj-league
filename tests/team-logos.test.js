/**
 * Unit tests for team logo resolution (lib/team-logos.js)
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveTeamLogo,
  builtInLogoKey,
  seasonTeamLogo,
  logoScaleCss,
  DEFAULT_LOGO_SCALE,
  SEASON_TEAM_LOGOS,
} from '../lib/team-logos.js';

describe('resolveTeamLogo', () => {
  it("uses the team's own logo_url when set", () => {
    const hit = resolveTeamLogo({ logo_url: 'https://cdn.example/fall.png' }, 'Anything');
    expect(hit).toEqual({ path: 'https://cdn.example/fall.png', scale: DEFAULT_LOGO_SCALE, custom: true });
  });

  it('lets a custom logo win over a name that matches a built-in file', () => {
    const hit = resolveTeamLogo({ logo_url: 'images/teams/new.png' }, 'Ansar');
    expect(hit.path).toBe('images/teams/new.png');
    expect(hit.custom).toBe(true);
  });

  it('keeps a renamed team on its chosen logo', () => {
    const team = { logo_url: 'images/teams/raad.jpg', logo_scale: 2.3 };
    expect(resolveTeamLogo(team, 'Completely New Name')).toEqual({
      path: 'images/teams/raad.jpg', scale: 2.3, custom: true,
    });
  });

  it('honours a per-team zoom', () => {
    expect(resolveTeamLogo({ logo_url: 'a.png', logo_scale: 2.5 }).scale).toBe(2.5);
  });

  it('falls back to the default zoom for a bad or missing scale', () => {
    expect(resolveTeamLogo({ logo_url: 'a.png', logo_scale: null }).scale).toBe(DEFAULT_LOGO_SCALE);
    expect(resolveTeamLogo({ logo_url: 'a.png', logo_scale: 0 }).scale).toBe(DEFAULT_LOGO_SCALE);
    expect(resolveTeamLogo({ logo_url: 'a.png', logo_scale: 'abc' }).scale).toBe(DEFAULT_LOGO_SCALE);
  });

  it('treats blank or whitespace logo_url as unset', () => {
    expect(resolveTeamLogo({ logo_url: '   ' }, 'Noor').custom).toBe(false);
    expect(resolveTeamLogo({ logo_url: '' }, 'Nothing')).toBe(null);
  });

  it('falls back to the committed files for seasons with no logo_url', () => {
    expect(resolveTeamLogo({}, 'Noor')).toEqual({
      path: 'images/teams/noor.png', scale: 2.40, custom: false,
    });
    expect(resolveTeamLogo(null, 'Jaysh').path).toBe('images/teams/jaysh.png');
  });

  it('carries the tuned two-axis scale through', () => {
    expect(resolveTeamLogo(null, 'Mujahideen').scale).toEqual([1.85, 2.45]);
  });

  it('returns null when nothing matches, so the caller renders initials', () => {
    expect(resolveTeamLogo(null, 'Brand New Team')).toBe(null);
    expect(resolveTeamLogo(null, '')).toBe(null);
    expect(resolveTeamLogo(null, undefined)).toBe(null);
  });

  it('reads the name off the team when one is not passed separately', () => {
    expect(resolveTeamLogo({ name: 'Raad' }).path).toBe('images/teams/raad.jpg');
  });
});

describe('a logo committed for one season', () => {
  const NASR = { path: 'images/teams/nasr-fall2026.png', scale: DEFAULT_LOGO_SCALE, custom: false };

  it("gives Fall 2026's Nasr its logo with no admin step", () => {
    expect(resolveTeamLogo({ name: 'Nasr', logo_url: null }, 'Nasr', 'fall2026')).toEqual(NASR);
    expect(resolveTeamLogo({ name: 'Nasr' }, undefined, 'fall2026')).toEqual(NASR);
    expect(resolveTeamLogo(null, 'Nasr', 'fall2026')).toEqual(NASR);
  });

  it('finds the team however its name is written', () => {
    for (const name of ['NASR', ' Nasr ', 'nasr', 'Al-Nasr']) {
      expect(resolveTeamLogo(null, name, 'fall2026')?.path).toBe(NASR.path);
    }
  });

  it('stays in its own season', () => {
    expect(resolveTeamLogo(null, 'Nasr', 'spring2026')).toBe(null);
    expect(resolveTeamLogo(null, 'Nasr', 'winter2027')).toBe(null);
    expect(resolveTeamLogo(null, 'Nasr')).toBe(null);
    expect(resolveTeamLogo(null, 'Nasr', '__proto__')).toBe(null);
    expect(resolveTeamLogo(null, 'Nasr', 'constructor')).toBe(null);
  });

  it("gives way to a logo the admin sets for the team", () => {
    expect(resolveTeamLogo({ logo_url: 'images/teams/other.png' }, 'Nasr', 'fall2026')).toEqual({
      path: 'images/teams/other.png', scale: DEFAULT_LOGO_SCALE, custom: true,
    });
  });

  it("leaves the season's other teams as they were", () => {
    expect(resolveTeamLogo(null, 'Noor', 'fall2026').path).toBe('images/teams/noor.png');
    expect(resolveTeamLogo(null, 'Ansar', 'fall2026').path).toBe('images/teams/ansar.png');
    expect(resolveTeamLogo(null, 'Qamar', 'fall2026')).toBe(null);
  });

  it('never goes to a team whose name is only a fragment of the key', () => {
    expect(seasonTeamLogo('fall2026', 'N')).toBe(null);
    expect(seasonTeamLogo('fall2026', 'Nas')).toBe(null);
    expect(seasonTeamLogo('fall2026', '')).toBe(null);
  });

  it('points only at square PNGs that are committed', () => {
    const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'images', 'teams');
    const files = Object.values(SEASON_TEAM_LOGOS).flatMap(season => Object.values(season).map(l => l.file));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const png = fs.readFileSync(path.join(dir, file));
      expect(png.subarray(1, 4).toString()).toBe('PNG');
      // IHDR: width and height, so the circle crop never cuts the logo unevenly.
      expect(png.readUInt32BE(16)).toBe(png.readUInt32BE(20));
    }
  });
});

describe('builtInLogoKey', () => {
  it('matches regardless of case and punctuation', () => {
    expect(builtInLogoKey('AL-ANSAR')).toBe('ansar');
    expect(builtInLogoKey('Noor ')).toBe('noor');
  });

  it('returns null for an empty name', () => {
    expect(builtInLogoKey('')).toBe(null);
    expect(builtInLogoKey(null)).toBe(null);
  });
});

describe('logoScaleCss', () => {
  it('renders a single scale and an [x, y] pair', () => {
    expect(logoScaleCss(1.15)).toBe('1.15');
    expect(logoScaleCss([1.85, 2.45])).toBe('1.85, 2.45');
  });
});
