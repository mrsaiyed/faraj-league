/**
 * A champions card as HTML — the engraved plate off the trophy, with the same
 * lines and the same layout maths — and the hover loupe and full-screen view
 * it opens in.
 *
 * Shared by the 3D trophy (js/trophy.js) and the home hero's "Reigning Champs"
 * plaque, and kept out of the trophy's module so the hero never loads three.js
 * or the trophy's texture code. Styled by css/trophy.css.
 */
import { layoutCard } from '../lib/trophy.js';

const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Jost:wght@500&display=swap';

// The engraving on the real trophy is Futura; Jost is its closest free twin.
export const CARD_FONT = '"Jost", "Futura", "Century Gothic", "Avenir Next", sans-serif';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let fontSheet = null;   // the font stylesheet's arrival, shared by every caller

/**
 * Bring in the card font. The trophy's textures are drawn once, so it waits
 * for the face before engraving; the hero plaque waits so its layout is
 * measured in the face it is shown in.
 */
export async function loadCardFont() {
  const timeout = (ms) => new Promise(r => setTimeout(r, ms));
  // A slow font must never hang anything; the fallbacks are close enough.
  try {
    // Until the stylesheet has arrived there is no @font-face for Jost, and
    // fonts.load() would resolve at once with nothing — the plates would be
    // engraved in the fallback font while the HTML card, which re-renders
    // when a font arrives, looked right. Shared, because the hero and a
    // trophy can both ask at page load, and the second must wait too.
    if (!fontSheet) {
      fontSheet = new Promise(resolve => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = FONT_CSS;
        link.onload = link.onerror = () => resolve();
        document.head.appendChild(link);
      });
    }
    await Promise.race([fontSheet, timeout(3000)]);
    await Promise.race([document.fonts.load('500 64px "Jost"'), timeout(3000)]);
  } catch (_) { /* fall back silently */ }
}

let measureCtx = null;
/** Width of `text` at a font size of 1, in the card font. */
export function measureCard(text) {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
  measureCtx.font = `500 100px ${CARD_FONT}`;
  return measureCtx.measureText(text).width / 100;
}

/** The enlarged HTML card: same lines, same layout maths as the 3D plate. */
export function cardElement(card) {
  const l = layoutCard(card.lines, measureCard);
  const el = document.createElement('div');
  el.className = 'trophy-card';
  el.style.setProperty('--fs', l.fontSize.toFixed(4));
  el.style.setProperty('--lh', l.lineHeight.toFixed(4));
  el.innerHTML = card.lines.map(t => `<span>${esc(t)}</span>`).join('');
  return el;
}

// ---- loupe and full-screen card ------------------------------------------------

let overlaySet = null;

/**
 * The hover loupe and the full-screen card are single elements the whole site
 * shares: both trophies and the home hero's plaque open the same ones, and two
 * of each (plus two Escape handlers) would fight over the same keyboard and
 * scroll lock.
 */
export function overlays() {
  if (overlaySet) return overlaySet;

  const loupe = document.createElement('div');
  loupe.className = 'trophy-loupe';
  loupe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(loupe);
  let loupeCard = null;
  function showLoupe(card, x, y) {
    if (loupeCard !== card) {
      loupeCard = card;
      loupe.replaceChildren(cardElement(card));
    }
    loupe.classList.add('is-open');
    const w = loupe.offsetWidth, h = loupe.offsetHeight, m = 12;
    let lx = x + 24, ly = y - h - 24;
    if (lx + w > window.innerWidth - m) lx = x - w - 24;
    if (ly < m) ly = y + 24;
    loupe.style.transform = `translate(${Math.max(m, lx)}px, ${Math.max(m, Math.min(ly, window.innerHeight - h - m))}px)`;
  }
  function hideLoupe() {
    loupe.classList.remove('is-open');
  }

  const modal = document.createElement('div');
  modal.className = 'trophy-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.hidden = true;
  modal.innerHTML = `<button type="button" class="trophy-modal-close" aria-label="Close">×</button>
    <figure class="trophy-modal-body"><div class="trophy-modal-card"></div><figcaption class="trophy-modal-caption"></figcaption></figure>`;
  document.body.appendChild(modal);
  let lastFocus = null, hideTimer = 0;
  function openModal(card) {
    clearTimeout(hideTimer);   // reopened while the last close was still fading out
    modal.querySelector('.trophy-modal-card').replaceChildren(cardElement(card));
    modal.querySelector('.trophy-modal-caption').textContent = `${card.team} · ${card.season} Champions`;
    modal.setAttribute('aria-label', `${card.team}, ${card.season} champions card`);
    lastFocus = document.activeElement;
    modal.hidden = false;
    requestAnimationFrame(() => modal.classList.add('is-open'));
    document.documentElement.classList.add('trophy-modal-open');
    modal.querySelector('.trophy-modal-close').focus();
  }
  function closeModal() {
    if (modal.hidden) return;
    modal.classList.remove('is-open');
    document.documentElement.classList.remove('trophy-modal-open');
    hideTimer = setTimeout(() => { modal.hidden = true; }, 200);
    lastFocus?.focus?.();
  }
  modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('.trophy-modal-close')) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  overlaySet = { showLoupe, hideLoupe, openModal };
  return overlaySet;
}
