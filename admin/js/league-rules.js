/**
 * League rules — admin only. The settings the live tracker plays by, for every
 * season at once: for now, how many timeouts each team gets.
 *
 * Kept as JSON text in `content_blocks.game_rules` with no season (league-wide),
 * written through admin-content and read back with the season's other content
 * blocks. Edited in the admin menu's drawer, under the season settings.
 */

import { gameRules, timeoutRuleText, carryText, MAX_TIMEOUTS } from '../../lib/game-rules.js';

export const RULES_KEY = 'game_rules';

/** admin-content skips a key it does not know — and still answers ok — until it is redeployed. */
export const RULES_NEED_DEPLOY =
  'Not saved: the admin-content function needs redeploying before it will keep league rules (npx supabase functions deploy admin-content).';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Save the league's rules and confirm the database holds them.
 *
 * Read back rather than trusting the answer: admin-content passes over any key
 * not on its list and still says ok, so before it is redeployed with
 * `game_rules` on that list a save would otherwise look done and change nothing.
 * With no `supabase` client to read with, the write is taken as done.
 *
 * @param {object} opts
 * @param {Function} opts.adminFetch the admin fetch helper
 * @param {object} [opts.supabase] the anon client, for the read-back
 * @param {object} opts.rules `{ timeouts, timeoutsPer, overtimeTimeouts }`; tidied by `gameRules`
 * @returns {Promise<{ rules: object, value: string, verified: boolean }>} `value` is the stored text
 * @throws {Error} when the request fails, or the database does not hold the rules afterwards
 */
export async function saveGameRules({ adminFetch, supabase, rules }) {
  const clean = gameRules(rules);
  const value = JSON.stringify(clean);
  await adminFetch('admin-content', {
    method: 'POST',
    body: JSON.stringify([{ key: RULES_KEY, value, season_id: null }]),
  });
  if (!supabase) return { rules: clean, value, verified: false };

  const { data, error } = await supabase.from('content_blocks').select('value')
    .eq('key', RULES_KEY).is('season_id', null).maybeSingle();
  // The write went through; it is only the check that could not be made.
  if (error) return { rules: clean, value, verified: false };
  if (!data) throw new Error(RULES_NEED_DEPLOY);
  const stored = gameRules(data.value);
  if (JSON.stringify(stored) !== value) {
    throw new Error(`Not saved: the database still has ${timeoutRuleText(stored)}.`);
  }
  return { rules: clean, value, verified: true };
}

/** What the drawer says under the form about the window chosen. */
export function rulesHint(rules) {
  return `${carryText(rules)} Applies to every season, and the live tracker uses it the next time it is opened. A single game can be changed in the tracker.`;
}

/**
 * The "League rules" form in the admin drawer.
 * @param {HTMLElement} content
 * @param {{ adminFetch: Function, supabase: object, config: object }} ctx
 */
export function renderLeagueRules(content, { adminFetch, supabase, config }) {
  const r = gameRules(config.DB?.contentBlocks?.[RULES_KEY]);
  const number = (id, value) => `<input type="number" id="${id}" value="${value}" min="0" max="${MAX_TIMEOUTS}" step="1" inputmode="numeric" class="admin-drawer-form-input" required>`;
  content.innerHTML = `
    <form id="league-rules-form" class="admin-drawer-form">
      <div id="league-rules-msg"></div>
      <div class="admin-drawer-form-row">
        <span class="admin-drawer-form-label">Timeouts per team</span>
        ${number('league-rules-timeouts', r.timeouts)}
      </div>
      <div class="admin-drawer-form-row">
        <span class="admin-drawer-form-label">Counted per</span>
        <select id="league-rules-per" class="admin-drawer-form-input-wide">
          <option value="game"${r.timeoutsPer === 'game' ? ' selected' : ''}>Game</option>
          <option value="half"${r.timeoutsPer === 'half' ? ' selected' : ''}>Half</option>
        </select>
      </div>
      <div class="admin-drawer-form-row">
        <span class="admin-drawer-form-label">Extra each overtime</span>
        ${number('league-rules-ot', r.overtimeTimeouts)}
      </div>
      <p class="admin-drawer-form-hint" id="league-rules-hint"></p>
      <div class="admin-drawer-form-actions">
        <button type="submit" id="league-rules-save">Save rules</button>
      </div>
    </form>`;

  const $ = (id) => content.querySelector(`#${id}`);
  const read = () => ({
    timeouts: Number($('league-rules-timeouts').value),
    timeoutsPer: $('league-rules-per').value,
    overtimeTimeouts: Number($('league-rules-ot').value),
  });
  const say = (kind, text) => { $('league-rules-msg').innerHTML = text ? `<p class="msg ${kind}">${esc(text)}</p>` : ''; };
  const showHint = () => { $('league-rules-hint').textContent = rulesHint(read()); };
  showHint();
  content.querySelector('#league-rules-form').addEventListener('input', () => { say('', ''); showHint(); });

  content.querySelector('#league-rules-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('league-rules-save');
    btn.disabled = true;
    say('', '');
    try {
      const saved = await saveGameRules({ adminFetch, supabase, rules: read() });
      if (config.DB) {
        if (!config.DB.contentBlocks) config.DB.contentBlocks = {};
        config.DB.contentBlocks[RULES_KEY] = saved.value;
      }
      // Show what was kept: a box left out of range takes the default.
      $('league-rules-timeouts').value = saved.rules.timeouts;
      $('league-rules-per').value = saved.rules.timeoutsPer;
      $('league-rules-ot').value = saved.rules.overtimeTimeouts;
      showHint();
      say('success', `Saved: ${timeoutRuleText(saved.rules)} for each team.`);
    } catch (err) {
      say('error', err.message || String(err));
    } finally {
      btn.disabled = false;
    }
  });
}
