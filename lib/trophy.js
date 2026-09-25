/**
 * The champions trophy — pure data and layout, no DOM, no WebGL.
 *
 * The physical trophy has a two-tier base: the main "Faraj League Champions"
 * plaque on the upper tier and six card slots (two columns, three rows) on
 * the lower tier. The site's 3D version repeats that on all four sides, so
 * it holds 24 champions, filled oldest first: the front's top-left slot, then
 * across and down, then the right side, the back and the left.
 *
 * A card is engraved exactly like the real one:
 *
 *   Jaysh Spring 2026
 *   Captain: Saif Ghori
 *   Adil Abbas Imran Kader
 *   Zaki Rizvi Mohammad Zaidi
 *   Qasim Syed Kumail Naqvi
 *
 * team and season, the captain on his own line, then the rest of the roster
 * two to a line in roster (draft) order.
 */

export const TROPHY_FACES = Object.freeze(['front', 'right', 'back', 'left']);
export const SLOT_COLUMNS = 2;
export const SLOT_ROWS = 3;
export const SLOTS_PER_FACE = SLOT_COLUMNS * SLOT_ROWS;
export const TROPHY_CAPACITY = SLOTS_PER_FACE * TROPHY_FACES.length;

/** Width / height of a card plate, measured off the real trophy. */
export const CARD_ASPECT = 3.15;

/**
 * Extra space between letters, in ems. The real plates are engraved in
 * Futura, which sets a little wider than Jost, its free stand-in; this makes
 * up the difference so line lengths match the real card.
 */
export const CARD_TRACKING = 0.035;

// The same "no champion yet" values the season banner and awards page treat
// as empty, so the trophy never disagrees with them about who won.
const PLACEHOLDER_RE = [/^—\s*$/, /^season in progress$/i, /—\s*in progress$/i];

/** @returns {boolean} true when `champ` names an actual champion */
export function isChampionSet(champ) {
  const v = String(champ ?? '').trim();
  return v !== '' && !PLACEHOLDER_RE.some(re => re.test(v));
}

const norm = (s) => String(s ?? '').trim().toLowerCase();

/**
 * The engraved lines of one card.
 *
 * @param {{ team: string, season: string, captain?: string, players?: string[] }} card
 *   `players` in roster order; the captain may be among them and is left out
 *   of the pairs, since he has his own line.
 * @returns {string[]}
 */
export function cardLines({ team, season, captain = '', players = [] }) {
  const lines = [[team, season].map(s => String(s ?? '').trim()).filter(Boolean).join(' ')];
  const cap = String(captain ?? '').trim();
  if (cap) lines.push(`Captain: ${cap}`);
  const rest = players.map(p => String(p ?? '').trim()).filter(p => p && norm(p) !== norm(cap));
  for (let i = 0; i < rest.length; i += 2) lines.push(rest.slice(i, i + 2).join(' '));
  return lines;
}

/**
 * One card per season that has a champion, oldest season first.
 *
 * The champion is decided the way the rest of the site decides it: the first
 * awards row (by week) with a `champ` value, and only if that value is not a
 * placeholder. The team is looked up by name within that season, since the
 * same name can exist in several seasons with different rosters.
 *
 * @param {{ seasons?: object[], awards?: object[], teams?: object[], rosters?: object[], players?: object[] }} data
 *   raw rows: seasons { id, label, created_at }, awards { season_id, week, champ },
 *   teams { id, season_id, name, captain }, rosters { team_id, player_id, sort_order },
 *   players { id, name }
 * @returns {Array<{ seasonId: string, season: string, team: string, captain: string, players: string[], lines: string[] }>}
 */
export function buildChampionCards({ seasons = [], awards = [], teams = [], rosters = [], players = [] } = {}) {
  const seasonById = new Map(seasons.map(s => [s.id, s]));
  const nameById = new Map(players.map(p => [p.id, p.name]));

  const firstChamp = new Map();
  [...awards]
    .sort((a, b) => (Number(a.week) || 0) - (Number(b.week) || 0))
    .forEach(a => { if (a.champ && !firstChamp.has(a.season_id)) firstChamp.set(a.season_id, a.champ); });

  const cards = [];
  firstChamp.forEach((champ, seasonId) => {
    const season = seasonById.get(seasonId);
    if (!season || !isChampionSet(champ)) return;
    const team = teams.find(t => t.season_id === seasonId && norm(t.name) === norm(champ));
    const roster = team
      ? rosters.filter(r => r.team_id === team.id).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      : [];
    const names = roster.map(r => nameById.get(r.player_id)).filter(Boolean);
    const captain = String(team?.captain ?? '').trim();
    const card = { team: String(team?.name ?? champ).trim(), season: String(season.label ?? '').trim(), captain, players: names };
    cards.push({
      seasonId,
      createdAt: season.created_at || '',
      ...card,
      players: names.filter(n => norm(n) !== norm(captain)),
      lines: cardLines(card),
    });
  });

  return cards
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || a.season.localeCompare(b.season))
    .map(({ createdAt, ...card }) => card);
}

/**
 * The reigning champions: the newest season's card. `cards` come oldest first,
 * as buildChampionCards returns them.
 * @param {Array<object>|null|undefined} cards
 * @returns {object|null} null until some season has a champion
 */
export function reigningChampion(cards) {
  return Array.isArray(cards) && cards.length ? cards[cards.length - 1] : null;
}

/**
 * Where the `index`th champion (0 = oldest) sits on the trophy.
 * @returns {{ face: string, faceIndex: number, row: number, col: number }|null} null once the trophy is full
 */
export function slotForIndex(index) {
  if (!Number.isInteger(index) || index < 0 || index >= TROPHY_CAPACITY) return null;
  const faceIndex = Math.floor(index / SLOTS_PER_FACE);
  const within = index % SLOTS_PER_FACE;
  return { face: TROPHY_FACES[faceIndex], faceIndex, row: Math.floor(within / SLOT_COLUMNS), col: within % SLOT_COLUMNS };
}

/**
 * Type size and spacing for a card, as fractions of the plate's height, so
 * the 3D texture and the enlarged HTML card lay out identically.
 *
 * Measured off a photo of the real card: the type is 16.4% of the plate's
 * height on a 17.9% line pitch, so five lines fill it with about 5% to spare
 * top and bottom. More lines (a bigger roster) shrink to fit the same block;
 * a line too long for the plate shrinks everything so it fits with a little
 * side margin.
 *
 * @param {string[]} lines
 * @param {(text: string) => number} measure width of `text` at a font size of
 *   1, without tracking (CARD_TRACKING is added here)
 * @returns {{ fontSize: number, lineHeight: number, top: number }} `top` is the first line box's top
 */
export function layoutCard(lines, measure) {
  const n = Math.max(1, lines.length);
  const BASE_FONT = 0.164, BASE_PITCH = 0.179, BLOCK = 0.895, MAX_WIDTH = CARD_ASPECT * 0.9;
  let lineHeight = Math.min(BASE_PITCH, BLOCK / n);
  let fontSize = lineHeight * (BASE_FONT / BASE_PITCH);
  const tracked = (l) => (Number(measure(l)) || 0) + CARD_TRACKING * Math.max(0, String(l).length - 1);
  const widest = Math.max(0, ...lines.map(tracked));
  if (widest * fontSize > MAX_WIDTH) {
    const k = MAX_WIDTH / (widest * fontSize);
    fontSize *= k;
    lineHeight *= k;
  }
  return { fontSize, lineHeight, top: (1 - n * lineHeight) / 2 };
}
