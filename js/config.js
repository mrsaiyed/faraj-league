/**
 * Faraj League config — API, sponsors, runtime state.
 * All modules mutate config properties (ES modules make imports read-only).
 * Phase 3: SUPABASE_URL and SUPABASE_ANON_KEY can be overridden from env.
 */

const DEFAULT_TEAMS = [
  { id: '1', name: 'Team Alpha', conf: 'Mecca', captain: 'Captain 1', players: ['Player 1', 'Player 2', 'Player 3', 'Player 4', 'Player 5', 'Player 6', 'Player 7'] },
  { id: '2', name: 'Team Beta', conf: 'Mecca', captain: 'Captain 2', players: ['Player 1', 'Player 2', 'Player 3', 'Player 4', 'Player 5', 'Player 6', 'Player 7'] },
  { id: '3', name: 'Team Gamma', conf: 'Mecca', captain: 'Captain 3', players: ['Player 1', 'Player 2', 'Player 3', 'Player 4', 'Player 5', 'Player 6', 'Player 7'] },
  { id: '4', name: 'Team Delta', conf: 'Medina', captain: 'Captain 4', players: ['Player 1', 'Player 2', 'Player 3', 'Player 4', 'Player 5', 'Player 6', 'Player 7'] },
  { id: '5', name: 'Team Epsilon', conf: 'Medina', captain: 'Captain 5', players: ['Player 1', 'Player 2', 'Player 3', 'Player 4', 'Player 5', 'Player 6', 'Player 7'] },
  { id: '6', name: 'Team Zeta', conf: 'Medina', captain: 'Captain 6', players: ['Player 1', 'Player 2', 'Player 3', 'Player 4', 'Player 5', 'Player 6', 'Player 7'] },
];

export const config = {
  // API — Phase 3: use import.meta.env or similar for SUPABASE_URL, SUPABASE_ANON_KEY
  SUPABASE_URL: 'https://ruwihsxedobbxqavrjhl.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ1d2loc3hlZG9iYnhxYXZyamhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwNTg3NjUsImV4cCI6MjA4OTYzNDc2NX0.wxQEfLBQOKPnShd8wje4Zbu3myR-JZbjcBaZekKOApg',
  DB: { teams: [...DEFAULT_TEAMS], scores: [], awards: [], stats: [] },
  SP1: '[SPONSOR 1 NAME AND LOGO]',
  SP1_LOGO: null,
  SP2A: '[Sponsor 2A]',
  SP2B: '[Sponsor 2B]',
  SP3A: '[Sponsor 3A]',
  SP3B: '[Sponsor 3B]',
  SP3C: '[Sponsor 3C]',
  TOTAL_WEEKS: 8,
  CURRENT_WEEK: 1,
  currentSeasonLabel: 'Spring 2026',
  currentSeasonIsCurrent: true,
  currentSeasonSlug: 'spring2026',
  DEFAULT_TEAMS,
};

export function confLabel(conf) {
  const { SP2A, SP2B } = config;
  if (conf === 'Mecca') return SP2A ? `${SP2A} Mecca Conference` : 'Mecca Conference';
  if (conf === 'Medina') return SP2B ? `${SP2B} Medina Conference` : 'Medina Conference';
  return conf + ' Conference';
}

export function motmLabel(game) {
  const { SP3A, SP3B, SP3C } = config;
  const sp = [SP3A, SP3B, SP3C][game - 1];
  return sp ? `${sp} Man of the Match · Game ${game}` : `Man of the Match · Game ${game}`;
}

export function akhlaqLabel(week) {
  const { SP2B } = config;
  return SP2B ? `${SP2B} Akhlaq Award — Week ${week}` : `Akhlaq Award — Week ${week}`;
}

export function statsTitle() {
  const { SP2A } = config;
  return SP2A ? `${SP2A} Player Stats` : 'Player Stats';
}
