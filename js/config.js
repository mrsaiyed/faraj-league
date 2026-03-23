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
  DB: { teams: [...DEFAULT_TEAMS], scores: [], awards: [], stats: [], mediaItems: [], mediaSlots: {}, contentBlocks: {} },
  SP1: '[SPONSOR 1 NAME AND LOGO]',
  SP1_LOGO: null,
  SP1_DESC: '',
  SP2A: '[Sponsor 2A]',
  SP2A_LOGO: null,
  SP2A_DESC: '',
  SP2B: '[Sponsor 2B]',
  SP2B_LOGO: null,
  SP2B_DESC: '',
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

/**
 * Base path for asset URLs. On GitHub Pages project sites (e.g. username.github.io/faraj-league/),
 * returns '/faraj-league' so images resolve correctly. Otherwise returns ''.
 */
export function getBasePath() {
  const p = (typeof location !== 'undefined' && location.pathname) || '';
  const parts = p.split('/').filter(Boolean);
  if (parts.length > 0 && typeof location !== 'undefined' && location.hostname.includes('github.io')) {
    return '/' + parts[0];
  }
  return '';
}

/** Get list of conferences from content_blocks (conferences_layout) or default Mecca/Medina */
export function getConferences() {
  const blocks = config.DB?.contentBlocks || {};
  try {
    const parsed = JSON.parse(blocks.conferences_layout || '{}');
    if (parsed?.conferences?.length) {
      return parsed.conferences.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    }
  } catch (_) {}
  return [
    { id: 'Mecca', name: (blocks.conf_name_mecca || '').trim() || 'Mecca', sort_order: 0 },
    { id: 'Medina', name: (blocks.conf_name_medina || '').trim() || 'Medina', sort_order: 1 },
  ];
}

/** Display name for conference (from conferences_layout or legacy conf_name_mecca/medina) */
export function confShortLabel(conf) {
  if (conf === '__unassigned__') return 'Unassigned';
  const list = getConferences();
  const c = list.find(x => (x.id || x.name || '').toString() === (conf || '').toString());
  return c ? (c.name || c.id || conf) : (conf ? 'Unassigned' : conf);
}

/** Full label for conference - uses display_label when set, else builds from sponsor + name */
export function confLabel(conf) {
  if (conf === '__unassigned__') return 'Unassigned Teams';
  const list = getConferences();
  const c = list.find(x => (x.id || x.name || '').toString() === (conf || '').toString());
  if (!c) return conf ? 'Unassigned — assign to a conference' : (conf || '');
  const displayLabel = (c?.display_label || '').trim();
  if (displayLabel) return displayLabel;
  const { SP2A, SP2B } = config;
  const name = confShortLabel(conf);
  const idx = list.findIndex(x => (x.id || x.name || '').toString() === (conf || '').toString());
  const sponsor = idx === 0 ? SP2A : idx === 1 ? SP2B : null;
  return sponsor ? `${sponsor} ${name} Conference` : `${name} Conference`;
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
