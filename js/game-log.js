/**
 * The game log's markup — one builder for the public box score and the admin
 * stat sheets, so the two never drift. Rows come from `gameLogRows()` in
 * lib/game-log.js; styles are `.game-log*` in css/main.css, which both sites load.
 *
 * The list scrolls inside its own box with each period's heading pinned to its
 * top (`position: sticky` works here, unlike on the page itself, because the
 * box is the scroll container — see the trophy notes in CLAUDE.md).
 */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

/**
 * @param {Array<object>} rows from `gameLogRows()`
 * @param {object} teams
 * @param {string} teams.homeTeamId
 * @param {string} teams.homeName
 * @param {string} teams.awayName
 * @returns {string} HTML; empty when there are no rows
 */
export function gameLogHtml(rows, { homeTeamId, homeName, awayName }) {
  if (!rows || !rows.length) return '';
  const body = rows.map((r) => {
    if (r.kind === 'period') {
      return `<div class="game-log-period" role="heading" aria-level="4">${esc(r.label)}</div>`;
    }
    const side = !r.teamId ? '' : r.teamId === homeTeamId ? 'home' : 'away';
    const team = side === 'home' ? homeName : side === 'away' ? awayName : '';
    // The side that just scored is the one picked out in the running score.
    const home = r.points && side === 'home' ? `<b>${r.home}</b>` : String(r.home);
    const away = r.points && side === 'away' ? `<b>${r.away}</b>` : String(r.away);
    return `<div class="game-log-row${r.points ? ' game-log-row-score' : ''}" data-side="${side}">`
      + `<span class="game-log-clock">${esc(r.clock)}</span>`
      + `<span class="game-log-team">${esc(team)}</span>`
      + `<span class="game-log-text">${esc(r.text)}</span>`
      + `<span class="game-log-score">${home}–${away}</span>`
      + '</div>';
  }).join('');
  return `<section class="game-log" aria-label="Game log">`
    + `<div class="game-log-head"><span class="game-log-title">Game log</span>`
    + `<span class="game-log-teams">${esc(homeName)} – ${esc(awayName)}</span></div>`
    + `<div class="game-log-scroll" tabindex="0">${body}</div>`
    + '</section>';
}
