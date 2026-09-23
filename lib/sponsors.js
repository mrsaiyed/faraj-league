/**
 * Sponsor slots — pure, no DOM.
 *
 * Sponsors are per-season rows in `sponsors`. A season with no row for a slot
 * has no sponsor for it: the site must show a neutral placeholder rather than
 * fall back to whatever the last league deal was, and switching seasons must
 * not carry one season's sponsor into another.
 */

/** The three branded slots, in render order. */
export const SPONSOR_SLOTS = [
  { key: 'SP1', type: 'title', placeholder: '[SPONSOR 1 NAME AND LOGO]', brandClass: 'brand-sponsor-title' },
  { key: 'SP2A', type: 'conference_mecca', placeholder: '[Sponsor 2A]', brandClass: 'brand-sponsor-a' },
  { key: 'SP2B', type: 'conference_medina', placeholder: '[Sponsor 2B]', brandClass: 'brand-sponsor-b' },
];

/** @returns {boolean} true when a slot holds a real name rather than its placeholder */
export function hasSponsor(value, placeholder) {
  const v = String(value ?? '').trim();
  return v !== '' && v !== placeholder;
}

/**
 * Display name for a slot, or '' when nothing is set.
 * @param {string|null} value
 * @param {string} placeholder
 */
export function sponsorName(value, placeholder) {
  return hasSponsor(value, placeholder) ? String(value).trim() : '';
}

/**
 * Build a complete override set from a season's sponsor rows.
 *
 * Every field is always present — null/'' for a slot the season has no row for
 * — so applying it resets cleanly instead of leaving the previous season's
 * sponsor in place.
 *
 * @param {Array<{type: string, name?: string, logo_url?: string, label?: string}>} rows
 * @returns {object} { SP1, SP1_LOGO, SP1_DESC, SP2A, ... } with no gaps
 */
export function sponsorOverridesFrom(rows) {
  const out = {};
  SPONSOR_SLOTS.forEach(({ key }) => {
    out[key] = null;
    out[`${key}_LOGO`] = null;
    out[`${key}_DESC`] = '';
  });

  (rows || []).forEach(row => {
    const slot = SPONSOR_SLOTS.find(s => s.type === row?.type);
    if (!slot) return;
    const name = String(row.name ?? '').trim();
    out[slot.key] = name === '' ? null : name;
    out[`${slot.key}_LOGO`] = row.logo_url || null;
    out[`${slot.key}_DESC`] = row.label ?? '';
  });

  return out;
}

/** Escape a string for use inside a regular expression. */
const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Wrap each configured sponsor name in its slot's brand span.
 *
 * Driven by the season's own sponsor names rather than a hard-coded brand list,
 * so a season with no sponsors highlights nothing and no past sponsor's name
 * survives in the code.
 *
 * @param {string} escapedText text already escaped for HTML
 * @param {Array<{ name: string, brandClass: string }>} brands
 * @returns {string} HTML
 */
export function highlightSponsorNames(escapedText, brands) {
  const text = String(escapedText ?? '');
  const ordered = (brands || [])
    .filter(b => b && String(b.name ?? '').trim() !== '')
    // Longest first so the alternation prefers a two-word name over a one-word
    // name that is a prefix of it.
    .sort((a, b) => String(b.name).trim().length - String(a.name).trim().length);
  if (!ordered.length) return text;

  const classFor = new Map(ordered.map(b => [String(b.name).trim().toLowerCase(), b.brandClass]));
  const alternation = ordered.map(b => escapeRe(String(b.name).trim())).join('|');
  // One pass over the original string: replacing name by name would let a
  // later, shorter name match inside a span an earlier one had just inserted.
  const re = new RegExp(`(?<![\\w-])(?:${alternation})(?![\\w-])`, 'gi');
  return text.replace(re, (match) => {
    const cls = classFor.get(match.toLowerCase());
    return cls ? `<span class="${cls}">${match}</span>` : match;
  });
}
