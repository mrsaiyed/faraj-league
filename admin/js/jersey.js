/**
 * Saving a jersey number — admin only.
 *
 * One path for everything that edits a number (the Players tab and the live
 * tracker's panel), so they agree on what "saved" means and keep the loaded
 * season in step with it.
 */

/** The deployed admin-players ignores a null until it is redeployed. */
export const CLEAR_NEEDS_DEPLOY =
  'Not cleared: removing a number needs the updated admin-players function deployed. Setting numbers works now.';

const notSaved = (message, stored) => Object.assign(new Error(message), { stored });

/**
 * Write one player's number — `null` clears it — and confirm the database has it.
 *
 * The team is deliberately left out of the request: admin-players reads any
 * `team_id` as a move, taking the player off the roster and putting them back at
 * the end, which would reshuffle the team's order.
 *
 * The row is read back rather than trusting the answer, for two reasons.
 * admin-players does not look at the result of its own update, so it says ok even
 * when nothing was written. And one deployed before clearing was supported ignores
 * a null, which would otherwise read as cleared. With no `supabase` client to read
 * with, the write is taken as done.
 *
 * @param {object} opts
 * @param {Function} opts.adminFetch the admin fetch helper
 * @param {object} [opts.supabase] the anon client, for the read-back
 * @param {string} opts.playerId
 * @param {number|null} opts.value 0–99, or null to clear
 * @returns {Promise<{ value: number|null, verified: boolean }>}
 * @throws {Error} when the request fails, or when the database does not hold the
 *   number afterwards — then `.stored` is what it holds instead (null for nothing)
 */
export async function saveJerseyNumber({ adminFetch, supabase, playerId, value }) {
  if (!playerId) throw new Error('playerId is required');
  await adminFetch('admin-players', { method: 'POST', body: JSON.stringify({ id: playerId, jersey_number: value }) });
  if (!supabase) return { value, verified: false };

  const { data: row, error } = await supabase.from('players').select('jersey_number').eq('id', playerId).maybeSingle();
  // The write went through; it is only the check that could not be made.
  if (error) return { value, verified: false };
  if (!row) throw notSaved('Not saved: that player no longer exists. Reload the page.', null);
  const stored = row.jersey_number ?? null;
  if (stored !== value) {
    throw notSaved(
      value == null ? CLEAR_NEEDS_DEPLOY : `Not saved: the database still has ${stored == null ? 'no number' : `#${stored}`} for this player.`,
      stored,
    );
  }
  return { value, verified: true };
}

/**
 * Keep the loaded season in step with a number just saved, so whatever is open
 * (the live tracker, the draft board) shows it without a reload.
 */
export function setLoadedJersey(config, playerId, value) {
  const db = config?.DB;
  (db?.teams || []).forEach(t => (t.roster || []).forEach(r => {
    if (r.id === playerId) r.jersey_number = value;
  }));
  (db?.draftBank || []).forEach(p => {
    if (p.id === playerId) p.jersey_number = value;
  });
}
