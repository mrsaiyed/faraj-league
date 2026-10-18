/**
 * League rules — admin only. The settings that differ from one league to the
 * next: the standings' tiebreakers, team timeouts, the foul limits and the
 * length of a half and an overtime.
 *
 * Kept as JSON text in `content_blocks.game_rules`: timeouts, fouls and the
 * clock in the league's row (no season), for every season; the tiebreakers in
 * the row of the season picked in the admin, so changing them never re-ranks
 * a season already played. Written through admin-content and read back;
 * `seasonRules()` in `lib/game-rules.js` puts the two together when a season
 * loads. Edited on the admin's Rules page.
 */

import {
  gameRules, splitRules, timeoutRuleText, carryText, ruleProblems, RULE_LIMITS, TIMEOUT_SCOPES, GAME_RULES_KEY,
} from '../../lib/game-rules.js';
import { TIEBREAKERS, tiebreakerList, tiebreakerText, rankTeams, calcStandings } from '../../lib/standings.js';

export const RULES_KEY = GAME_RULES_KEY;

/** admin-content skips a key it does not know — and still answers ok — until it is redeployed. */
export const RULES_NEED_DEPLOY =
  'Not saved: the admin-content function needs redeploying before it will keep league rules (npx supabase functions deploy admin-content).';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Save the rules and confirm the database holds them: the tiebreakers to the
 * season's row, everything else to the league's — one request, both rows.
 * With no season (nothing loaded), the tiebreakers go in the league's row.
 *
 * Read back rather than trusting the answer: admin-content passes over any key
 * not on its list and still says ok, so before it is redeployed with
 * `game_rules` on that list a save would otherwise look done and change nothing.
 * With no `supabase` client to read with, the write is taken as done.
 *
 * @param {object} opts
 * @param {Function} opts.adminFetch the admin fetch helper
 * @param {object} [opts.supabase] the anon client, for the read-back
 * @param {object} opts.rules the rules; tidied by `gameRules`
 * @param {string} [opts.seasonId] the season whose tiebreakers these are
 * @returns {Promise<{ rules: object, value: string, verified: boolean }>} `value` is the
 *   season's rules as text, as `config.DB.contentBlocks.game_rules` holds them
 * @throws {Error} when the request fails, or the database does not hold the rules afterwards
 */
export async function saveGameRules({ adminFetch, supabase, rules, seasonId }) {
  const clean = gameRules(rules);
  const value = JSON.stringify(clean);
  const { league, season } = seasonId ? splitRules(clean) : { league: clean, season: null };
  const rows = [{ key: RULES_KEY, value: JSON.stringify(league), season_id: null }];
  if (season) rows.push({ key: RULES_KEY, value: JSON.stringify(season), season_id: seasonId });
  await adminFetch('admin-content', { method: 'POST', body: JSON.stringify(rows) });
  if (!supabase) return { rules: clean, value, verified: false };

  const { data, error } = await supabase.from('content_blocks').select('value,season_id').eq('key', RULES_KEY);
  // The write went through; it is only the check that could not be made.
  if (error) return { rules: clean, value, verified: false };
  const stored = (id) => (data || []).find(r => (r.season_id || null) === id)?.value;
  if (rows.every(r => stored(r.season_id) == null)) throw new Error(RULES_NEED_DEPLOY);
  if (!rows.every(r => keeps(stored(r.season_id), r, Boolean(seasonId)))) {
    throw new Error('Not saved: the database still has the rules from before. Try again in a moment.');
  }
  return { rules: clean, value, verified: true };
}

/** Whether a row read back says what was sent, tidied the way it was tidied for sending. */
function keeps(stored, row, split) {
  if (stored == null) return false;
  if (!split) return JSON.stringify(gameRules(stored)) === row.value;
  const parts = splitRules(stored);
  return JSON.stringify(row.season_id ? parts.season : parts.league) === row.value;
}

/** What the Timeouts group says under its boxes about the window chosen. */
export function rulesHint(rules) {
  return `${carryText(rules)} The live tracker uses this the next time a game is opened, and a single game can be changed in the tracker.`;
}

/** The numbers on the page: rule key, label, and the words after the box. */
const NUMBER_FIELDS = {
  timeouts: ['Timeouts per team', ''],
  overtimeTimeouts: ['Extra each overtime', ''],
  bonusFouls: ['Bonus at', 'team fouls in a half'],
  doubleBonusFouls: ['Double bonus at', 'team fouls (0 for none)'],
  foulOutFouls: ['Fouled out at', 'personal fouls'],
  halfMinutes: ['Half', 'minutes'],
  overtimeMinutes: ['Overtime', 'minutes'],
};

/**
 * Read the form into rules, or say what is wrong with it. A box left empty or
 * out of range is refused with its name, rather than quietly saved as the
 * default.
 * @returns {{ rules: object, problems: string[] }}
 */
export function readRulesForm(values) {
  const problems = [];
  const rules = { timeoutsPer: values.timeoutsPer, tiebreakers: tiebreakerList(values.tiebreakers) };
  Object.entries(NUMBER_FIELDS).forEach(([key, [label]]) => {
    const [lo, hi] = RULE_LIMITS[key];
    const raw = String(values[key] ?? '').trim();
    const n = raw === '' ? NaN : Number(raw);
    if (!Number.isInteger(n) || n < lo || n > hi) problems.push(`${label}: a whole number from ${lo} to ${hi}.`);
    rules[key] = n;
  });
  if (!TIMEOUT_SCOPES.includes(rules.timeoutsPer)) problems.push('Timeouts: counted per game or per half.');
  if (!problems.length) problems.push(...ruleProblems(rules));
  return { rules, problems };
}

/**
 * The current season's standings as the given tiebreakers would order them,
 * with how far each team moves from the order the saved ones give.
 * @returns {Array<{ name: string, w: number, l: number, pd: number, move: number }>}
 */
export function standingsPreview(teams, scores, tiebreakers, savedTiebreakers) {
  const rec = calcStandings(teams, scores);
  const was = rankTeams(teams, scores, savedTiebreakers);
  return rankTeams(teams, scores, tiebreakers).map((name, i) => ({
    name,
    w: rec[name].w,
    l: rec[name].l,
    pd: rec[name].pf - rec[name].pa,
    move: was.indexOf(name) - i,
  }));
}

/**
 * The Rules page.
 * @param {HTMLElement} content
 * @param {{ adminFetch: Function, supabase: object, config: object, onSaved?: () => void|Promise<void> }} ctx
 */
export function renderLeagueRules(content, { adminFetch, supabase, config, seasonId, onSaved }) {
  let saved = gameRules(config.DB?.contentBlocks?.[RULES_KEY]);
  const seasonLabel = config.currentSeasonLabel || 'this season';
  const slots = Object.keys(TIEBREAKERS).length;
  const number = (key) => {
    const [label, after] = NUMBER_FIELDS[key];
    const [lo, hi] = RULE_LIMITS[key];
    return `<label class="rules-row"><span class="rules-label">${esc(label)}</span>
      <input type="number" class="rules-input" name="${key}" min="${lo}" max="${hi}" step="1" inputmode="numeric">
      ${after ? `<span class="rules-after">${esc(after)}</span>` : ''}</label>`;
  };
  const tbSelect = (i) => `<label class="rules-row rules-tb-row"><span class="rules-label">${i + 1}${['st', 'nd', 'rd'][i] || 'th'}</span>
      <select class="rules-input rules-input-wide" name="tb${i}" aria-label="Tiebreaker ${i + 1}">
        <option value="">${i ? '— add another —' : '— none: teams level on wins keep their listed order —'}</option>
        ${Object.entries(TIEBREAKERS).map(([k, label]) => `<option value="${k}">${esc(label)}</option>`).join('')}
      </select></label>`;

  content.innerHTML = `
    <form id="league-rules-form" class="rules-form" novalidate>
      <p class="rules-intro">The standings' tiebreakers belong to ${esc(seasonLabel)}, the season picked at the top, so other seasons keep theirs. Timeouts, fouls and the game clock apply to every season. The standings change as soon as rules are saved; the live tracker uses them the next time a game is opened.</p>
      <div class="rules-grid">
        <section class="card rules-card">
          <h3 class="rules-card-title">Standings · ${esc(seasonLabel)}</h3>
          <p class="rules-note">Teams are ranked by wins. Teams level on wins in ${esc(seasonLabel)} are separated by these, in order.</p>
          ${Array.from({ length: slots }, (_, i) => tbSelect(i)).join('')}
          <p class="rules-note" id="rules-tb-summary"></p>
          <p class="rules-note rules-fine">Head-to-head counts only the games between the tied teams, once each of them has played at least one of the others. When it separates some of three or more tied teams, the rest start again from the first tiebreaker.</p>
          <div class="rules-preview" id="rules-preview"></div>
        </section>
        <div class="rules-col">
        <section class="card rules-card">
          <h3 class="rules-card-title">Timeouts</h3>
          ${number('timeouts')}
          <label class="rules-row"><span class="rules-label">Counted per</span>
            <select class="rules-input rules-input-mid" name="timeoutsPer"><option value="game">Game</option><option value="half">Half</option></select></label>
          ${number('overtimeTimeouts')}
          <p class="rules-note" id="rules-to-hint"></p>
        </section>
        <section class="card rules-card">
          <h3 class="rules-card-title">Fouls</h3>
          ${number('bonusFouls')}
          ${number('doubleBonusFouls')}
          ${number('foulOutFouls')}
          <p class="rules-note">Team fouls start again each half. The tracker shows the bonus on the team shooting it and sounds the horn when a team reaches it.</p>
        </section>
        <section class="card rules-card">
          <h3 class="rules-card-title">Game clock</h3>
          ${number('halfMinutes')}
          ${number('overtimeMinutes')}
          <p class="rules-note">What the tracker's clock starts at. A scorekeeper can still set it to anything during a game.</p>
        </section>
        </div>
      </div>
      <div class="rules-actions">
        <button type="submit" class="rules-save" id="league-rules-save">Save rules</button>
        <span class="rules-dirty" id="rules-dirty" hidden>Not saved yet</span>
      </div>
      <div id="league-rules-msg" role="status"></div>
    </form>`;

  const form = content.querySelector('#league-rules-form');
  const field = (name) => form.elements.namedItem(name);
  const $ = (id) => content.querySelector(`#${id}`);

  /** Put rules in the boxes. */
  const fill = (r) => {
    Object.keys(NUMBER_FIELDS).forEach((k) => { field(k).value = r[k]; });
    field('timeoutsPer').value = r.timeoutsPer;
    for (let i = 0; i < slots; i += 1) field(`tb${i}`).value = r.tiebreakers[i] || '';
    showTiebreakerBoxes();
  };
  const formValues = () => {
    const v = { timeoutsPer: field('timeoutsPer').value, tiebreakers: [] };
    Object.keys(NUMBER_FIELDS).forEach((k) => { v[k] = field(k).value; });
    for (let i = 0; i < slots; i += 1) if (field(`tb${i}`).value) v.tiebreakers.push(field(`tb${i}`).value);
    return v;
  };
  const say = (kind, text) => { $('league-rules-msg').innerHTML = text ? `<p class="msg ${kind}">${esc(text)}</p>` : ''; };

  /**
   * After a change, the boxes say exactly what will be saved: a tiebreaker
   * picked twice keeps only the place just given it, and the rest close up
   * with no gaps.
   */
  const tidyTiebreakers = (changed) => {
    const picked = field(changed)?.value;
    const order = [];
    for (let i = 0; i < slots; i += 1) {
      const name = `tb${i}`;
      const v = field(name).value;
      if (v && !order.includes(v) && (v !== picked || name === changed)) order.push(v);
    }
    for (let i = 0; i < slots; i += 1) field(`tb${i}`).value = order[i] || '';
    showTiebreakerBoxes();
  };
  /** The tiebreakers chosen, and one empty box to add another. */
  const showTiebreakerBoxes = () => {
    let shown = 0;
    for (let i = 0; i < slots; i += 1) if (field(`tb${i}`).value) shown = i + 1;
    for (let i = 0; i < slots; i += 1) field(`tb${i}`).closest('.rules-row').hidden = i > shown;
  };

  const regularSeason = () => (config.DB?.scores || []).filter(g => !config.DB?.playoffWeeks?.[String(g.week)]);
  const showPreview = (tiebreakers) => {
    const teams = config.DB?.teams || [];
    const scores = regularSeason();
    const box = $('rules-preview');
    if (!teams.length || !scores.some(g => g.s1 && g.s2)) {
      box.innerHTML = `<p class="rules-note">${esc(config.currentSeasonLabel || 'This season')} has no results yet, so there is nothing to order.</p>`;
      return;
    }
    const rows = standingsPreview(teams, scores, tiebreakers, saved.tiebreakers);
    const moved = rows.some(r => r.move);
    box.innerHTML = `<div class="rules-preview-title">${esc(config.currentSeasonLabel || 'This season')}${moved ? ' — with these tiebreakers' : ''}</div>
      <ol class="rules-preview-list">${rows.map(r => `<li${r.move ? ' class="rules-moved"' : ''}><span class="rules-pv-name">${esc(r.name)}</span><span class="rules-pv-rec">${r.w}-${r.l}</span><span class="rules-pv-pd">${r.pd > 0 ? '+' : ''}${r.pd}</span><span class="rules-pv-move">${r.move > 0 ? `▲${r.move}` : r.move < 0 ? `▼${-r.move}` : ''}</span></li>`).join('')}</ol>
      ${moved ? '<p class="rules-note">▲▼ how far a team moves from the standings as they are now.</p>' : ''}`;
  };

  const refresh = () => {
    const values = formValues();
    const tbs = tiebreakerList(values.tiebreakers);
    const ties = tiebreakerText(tbs);
    $('rules-tb-summary').textContent = ties ? `Level on wins: ${ties}.` : 'Teams level on wins keep the order they are listed in.';
    showPreview(tbs);
    $('rules-to-hint').textContent = rulesHint({ timeoutsPer: values.timeoutsPer });
    const { rules, problems } = readRulesForm(values);
    $('rules-dirty').hidden = !problems.length && JSON.stringify(gameRules(rules)) === JSON.stringify(saved);
  };

  fill(saved);
  refresh();
  form.addEventListener('change', (e) => { if (e.target.name?.startsWith('tb')) tidyTiebreakers(e.target.name); refresh(); });
  form.addEventListener('input', () => { say('', ''); refresh(); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { rules, problems } = readRulesForm(formValues());
    if (problems.length) { say('error', `Not saved. ${problems.join(' ')}`); return; }
    const btn = $('league-rules-save');
    btn.disabled = true;
    say('', '');
    try {
      const result = await saveGameRules({ adminFetch, supabase, rules, seasonId });
      if (config.DB) {
        if (!config.DB.contentBlocks) config.DB.contentBlocks = {};
        config.DB.contentBlocks[RULES_KEY] = result.value;
      }
      saved = result.rules;
      fill(saved);
      refresh();
      say('success', `Saved. ${seasonLabel} standings: ${tiebreakerText(saved.tiebreakers) || 'no tiebreakers'}. Timeouts (every season): ${timeoutRuleText(saved)}.`);
      if (onSaved) await onSaved();
    } catch (err) {
      say('error', err.message || String(err));
    } finally {
      btn.disabled = false;
    }
  });
}
