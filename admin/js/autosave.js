/**
 * Save-as-you-go for something that changes often and must not be lost — the
 * live tracker's play-by-play. No DOM; timers only.
 *
 * `changed()` after every edit; the save runs `delay` ms after the last one,
 * so a burst of taps is one save. Saves run one after another and each sends
 * the data as it is when its turn comes (the `save` callback reads the current
 * state), so an older save can never land after a newer one. A failed save is
 * retried after `retryDelay`, or sooner if anything else changes. `flush()`
 * saves now — End game, Save and Close wait on it to say how it went — and
 * skips the request when nothing changed since the last save that worked.
 *
 * @param {object} opts
 * @param {() => Promise<unknown>} opts.save sends the current data; throws on failure
 * @param {number} [opts.delay] quiet time after a change before saving
 * @param {number} [opts.retryDelay] wait before retrying a failed save
 * @param {boolean} [opts.auto] false: only `flush()` saves (changes are still counted)
 * @param {(state: { ok: boolean, error?: string }) => void} [opts.onState] after every attempt
 */
export function createAutosave({ save, delay = 2000, retryDelay = 15000, auto = true, onState = () => {} }) {
  let version = 0;
  let savedVersion = 0;
  let timer = null;
  let stopped = false;
  let chain = Promise.resolve({ ok: true });

  const clear = () => { clearTimeout(timer); timer = null; };
  const schedule = (ms) => {
    if (!auto || stopped) return;
    clear();
    timer = setTimeout(() => { timer = null; flush(); }, ms);
  };

  function flush() {
    clear();
    chain = chain.then(async () => {
      if (version === savedVersion) return { ok: true, skipped: true };
      const sending = version;
      try {
        await save();
        savedVersion = Math.max(savedVersion, sending);
        onState({ ok: true });
        return { ok: true };
      } catch (err) {
        const error = err?.message || String(err);
        onState({ ok: false, error });
        schedule(retryDelay);
        return { ok: false, error };
      }
    });
    return chain;
  }

  return {
    /** Something changed: save it soon. */
    changed() { version += 1; schedule(delay); },
    /** Save now if anything is unsaved. @returns {Promise<{ ok: boolean, error?: string, skipped?: boolean }>} */
    flush,
    /** Drop a save that is waiting to start (one already running finishes). */
    cancel: clear,
    /** Settles once the save running now, if any, is done. */
    idle: () => chain.then(() => undefined),
    /** Treat everything as saved — after the data was cleared on purpose. */
    reset() { clear(); savedVersion = version; },
    /** No more timed saves (the tracker was closed); `flush()` still works. */
    stop() { stopped = true; clear(); },
    /** Whether a change has not been saved yet. */
    get pending() { return version !== savedVersion; },
  };
}
