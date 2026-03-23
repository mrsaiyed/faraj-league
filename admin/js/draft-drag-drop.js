/**
 * Draft drag-and-drop — attach DnD handlers for player moves (bank↔team) and
 * Sortable.js for team card reordering on the draft board.
 * Called from initAdminOverlays after renderAll(true).
 */

import { config } from '../../js/config.js';

let draftTeamSortableInstance = null;

/**
 * Init or re-init Sortable on the draft board for team reordering.
 * Call every time initAdminOverlays runs so it works after re-renders.
 * Uses optimistic update: save to backend, update local config, no re-fetch (avoids reset).
 */
export function initDraftTeamSortable({ adminFetch }) {
  const seasonId = window.adminSeasonId;
  if (!seasonId || typeof Sortable === 'undefined') return;

  const board = document.querySelector('#draft-board-wrap .draft-board');
  if (!board) return;

  if (draftTeamSortableInstance) {
    try {
      draftTeamSortableInstance.destroy();
    } catch (_) {}
    draftTeamSortableInstance = null;
  }

  draftTeamSortableInstance = new Sortable(board, {
    handle: '.draft-team-drag-handle',
    animation: 150,
    ghostClass: 'draft-team-card-ghost',
    onEnd: async () => {
      const cards = [...board.querySelectorAll('.draft-team-card[data-team-id]')];
      const order = cards.map((c) => c.dataset.teamId).filter(Boolean);
      if (order.length === 0) return;
      try {
        await adminFetch('admin-content', {
          method: 'POST',
          body: JSON.stringify([{ key: 'draft_team_order', value: JSON.stringify(order), season_id: seasonId }]),
        });
        if (config.DB) {
          config.DB.draftTeamOrder = order;
          if (!config.DB.contentBlocks) config.DB.contentBlocks = {};
          config.DB.contentBlocks.draft_team_order = JSON.stringify(order);
        }
        showToast('Draft order saved.');
      } catch (err) {
        showToast('Error: ' + err.message, true);
      }
    },
  });
}

function showToast(msg, isError = false) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;bottom:1rem;right:1rem;padding:0.6rem 1rem;background:' + (isError ? '#8b2635' : '#0e2535') + ';border:1px solid ' + (isError ? '#c44' : '#c8a84b') + ';color:#f5f0e8;font-size:0.85rem;z-index:10000;border-radius:4px;';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

/**
 * Attach draft drag-and-drop (players: bank↔team, team↔team).
 * Team order uses Sortable.js via initDraftTeamSortable.
 * @param {Function} [onDraftRerender] - When advancing draft on player drop: re-render without fetch (keeps draft state).
 */
export function attachDraftDragDrop({ adminFetch, onDraftSaved, onDraftRerender, renderDraft }) {
  const seasonId = window.adminSeasonId;
  if (!seasonId) return;

  const wrap = document.getElementById('draft-board-wrap');
  const bank = document.getElementById('draft-bank');
  if (!wrap) return;
  const draftArea = wrap.parentElement;

  let dragPlayerId = null;
  let dragSourceTeamId = null;
  let dragSourceBank = false;

  function getDropZoneTeamId(el) {
    if (!el) return null;
    const zone = el.closest('[data-drop-zone="team"]');
    return zone?.dataset?.teamId || null;
  }

  function getCaptainSlot(el) {
    return el?.closest?.('[data-drop-zone="captain"]') || null;
  }

  function isBankZone(el) {
    return el?.closest?.('[data-drop-zone="bank"]') != null;
  }

  function handleDragStart(e) {
    const chip = e.target.closest('.draft-player-chip[data-player-id]');
    if (!chip) return;
    dragPlayerId = chip.dataset.playerId;
    dragSourceTeamId = chip.dataset.source === 'bank' ? null : chip.dataset.teamId || null;
    dragSourceBank = chip.dataset.source === 'bank';
    e.dataTransfer.setData('text/plain', dragPlayerId);
    e.dataTransfer.effectAllowed = 'move';
  }

  if (draftArea) {
    draftArea.addEventListener('dragstart', handleDragStart);
    draftArea.addEventListener('dragend', () => {
      dragPlayerId = null;
      dragSourceTeamId = null;
      dragSourceBank = false;
    });
  } else {
    wrap.addEventListener('dragend', () => {
      dragPlayerId = null;
      dragSourceTeamId = null;
      dragSourceBank = false;
    });
  }

  wrap.addEventListener('dragover', (e) => {
    if (dragPlayerId) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    }
  });

  function clearCaptainIfPlayer(teamId, playerId) {
    if (!config.DB) return;
    const team = (config.DB.teams || []).find((t) => String(t.id) === String(teamId));
    if (!team) return;
    const player = team.roster?.find((p) => String(p.id) === String(playerId));
    if (player && team.captain && String(team.captain || '').trim().toLowerCase() === String(player.name || '').trim().toLowerCase()) {
      team.captain = null;
      adminFetch('admin-teams', { method: 'POST', body: JSON.stringify({ id: teamId, captain: null }) }).catch(() => {});
    }
  }

  wrap.addEventListener('drop', async (e) => {
    e.preventDefault();
    const capturedPlayerId = dragPlayerId;
    const capturedSourceTeamId = dragSourceTeamId;
    const capturedSourceBank = dragSourceBank;
    if (!capturedPlayerId) return;

    const captainSlot = getCaptainSlot(e.target);
    if (captainSlot) {
      const targetTeamId = captainSlot.dataset?.teamId || null;
      if (!targetTeamId) return;

      try {
        let player = (config.DB?.draftBank || []).find((p) => String(p.id) === String(capturedPlayerId));
        let needsRosterUpdate = false;
        const targetTeam = (config.DB?.teams || []).find((t) => String(t.id) === String(targetTeamId));
        if (!targetTeam) return;

        if (player) {
          needsRosterUpdate = true;
          if (config.DB.draftBank) config.DB.draftBank = config.DB.draftBank.filter((p) => String(p.id) !== String(capturedPlayerId));
        } else if (capturedSourceTeamId) {
          const srcTeam = (config.DB.teams || []).find((t) => String(t.id) === String(capturedSourceTeamId));
          if (srcTeam?.roster) {
            player = srcTeam.roster.find((p) => String(p.id) === String(capturedPlayerId));
            if (player) {
              if (String(capturedSourceTeamId) !== String(targetTeamId)) {
                needsRosterUpdate = true;
                srcTeam.roster = srcTeam.roster.filter((p) => String(p.id) !== String(capturedPlayerId));
                clearCaptainIfPlayer(capturedSourceTeamId, capturedPlayerId);
              }
            }
          }
        }

        if (!player) return;

        if (needsRosterUpdate) {
          targetTeam.roster = targetTeam.roster || [];
          if (!targetTeam.roster.some((p) => String(p.id) === String(player.id))) {
            targetTeam.roster.push({ id: player.id, name: player.name, jersey_number: player.jersey_number });
          }
        }

        targetTeam.captain = player.name || '';

        const { advancePickFromPlayerDrop, getCurrentTeamId, isDraftRunning, updateDraftUI } = await import('./draft-timer.js');
        const currentTeamId = getCurrentTeamId();
        const droppedOnActiveTeam = String(targetTeamId) === String(currentTeamId);
        const shouldAdvance = isDraftRunning() && droppedOnActiveTeam;

        if (shouldAdvance) await advancePickFromPlayerDrop(adminFetch);
        updateDraftUI(true);
        if (renderDraft) renderDraft(true);
        if (onDraftRerender) await onDraftRerender();
        else if (onDraftSaved) await onDraftSaved();

        const savePromises = [
          adminFetch('admin-teams', { method: 'POST', body: JSON.stringify({ id: targetTeamId, captain: player.name }) }),
        ];
        if (needsRosterUpdate) {
          savePromises.push(adminFetch('admin-players', { method: 'POST', body: JSON.stringify({ id: capturedPlayerId, team_id: targetTeamId }) }));
        }
        Promise.all(savePromises).then(() => showToast('Captain assigned.')).catch((err) => {
          showToast('Error: ' + err.message, true);
          if (onDraftSaved) onDraftSaved();
        });
      } catch (err) {
        showToast('Error: ' + err.message, true);
      }
      return;
    }

    let targetTeamId = getDropZoneTeamId(e.target);
    const targetIsBank = isBankZone(e.target);
    if (!targetTeamId && !targetIsBank) {
      const card = e.target.closest('.draft-team-card[data-team-id]');
      targetTeamId = card?.dataset?.teamId || null;
    }
    const newTeamId = targetIsBank ? null : targetTeamId;

    const samePlace = (targetIsBank && capturedSourceBank) || (!targetIsBank && targetTeamId === capturedSourceTeamId);
    if (samePlace) return;
    if (!targetIsBank && !newTeamId) return;

    try {
      const { advancePickFromPlayerDrop, getCurrentTeamId, isDraftRunning, updateDraftUI } = await import('./draft-timer.js');
      const currentTeamId = getCurrentTeamId();
      const droppedOnActiveTeam = newTeamId && String(newTeamId) === String(currentTeamId);
      const shouldAdvance = isDraftRunning() && droppedOnActiveTeam;

      function doOptimisticRosterUpdate() {
        if (!config.DB) return;
        let player = (config.DB?.draftBank || []).find((p) => String(p.id) === String(capturedPlayerId));
        if (player) {
          if (config.DB.draftBank) config.DB.draftBank = config.DB.draftBank.filter((p) => String(p.id) !== String(capturedPlayerId));
        } else if (capturedSourceTeamId) {
          const srcTeam = (config.DB.teams || []).find((t) => String(t.id) === String(capturedSourceTeamId));
          if (srcTeam?.roster) {
            player = srcTeam.roster.find((p) => String(p.id) === String(capturedPlayerId));
            if (player) {
              clearCaptainIfPlayer(capturedSourceTeamId, capturedPlayerId);
              srcTeam.roster = srcTeam.roster.filter((p) => String(p.id) !== String(capturedPlayerId));
            }
          }
        }
        if (player && newTeamId) {
          const team = (config.DB.teams || []).find((t) => String(t.id) === String(newTeamId));
          if (team) {
            team.roster = team.roster || [];
            team.roster.push({ id: player.id, name: player.name, jersey_number: player.jersey_number });
          }
        } else if (player && targetIsBank) {
          if (!config.DB.draftBank) config.DB.draftBank = [];
          config.DB.draftBank.push(player);
        }
      }

      doOptimisticRosterUpdate();
      if (shouldAdvance) await advancePickFromPlayerDrop(adminFetch);
      updateDraftUI(true);
      if (renderDraft) renderDraft(true);
      if (onDraftRerender) await onDraftRerender();
      else if (onDraftSaved) await onDraftSaved();

      adminFetch('admin-players', {
        method: 'POST',
        body: JSON.stringify({ id: capturedPlayerId, team_id: newTeamId }),
      }).then(() => showToast('Saved.')).catch((err) => {
        showToast('Error: ' + err.message, true);
        if (onDraftSaved) onDraftSaved();
      });
    } catch (err) {
      showToast('Error: ' + err.message, true);
    }
  });

  if (bank) {
    bank.addEventListener('dragover', (e) => {
      if (dragPlayerId) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      }
    });
    bank.addEventListener('drop', async (e) => {
      const capturedPlayerId = dragPlayerId;
      const capturedSourceTeamId = dragSourceTeamId;
      if (!capturedPlayerId) return;
      e.preventDefault();
      if (dragSourceBank) return;
      try {
        if (config.DB && capturedSourceTeamId) {
          const srcTeam = (config.DB.teams || []).find((t) => String(t.id) === String(capturedSourceTeamId));
          if (srcTeam?.roster) {
            const player = srcTeam.roster.find((p) => String(p.id) === String(capturedPlayerId));
            if (player) {
              clearCaptainIfPlayer(capturedSourceTeamId, capturedPlayerId);
              srcTeam.roster = srcTeam.roster.filter((p) => String(p.id) !== String(capturedPlayerId));
              if (!config.DB.draftBank) config.DB.draftBank = [];
              config.DB.draftBank.push(player);
            }
          }
        }
        if (renderDraft) renderDraft(true);
        const { updateDraftUI } = await import('./draft-timer.js');
        updateDraftUI(true);
        if (onDraftRerender) await onDraftRerender();
        else if (onDraftSaved) await onDraftSaved();

        adminFetch('admin-players', {
          method: 'POST',
          body: JSON.stringify({ id: capturedPlayerId, team_id: null }),
        }).then(() => showToast('Saved.')).catch((err) => {
          showToast('Error: ' + err.message, true);
          if (onDraftSaved) onDraftSaved();
        });
      } catch (err) {
        showToast('Error: ' + err.message, true);
      }
    });
  }
}
