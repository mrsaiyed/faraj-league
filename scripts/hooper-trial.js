/**
 * Try Hooper (developer.hooper.gg) on one of the league's game videos: keep
 * only game time, send it to Hooper with both teams' rosters, wait for the
 * highlight clips, and write a report that grades Hooper's box score against
 * the one the live tracker recorded.
 *
 *   node scripts/hooper-trial.js "https://www.youtube.com/watch?v=OPlPbWsH-bQ" --keep 5:00-15:00
 *   node scripts/hooper-trial.js "https://www.youtube.com/watch?v=OPlPbWsH-bQ" --keep 5:00-15:00 --yes
 *   node scripts/hooper-trial.js game.mp4 --game "Mujahideen vs Dukhaan 10/10" --keep 1:10-24:40,31:00-55:20 --yes
 *
 * The source is a YouTube link (downloaded with yt-dlp, at most 1080p) or a
 * video file. `--keep` lists the stretches that are game time, as YouTube
 * shows them; leave out warm-ups, half time and long stoppages. Shots taken
 * in a gap (a half-time shootaround) would come back as highlights and count
 * in Hooper's box score. Without `--keep` the whole video is sent.
 *
 * The game is found from the video's title ("Ansar vs Nasr 10/10", as the
 * channel names them) or from `--game`, which takes that format or a game id.
 *
 * Nothing is spent without `--yes`: a run without it downloads, cuts and
 * prints what it would send and what it would cost, then stops. With it, the
 * cut video is uploaded and processed (minutes to an hour). Interrupting the
 * wait is safe; the same command again picks the session back up from
 * hooper-runs/<game>/state.json rather than paying twice.
 *
 * Needs: HOOPER_API_KEY in .env (an hk_prod_ key from Hooper), ffmpeg and
 * ffprobe, and yt-dlp for a YouTube source. YouTube refuses downloads from
 * cloud servers, so run this on your own computer.
 */
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { config } from '../js/config.js';
import {
  buildRosters, compareBoxScores, concatScript, findGame, formatTimestamp,
  keptSeconds, parseGameTitle, parseKeepRanges, toSourceTime,
} from '../lib/hooper.js';

const HOOPER_BASE = process.env.HOOPER_API_BASE || 'https://api.hooper.gg';
const DEFAULT_RATE_CENTS_PER_HOUR = 720; // Hooper's standard rate; the real one comes from /v1/balance
const POLL_MS = 30_000;
const MAX_BYTES = 10 * 1024 ** 3;

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = { yes: false };
  const rest = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--yes') opts.yes = true;
    else if (a === '--keep' || a === '--game' || a === '--out') opts[a.slice(2)] = args[++i];
    else if (a.startsWith('--')) fail(`Unknown option ${a}`);
    else rest.push(a);
  }
  if (rest.length !== 1) {
    fail('Usage: node scripts/hooper-trial.js <youtube-url | video file> [--keep 1:10-24:40,31:00-55:20] [--game "Ansar vs Nasr 10/10" | <game id>] [--yes]');
  }
  opts.source = rest[0];
  try {
    opts.ranges = opts.keep ? parseKeepRanges(opts.keep) : null;
  } catch (err) {
    fail(`--keep: ${err.message}`);
  }
  return opts;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

/** Stop on purpose, with nothing wrong (a dry run). */
function finish(message) {
  console.log(message);
  process.exit(0);
}

/** Run a command, streaming its output; throws on a non-zero exit. */
function run(cmd, args) {
  return new Promise((done, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit' });
    child.on('error', err => reject(err.code === 'ENOENT' ? new Error(`${cmd} is not installed`) : err));
    child.on('exit', code => (code === 0 ? done() : reject(new Error(`${cmd} exited with ${code}`))));
  });
}

/** Run a command and return its stdout; throws on a non-zero exit. */
function capture(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  if (r.error) throw r.error.code === 'ENOENT' ? new Error(`${cmd} is not installed`) : r.error;
  if (r.status !== 0) throw new Error(`${cmd} failed: ${r.stderr.trim().split('\n').pop()}`);
  return r.stdout;
}

const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dollars = (cents) => `$${(cents / 100).toFixed(2)}`;

// ---- source ---------------------------------------------------------------

/** Metadata for the source, and where its run lives. */
function describeSource(source) {
  if (/^https?:\/\//.test(source)) {
    const [id, title] = capture('yt-dlp', ['--skip-download', '--no-warnings', '--print', '%(id)s\t%(title)s', source])
      .trim().split('\t');
    return { youtubeId: id, title, slug: slugify(title || id) };
  }
  if (!existsSync(source)) fail(`No such file: ${source}`);
  const title = basename(source, extname(source));
  return { youtubeId: null, title, slug: slugify(title) };
}

async function download(source, outDir) {
  const file = join(outDir, 'source.mp4');
  if (existsSync(file)) return file;
  console.log('Downloading from YouTube (1080p at most, as Hooper requires)…');
  await run('yt-dlp', [
    '-f', 'bv*[height<=1080][vcodec^=avc1]+ba[ext=m4a]/b[height<=1080][ext=mp4]/bv*[height<=1080]+ba',
    '--merge-output-format', 'mp4', '-o', file, source,
  ]);
  return file;
}

function probe(file) {
  const info = JSON.parse(capture('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,codec_name:format=duration', '-of', 'json', file,
  ]));
  const v = info.streams?.[0] || {};
  return { width: v.width, height: v.height, codec: v.codec_name, duration: Number(info.format?.duration) };
}

/**
 * The file to send: the kept stretches joined, scaled down to 1080p if the
 * source is bigger (Hooper refuses anything larger). With nothing to cut or
 * scale, the source itself.
 */
async function prepareVideo(file, ranges, info, outDir) {
  const landscape = info.width >= info.height;
  const [maxW, maxH] = landscape ? [1920, 1080] : [1080, 1920];
  const tooBig = info.width > maxW || info.height > maxH;
  if (!ranges && !tooBig) return file;

  const out = join(outDir, ranges ? `cut-${slugify(ranges.map(r => `${r.start}-${r.end}`).join('_'))}.mp4` : 'scaled.mp4');
  if (existsSync(out)) return out;
  const input = [];
  if (ranges) {
    const list = join(outDir, 'keep.txt');
    writeFileSync(list, concatScript(resolve(file), ranges));
    input.push('-f', 'concat', '-safe', '0', '-i', list);
  } else {
    input.push('-i', file);
  }
  // Stream copy cuts on the nearest keyframe, a second or two either side of
  // each range, which is fine here; scaling has to re-encode anyway.
  const codec = tooBig
    ? ['-vf', `scale=${maxW}:${maxH}:force_original_aspect_ratio=decrease:force_divisible_by=2`,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-c:a', 'aac']
    : ['-c', 'copy', '-avoid_negative_ts', 'make_zero'];
  console.log(tooBig ? `Scaling ${info.width}x${info.height} down to 1080p…` : 'Cutting out the gaps…');
  await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-stats', '-y', ...input, ...codec, '-movflags', '+faststart', out]);
  return out;
}

// ---- league data ----------------------------------------------------------

async function loadLeague(gameRef, title) {
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL || config.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY || config.SUPABASE_ANON_KEY,
    { auth: { persistSession: false } },
  );
  const [teamsRes, gamesRes] = await Promise.all([
    supabase.from('teams').select('id, name'),
    supabase.from('games').select('id, home_team_id, away_team_id, home_score, away_score, status, scheduled_at'),
  ]);
  if (teamsRes.error || gamesRes.error) throw new Error(`Supabase: ${(teamsRes.error || gamesRes.error).message}`);
  const teams = teamsRes.data;
  const game = /^[0-9a-f-]{36}$/i.test(gameRef || '')
    ? gamesRes.data.find(g => g.id === gameRef)
    : findGame(gamesRes.data, teams, parseGameTitle(gameRef || title));
  if (!game) return null;

  const home = teams.find(t => t.id === game.home_team_id);
  const away = teams.find(t => t.id === game.away_team_id);
  const [rostersRes, statsRes] = await Promise.all([
    supabase.from('rosters').select('team_id, players(id, name, jersey_number)')
      .in('team_id', [home.id, away.id]).order('sort_order', { ascending: true }),
    supabase.from('game_stat_values').select('player_id, value, stat_definitions(slug)').eq('game_id', game.id),
  ]);
  if (rostersRes.error) throw new Error(`Supabase: ${rostersRes.error.message}`);
  const playersByTeam = {};
  for (const r of rostersRes.data) {
    if (r.players) (playersByTeam[r.team_id] ||= []).push(r.players);
  }
  const ourPoints = {};
  for (const s of statsRes.data || []) {
    if (s.stat_definitions?.slug === 'points') ourPoints[s.player_id] = Number(s.value) || 0;
  }
  return { game, home, away, playersByTeam, ourPoints };
}

// ---- Hooper ---------------------------------------------------------------

async function hooper(path, { method = 'GET', body, headers = {} } = {}) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(new URL(path, HOOPER_BASE), {
      method,
      headers: {
        Authorization: `Bearer ${process.env.HOOPER_API_KEY}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => null);
    if (res.status === 429 && attempt < 3) {
      await sleep(1000 * (Number(res.headers.get('retry-after')) || 10));
      continue;
    }
    if (!res.ok) {
      const e = json?.error || {};
      throw new Error(`Hooper ${method} ${path} → ${res.status} ${e.code || ''}: ${e.message || ''}`
        + `${e.param ? ` (param ${e.param})` : ''} [Request-Id: ${res.headers.get('request-id') || '?'}]`);
    }
    return { json, headers: res.headers };
  }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function upload(file) {
  const size = statSync(file).size;
  const { json: up } = await hooper('/v1/uploads', { method: 'POST', body: { content_type: 'video/mp4', size } });
  let sent = 0;
  let shown = -1;
  const progress = new Transform({
    transform(chunk, _enc, next) {
      sent += chunk.length;
      const pct = Math.floor((sent / size) * 20) * 5;
      if (pct !== shown) {
        shown = pct;
        process.stdout.write(`\rUploading… ${pct}%`);
      }
      next(null, chunk);
    },
  });
  const res = await fetch(up.upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(size) },
    body: Readable.toWeb(createReadStream(file).pipe(progress)),
    duplex: 'half',
  });
  process.stdout.write('\n');
  if (!res.ok) throw new Error(`Upload failed: ${res.status} ${await res.text()}`);
  return up.id;
}

/** Every item of one of a session's lists; embedded lists stop at 100. */
async function fetchAll(list) {
  if (!list?.has_more) return list?.data || [];
  const items = [];
  for (let offset = 0; ; offset += 250) {
    const { json } = await hooper(`${list.url}?limit=250&offset=${offset}`);
    items.push(...json.data);
    if (!json.has_more) return items;
  }
}

async function waitForSession(id) {
  let last = '';
  for (;;) {
    const { json: session } = await hooper(`/v1/sessions/${id}`);
    if (session.status !== last) {
      last = session.status;
      console.log(`${new Date().toLocaleTimeString()}  ${id}: ${session.status}`);
    }
    if (session.status === 'processed' || session.status === 'failed') return session;
    await sleep(POLL_MS);
  }
}

// ---- report ---------------------------------------------------------------

function writeReport(outDir, { title, youtubeId, ranges, session, highlights, shots, league }) {
  const playersById = new Map(session.players.data.map(p => [p.id, p]));
  const shotsById = new Map(shots.map(s => [s.id, s]));
  const ourPlayers = league
    ? [league.home, league.away].flatMap(t => (league.playersByTeam[t.id] || []).map(p => ({ ...p, teamName: t.name })))
    : [];
  const { rows, unnamed } = compareBoxScores(session.players.data, ourPlayers, league?.ourPoints || {});
  const wholeGame = !ranges;

  const sourceLink = (t) => {
    const at = Math.floor(toSourceTime(t, ranges));
    return youtubeId
      ? `<a href="https://www.youtube.com/watch?v=${esc(youtubeId)}&t=${at}s">${formatTimestamp(at)}</a>`
      : formatTimestamp(at);
  };
  const playerLabel = (id) => {
    const p = playersById.get(id);
    if (!p) return 'Unknown player';
    return [p.jersey && `#${p.jersey}`, p.metadata?.player_id ? p.name : null, p.team_name].filter(Boolean).join(' ');
  };

  const clips = highlights
    .map(h => ({ h, shot: shotsById.get(h.shot) }))
    .sort((a, b) => (a.shot?.start_seconds ?? 0) - (b.shot?.start_seconds ?? 0))
    .map(({ h, shot }) => `
      <figure class="${h.is_lowlight ? 'low' : ''}">
        <video controls preload="none" playsinline poster="${esc(h.preview?.horizontal || h.preview?.default)}"
          src="${esc(h.video?.horizontal || h.video?.default)}"></video>
        <figcaption>${esc(playerLabel(h.player))}<br>
          ${shot ? `${shot.made ? 'Made' : 'Missed'} ${shot.is_free_throw ? 'FT' : shot.is_three_point ? '3PT' : '2PT'} · ${sourceLink(shot.start_seconds)}` : ''}
          ${h.is_lowlight ? ' · lowlight' : ''}</figcaption>
      </figure>`).join('');

  const table = rows.map(r => `<tr${r.hooper == null ? ' class="miss"' : ''}><td>${esc(r.name)}</td><td>${esc(r.team)}</td>
    <td>${r.jersey ?? '–'}</td><td>${r.ours}</td><td>${r.hooper ?? 'not found'}</td></tr>`).join('')
    + unnamed.map(u => `<tr class="miss"><td>Unnamed ${esc(u.label)}</td><td>${esc(u.team)}</td><td></td><td></td><td>${u.hooper}</td></tr>`).join('');

  const named = rows.filter(r => r.hooper != null).length;
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Hooper trial · ${esc(title)}</title>
<style>
  body{font:15px/1.4 system-ui,sans-serif;margin:0 auto;padding:16px;max-width:1200px;background:#0d1b2a;color:#e8eef4}
  a{color:#7fd4c8} table{border-collapse:collapse;margin:8px 0 24px} td,th{padding:4px 10px;border-bottom:1px solid #22384f;text-align:left}
  tr.miss td{color:#f0b35a} .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px}
  figure{margin:0} figure.low{opacity:.6} video{width:100%;aspect-ratio:16/9;background:#000;border-radius:6px}
  figcaption{font-size:13px;margin-top:4px}
</style>
<h1>${esc(title)}</h1>
<p>Session ${esc(session.id)} · ${esc(session.status)} · ${formatTimestamp(session.duration_seconds || 0)} of video sent
 · cost ${dollars(session.cost_cents || 0)} · ${highlights.length} clips · ${shots.length} shots
 ${ranges ? `· kept ${esc(ranges.map(r => `${formatTimestamp(r.start)}–${formatTimestamp(r.end)}`).join(', '))}` : ''}</p>
${league ? `<h2>Box score: tracker vs Hooper (points)</h2>
<p>${named} of ${rows.length} rostered players named by Hooper.
${wholeGame ? `Final score ${esc(league.home.name)} ${league.game.home_score ?? '?'} – ${league.game.away_score ?? '?'} ${esc(league.away.name)}.`
    : 'Only part of the game was sent, so the tracker’s full-game points will be higher; compare who scored, not totals.'}</p>
<table><tr><th>Player</th><th>Team</th><th>#</th><th>Tracker</th><th>Hooper</th></tr>${table}</table>` : ''}
<h2>Clips</h2><p>Times are in the original video${youtubeId ? ' and link to that moment on YouTube' : ''}.</p>
<div class="grid">${clips}</div>`;
  const file = join(outDir, 'report.html');
  writeFileSync(file, html);
  return { file, rows, unnamed };
}

// ---- main -----------------------------------------------------------------

async function main() {
  const { default: dotenv } = await import('dotenv');
  dotenv.config();
  const opts = parseArgs(process.argv);

  const meta = describeSource(opts.source);
  const outDir = resolve(opts.out || join('hooper-runs', meta.slug));
  mkdirSync(outDir, { recursive: true });
  const statePath = join(outDir, 'state.json');
  const saved = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {};

  const league = await loadLeague(opts.game, meta.title);
  if (league) {
    console.log(`Game: ${league.home.name} (home) vs ${league.away.name} (away), ${league.game.scheduled_at}`);
  } else {
    console.log(`No game found for "${opts.game || meta.title}"; players will come back unnamed. Use --game to name it.`);
  }

  const file = meta.youtubeId ? await download(opts.source, outDir) : opts.source;
  const info = probe(file);
  console.log(`Video: ${info.width}x${info.height} ${info.codec}, ${formatTimestamp(info.duration)}`);
  const past = opts.ranges?.find(r => r.end > info.duration + 1);
  if (past) fail(`--keep runs to ${formatTimestamp(past.end)} but the video is ${formatTimestamp(info.duration)} long`);
  if (!opts.ranges) console.log('No --keep given: sending the whole video, warm-ups and half time included.');

  const sendFile = await prepareVideo(file, opts.ranges, info, outDir);
  const size = statSync(sendFile).size;
  if (size > MAX_BYTES) fail(`${sendFile} is ${(size / 1024 ** 3).toFixed(1)} GB; Hooper takes 10 GB at most`);
  const seconds = opts.ranges ? keptSeconds(opts.ranges) : info.duration;

  const { rosters, skipped } = league
    ? buildRosters(league.home, league.away, league.playersByTeam)
    : { rosters: null, skipped: [] };
  for (const s of skipped) console.log(`  Not on the roster sent to Hooper: ${s.name} (${s.team}): ${s.reason}`);

  const request = {
    metadata: {
      source: meta.youtubeId ? `youtube:${meta.youtubeId}` : basename(opts.source),
      ...(league ? { game_id: league.game.id } : {}),
      ...(opts.keep ? { keep: opts.keep.slice(0, 500) } : {}),
    },
    options: {
      session_type: '5v5',
      session_mode: 'game',
      // Filmed from the sideline by hand, following the play: the hoop moves
      // around the frame, and "stationary" would only look in its top middle.
      camera_setup: 'panning',
      jerseys: 'enabled',
      // A side with a roster is named by it; naming it here too is refused.
      ...(league && !rosters?.recording ? { recording_team_name: league.home.name } : {}),
      ...(league && !rosters?.opponent ? { opponent_team_name: league.away.name } : {}),
    },
    ...(rosters ? { rosters } : {}),
  };

  if (!process.env.HOOPER_API_KEY) {
    console.log(`\nWould send ${formatTimestamp(seconds)} of video (${(size / 1024 ** 2).toFixed(0)} MB), about ${dollars(Math.ceil(seconds * DEFAULT_RATE_CENTS_PER_HOUR / 3600))} at the standard rate.`);
    console.log(JSON.stringify(request, null, 2));
    finish('\nSet HOOPER_API_KEY in .env (an hk_prod_ key from Hooper) to go further.');
  }

  // The same video and request reuse the earlier upload and session, so a
  // re-run after an interruption never uploads or pays twice.
  const fingerprint = createHash('sha256').update(JSON.stringify([size, opts.keep || '', request])).digest('hex').slice(0, 32);
  const state = saved.fingerprint === fingerprint ? saved : { fingerprint };
  const save = () => writeFileSync(statePath, JSON.stringify(state, null, 2));

  if (!state.sessionId) {
    const { json: balance } = await hooper('/v1/balance');
    const cost = Math.ceil(seconds * balance.rate_cents_per_hour / 3600);
    console.log(`\nSending ${formatTimestamp(seconds)} of video: about ${dollars(cost)} `
      + `(${dollars(balance.rate_cents_per_hour)}/hr; ${dollars(balance.available_cents)} available).`);
    if (!opts.yes) {
      console.log(JSON.stringify(request, null, 2));
      finish('\nNothing sent. Run again with --yes to upload and process it.');
    }
    if (!state.uploadId) {
      state.uploadId = await upload(sendFile);
      save();
    }
    const body = { source: { type: 'upload', upload_id: state.uploadId }, ...request };
    const { json: session, headers } = await hooper('/v1/sessions', {
      method: 'POST', body, headers: { 'Idempotency-Key': `faraj-trial-${fingerprint}` },
    });
    state.sessionId = session.id;
    save();
    console.log(`Submitted ${session.id}; held ${dollars(Number(headers.get('x-hooper-cost-cents')) || 0)}.`);
    console.log('Processing takes minutes to an hour. Ctrl-C is safe: run the same command again to pick it back up.');
  }

  const session = await waitForSession(state.sessionId);
  if (session.status === 'failed') {
    writeFileSync(join(outDir, 'session.json'), JSON.stringify(session, null, 2));
    fail(`Hooper could not process it: ${session.error?.code}: ${session.error?.message || ''} (nothing was charged)`);
  }
  const [highlights, shots] = await Promise.all([fetchAll(session.highlights), fetchAll(session.shots)]);
  writeFileSync(join(outDir, 'session.json'), JSON.stringify({ ...session, highlights: { ...session.highlights, data: highlights }, shots: { ...session.shots, data: shots } }, null, 2));
  const report = writeReport(outDir, { title: meta.title, youtubeId: meta.youtubeId, ranges: opts.ranges, session, highlights, shots, league });

  console.log(`\n${highlights.length} clips, ${shots.length} shots, ${dollars(session.cost_cents || 0)} charged.`);
  if (report.rows.length) {
    console.table(report.rows.map(r => ({ player: r.name, team: r.team, '#': r.jersey ?? '', tracker: r.ours, hooper: r.hooper ?? 'not found' })));
  }
  if (report.unnamed.length) console.log(`${report.unnamed.length} more players Hooper saw but could not name.`);
  console.log(`Report: ${report.file}`);
}

const invokedDirectly = process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop());
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}
