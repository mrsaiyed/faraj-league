/**
 * Unit tests for the roster import helpers (scripts/import-roster.js).
 * Pure functions only — no DB, no network.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { validateRoster, toSql } from '../scripts/import-roster.js';

const fall2026 = JSON.parse(readFileSync(new URL('../scripts/rosters/fall2026.json', import.meta.url), 'utf8'));

describe('fall2026 roster file', () => {
  it('holds the 42 players from the draft board', () => {
    expect(fall2026.players).toHaveLength(42);
  });

  it('targets the fall2026 season', () => {
    expect(fall2026.season.slug).toBe('fall2026');
  });

  it('is valid', () => {
    expect(validateRoster(fall2026)).toEqual([]);
  });

  it('has no duplicate or untrimmed names', () => {
    const lower = fall2026.players.map(n => n.toLowerCase());
    expect(new Set(lower).size).toBe(lower.length);
    fall2026.players.forEach(n => expect(n).toBe(n.trim()));
  });
});

describe('validateRoster', () => {
  it('requires a season slug', () => {
    expect(validateRoster({ players: ['A'] })).toContain('season.slug is required');
  });

  it('requires a non-empty player list', () => {
    const errs = validateRoster({ season: { slug: 'x' }, players: [] });
    expect(errs).toContain('players[] is required and must not be empty');
  });

  it('rejects blank names', () => {
    const errs = validateRoster({ season: { slug: 'x' }, players: ['Ali', '  '] });
    expect(errs.join()).toMatch(/players\[1\].*non-empty name/);
  });

  it('rejects duplicates regardless of case', () => {
    const errs = validateRoster({ season: { slug: 'x' }, players: ['Ali Zaidi', 'ali zaidi'] });
    expect(errs.join()).toMatch(/duplicate name/);
  });

  it('accepts names that merely look similar', () => {
    const roster = { season: { slug: 'x' }, players: ['Mohammad Zaidi', 'Muhammad Zaidi'] };
    expect(validateRoster(roster)).toEqual([]);
  });
});

describe('toSql', () => {
  const sql = toSql(fall2026);

  it('scopes every insert to the named season', () => {
    expect(sql).toContain('INSERT INTO players (season_id, name)');
    expect(sql).toContain("WHERE season.slug = 'fall2026'");
    expect(sql).toContain('SELECT season.id, incoming.name');
  });

  it('skips players already in that season, so it can be re-run', () => {
    expect(sql).toContain('AND NOT EXISTS');
    expect(sql).toContain('lower(existing.name) = lower(incoming.name)');
    expect(sql).toContain('existing.season_id = season.id');
  });

  it('emits one VALUES row per player', () => {
    const rows = sql.slice(sql.indexOf('CROSS JOIN (VALUES'), sql.indexOf(') AS incoming'));
    expect(rows.split('\n').filter(l => l.trim().startsWith('('))).toHaveLength(42);
  });

  it('anchors the column type on the first row only', () => {
    expect(sql.match(/::TEXT/g)).toHaveLength(1);
  });

  it('escapes single quotes in names', () => {
    const sqlWithQuote = toSql({ season: { slug: 's' }, players: ["Sayyid O'Hara"] });
    expect(sqlWithQuote).toContain("('Sayyid O''Hara'::TEXT)");
  });

  it('ends with a confirmation count for that season', () => {
    expect(sql.trimEnd().endsWith("WHERE s.slug = 'fall2026';")).toBe(true);
    expect(sql).toContain('count(*) AS players_in_fall2026');
  });

  it('never references another season or writes another table', () => {
    expect(sql).not.toMatch(/spring2026/);
    expect(sql).not.toMatch(/INSERT INTO (?!players)/);
    expect(sql).not.toMatch(/\b(UPDATE|DELETE|DROP|ALTER)\b/);
  });
});
