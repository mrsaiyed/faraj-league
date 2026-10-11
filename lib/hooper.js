/**
 * Pure helpers for the Hooper highlights trial (scripts/hooper-trial.js).
 *
 * Hooper (developer.hooper.gg) takes a basketball video and returns a clip for
 * every shot plus a per-player box score. These helpers cover our side of it:
 * the cut list that keeps only game time, mapping a clip back to the YouTube
 * video it came from, the rosters Hooper names players from, and grading its
 * box score against the one the live tracker recorded. No network, no disk.
 */
import { jerseyValue, numberDuplicates } from './jersey.js';

/** '1:02:03', '12:30' or '45' → seconds; NaN when malformed. */
export function parseTimestamp(text) {
  const parts = String(text ?? '').trim().split(':');
  if (parts.length > 3 || parts.some(p => !/^\d+(\.\d+)?$/.test(p))) return NaN;
  // Every field after the first is a two-digit 0–59, as a clock prints it.
  if (parts.slice(1).some(p => Number(p) >= 60)) return NaN;
  return parts.reduce((total, p) => total * 60 + Number(p), 0);
}

/** 3725 → '1:02:05', 95 → '1:35'. */
export function formatTimestamp(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

/**
 * The stretches of a video to keep: '1:12-24:30,31:05-55:40' →
 * [{ start: 72, end: 1470 }, { start: 1865, end: 3340 }]. In order and not
 * overlapping, because they are cut and joined in the order given.
 * @throws {Error} naming the bad range
 */
export function parseKeepRanges(text) {
  const items = String(text ?? '').split(',').map(s => s.trim()).filter(Boolean);
  if (!items.length) throw new Error('No ranges given; expected e.g. 1:12-24:30,31:05-55:40');
  const ranges = items.map((item) => {
    const [from, to, extra] = item.split('-');
    const start = parseTimestamp(from);
    const end = parseTimestamp(to);
    if (extra !== undefined || Number.isNaN(start) || Number.isNaN(end)) {
      throw new Error(`"${item}" is not a range like 1:12-24:30`);
    }
    if (end <= start) throw new Error(`"${item}" ends before it starts`);
    return { start, end };
  });
  ranges.forEach((r, i) => {
    if (i && r.start < ranges[i - 1].end) {
      throw new Error(`"${items[i]}" overlaps or comes before "${items[i - 1]}"`);
    }
  });
  return ranges;
}

/** Total seconds the ranges keep. */
export function keptSeconds(ranges) {
  return ranges.reduce((sum, r) => sum + (r.end - r.start), 0);
}

/**
 * A moment in the cut video → the same moment in the source video, so a clip
 * can be checked against the YouTube original. With no ranges nothing was cut.
 */
export function toSourceTime(t, ranges) {
  if (!ranges?.length) return t;
  let offset = 0;
  for (const r of ranges) {
    const length = r.end - r.start;
    if (t < offset + length) return r.start + (t - offset);
    offset += length;
  }
  const last = ranges[ranges.length - 1];
  return last.end + (t - offset);
}

/**
 * The ffmpeg concat-demuxer script that keeps `ranges` of `file`
 * (`ffmpeg -f concat -safe 0 -i list.txt -c copy out.mp4`).
 */
export function concatScript(file, ranges) {
  const quoted = `'${String(file).replace(/'/g, "'\\''")}'`;
  return ranges
    .map(r => `file ${quoted}\ninpoint ${r.start}\noutpoint ${r.end}\n`)
    .join('');
}

/**
 * The league's YouTube titles name a game: 'Ansar vs Nasr 10/10' →
 * { teams: ['Ansar', 'Nasr'], month: 10, day: 10 }. Their order is not
 * home/away, so it is only used to find the game. Null when it does not parse.
 */
export function parseGameTitle(title) {
  const m = String(title ?? '').match(/^\s*(.+?)\s+vs\.?\s+(.+?)\s+(\d{1,2})\/(\d{1,2})\b/i);
  if (!m) return null;
  return { teams: [m[1].trim(), m[2].trim()], month: Number(m[3]), day: Number(m[4]) };
}

/**
 * The game a parsed title names: those two teams, either way round, on that
 * day in the local time zone. Null unless exactly one game matches.
 * Every season has its own team rows, usually under the same names, so a
 * name stands for all of them and the date picks the season.
 * @param {object[]} games  rows with home_team_id, away_team_id, scheduled_at
 * @param {object[]} teams  rows with id, name
 */
export function findGame(games, teams, parsed) {
  if (!parsed) return null;
  const idsFor = (name) => new Set(teams
    .filter(t => t.name.trim().toLowerCase() === name.toLowerCase())
    .map(t => t.id));
  const [a, b] = parsed.teams.map(idsFor);
  const matches = games.filter((g) => {
    const home = g.home_team_id;
    const away = g.away_team_id;
    const paired = (a.has(home) && b.has(away)) || (a.has(away) && b.has(home));
    if (!paired || !g.scheduled_at) return false;
    const d = new Date(g.scheduled_at);
    return d.getMonth() + 1 === parsed.month && d.getDate() === parsed.day;
  });
  return matches.length === 1 ? matches[0] : null;
}

/**
 * Hooper `rosters` for one game: home is `recording`, away is `opponent`, and
 * each player carries our ids in `metadata` so its box score maps straight
 * back. Hooper matches players by the number it reads off their jersey, so a
 * player without a number cannot be named, and two teammates sharing one make
 * Hooper refuse the whole request — both are left out and reported instead.
 * @param {{ id, name }} home
 * @param {{ id, name }} away
 * @param {{ [teamId]: { id, name, jersey_number }[] }} playersByTeam
 * @returns {{ rosters: object | null, skipped: { team, name, reason }[] }}
 */
export function buildRosters(home, away, playersByTeam) {
  const skipped = [];
  const side = (team) => {
    const players = playersByTeam[team.id] || [];
    const shared = new Set(numberDuplicates(players.map(p => ({ id: p.id, number: p.jersey_number })))
      .flatMap(d => d.ids));
    const named = [];
    for (const p of players) {
      const n = jerseyValue(p.jersey_number);
      const reason = n == null || Number.isNaN(n) ? 'no jersey number'
        : shared.has(p.id) ? `shares #${n} with a teammate`
          : null;
      if (reason) {
        skipped.push({ team: team.name, name: p.name, reason });
        continue;
      }
      named.push({ jersey: String(n), name: String(p.name).slice(0, 50), metadata: { player_id: p.id } });
    }
    return named.length
      ? { name: team.name, metadata: { team_id: team.id }, players: named }
      : null;
  };
  const recording = side(home);
  const opponent = side(away);
  const rosters = {};
  if (recording) rosters.recording = recording;
  if (opponent) rosters.opponent = opponent;
  return { rosters: Object.keys(rosters).length ? rosters : null, skipped };
}

/**
 * Hooper's box score next to ours, one row per player on either roster, then
 * one per player Hooper saw but could not name. Hooper sometimes splits one
 * player in two; both halves carry the same metadata, so they are added up.
 * @param {object[]} hooperPlayers  the session's players.data
 * @param {{ id, name, jersey_number, teamName }[]} ourPlayers
 * @param {{ [playerId]: number }} ourPoints  points the tracker recorded
 * @returns {{ rows: { name, team, jersey, ours, hooper }[], unnamed: { label, team, hooper }[] }}
 */
export function compareBoxScores(hooperPlayers, ourPlayers, ourPoints) {
  const hooperById = new Map();
  const unnamed = [];
  for (const p of hooperPlayers || []) {
    const points = Number(p.stats?.points) || 0;
    const id = p.metadata?.player_id;
    if (id) {
      hooperById.set(id, (hooperById.get(id) || 0) + points);
    } else {
      unnamed.push({
        label: p.jersey ? `#${p.jersey}` : (p.name || p.id),
        team: p.team_name || '?',
        hooper: points,
      });
    }
  }
  const rows = ourPlayers.map(p => ({
    name: p.name,
    team: p.teamName,
    jersey: p.jersey_number ?? null,
    ours: ourPoints[p.id] ?? 0,
    hooper: hooperById.has(p.id) ? hooperById.get(p.id) : null,
  }));
  return { rows, unnamed };
}
