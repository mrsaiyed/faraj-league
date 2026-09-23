/**
 * Courtside sounds for the live tracker — ADMIN ONLY.
 *
 * Synthesised through the Web Audio API rather than shipped as audio files:
 * the site has no build step and no asset pipeline, and a horn is two
 * oscillators. Nothing to download means nothing to fail mid-game.
 *
 * The AudioContext is built on first use, which is inside the tap that
 * recorded the foul. That timing is the point — iOS Safari only lets audio
 * start from a user gesture, so a context created at page load would be born
 * suspended and the horn would never be heard.
 */

let ctx = null;

/** @returns {AudioContext|null} null when the browser has no Web Audio at all */
function audio() {
  if (ctx) return ctx;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  try { ctx = new Ctor(); } catch (_) { return null; }
  return ctx;
}

/**
 * One horn note.
 *
 * @param {number} startAt seconds from now
 * @param {number} freq Hz
 * @param {number} secs how long the note holds
 */
function note(startAt, freq, secs) {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + startAt;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(freq, t0);
  // Ramp both ends: a square wave switched on at full gain clicks audibly.
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(0.22, t0 + 0.012);
  gain.gain.setValueAtTime(0.22, t0 + secs - 0.04);
  gain.gain.linearRampToValueAtTime(0, t0 + secs);
  osc.connect(gain).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + secs + 0.02);
}

/**
 * Sound the bonus horn. Never throws — a gym tablet with audio blocked has to
 * keep scoring, and a silent horn is not worth losing a basket over.
 *
 * @param {1|2} level 1 single bonus (one note), 2 double bonus (two, higher)
 */
export function playBonusHorn(level) {
  try {
    const ac = audio();
    if (!ac) return;
    // Backgrounding the tab suspends the context; scoring resumes before the
    // horn would otherwise be scheduled into silence.
    if (ac.state === 'suspended') ac.resume?.().catch(() => {});
    if (level >= 2) {
      note(0, 740, 0.2);
      note(0.26, 740, 0.2);
    } else {
      note(0, 523, 0.34);
    }
  } catch (_) { /* audio is a nicety; the badge on screen is the real signal */ }
}
