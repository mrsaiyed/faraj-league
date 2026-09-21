/**
 * Unit tests for team logo resolution (lib/team-logos.js)
 */
import { describe, it, expect } from 'vitest';
import {
  resolveTeamLogo,
  builtInLogoKey,
  logoScaleCss,
  DEFAULT_LOGO_SCALE,
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
