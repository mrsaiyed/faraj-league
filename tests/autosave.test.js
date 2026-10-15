/**
 * Unit tests for admin/js/autosave.js — how the live tracker saves its
 * play-by-play as it goes. Fake timers; the save is a stub.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAutosave } from '../admin/js/autosave.js';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

/** A save that records what it sent, failing while `fail` is set. */
function saver(read) {
  const sent = [];
  const ctl = { fail: null, sent };
  ctl.save = vi.fn(async () => {
    if (ctl.fail) throw new Error(ctl.fail);
    sent.push(read());
  });
  return ctl;
}

describe('createAutosave', () => {
  it('saves a moment after a change, without being asked', async () => {
    let data = 0;
    const s = saver(() => data);
    const auto = createAutosave({ save: s.save, delay: 1000 });
    data = 1; auto.changed();
    await vi.advanceTimersByTimeAsync(999);
    expect(s.sent).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(s.sent).toEqual([1]);
    expect(auto.pending).toBe(false);
  });

  it('makes one save of a burst of changes, with the data as it is at the end', async () => {
    let data = 0;
    const s = saver(() => data);
    const auto = createAutosave({ save: s.save, delay: 1000 });
    for (let i = 1; i <= 5; i += 1) { data = i; auto.changed(); await vi.advanceTimersByTimeAsync(500); }
    await vi.advanceTimersByTimeAsync(1000);
    expect(s.sent).toEqual([5]);
  });

  it('retries a failed save until it lands, and says how each attempt went', async () => {
    const states = [];
    const s = saver(() => 'log');
    const auto = createAutosave({ save: s.save, delay: 100, retryDelay: 5000, onState: (st) => states.push(st) });
    s.fail = 'Failed to fetch';
    auto.changed();
    await vi.advanceTimersByTimeAsync(100);
    expect(states).toEqual([{ ok: false, error: 'Failed to fetch' }]);
    expect(auto.pending).toBe(true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(s.save).toHaveBeenCalledTimes(2);   // still failing: tried again
    s.fail = null;
    await vi.advanceTimersByTimeAsync(5000);
    expect(s.sent).toEqual(['log']);
    expect(states.at(-1)).toEqual({ ok: true });
    expect(auto.pending).toBe(false);
    await vi.advanceTimersByTimeAsync(60000);
    expect(s.save).toHaveBeenCalledTimes(3);   // and stops once it has
  });

  it('a change after a failure saves on the normal delay, not the retry one', async () => {
    const s = saver(() => 'log');
    const auto = createAutosave({ save: s.save, delay: 100, retryDelay: 5000 });
    s.fail = 'offline';
    auto.changed();
    await vi.advanceTimersByTimeAsync(100);
    s.fail = null;
    auto.changed();
    await vi.advanceTimersByTimeAsync(100);
    expect(s.sent).toEqual(['log']);
  });

  it('flush saves now and reports the outcome; with nothing unsaved it sends nothing', async () => {
    const s = saver(() => 'log');
    const auto = createAutosave({ save: s.save, delay: 1000 });
    expect(await auto.flush()).toEqual({ ok: true, skipped: true });
    auto.changed();
    expect(await auto.flush()).toEqual({ ok: true });
    await vi.advanceTimersByTimeAsync(5000);
    expect(s.save).toHaveBeenCalledTimes(1);   // the timed save was folded into the flush
    s.fail = 'Request failed: 500';
    auto.changed();
    expect(await auto.flush()).toEqual({ ok: false, error: 'Request failed: 500' });
  });

  it('runs saves one after another, so an older one never lands after a newer one', async () => {
    let data = 0;
    const order = [];
    let release;
    const save = vi.fn(() => {
      const value = data;
      if (value === 1) return new Promise((r) => { release = () => { order.push(value); r(); }; });
      order.push(value);
      return Promise.resolve();
    });
    const auto = createAutosave({ save, delay: 10 });
    data = 1; auto.changed();
    await vi.advanceTimersByTimeAsync(10);      // save of 1 starts and hangs
    data = 2; auto.changed();
    await vi.advanceTimersByTimeAsync(10);      // queued behind it
    expect(save).toHaveBeenCalledTimes(1);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(order).toEqual([1, 2]);
    expect(auto.pending).toBe(false);
  });

  it('a change made while a save is on its way is still saved', async () => {
    let data = 0;
    let release;
    const sent = [];
    const save = () => {
      const value = data;
      return new Promise((r) => { release = () => { sent.push(value); r(); }; });
    };
    const auto = createAutosave({ save, delay: 10 });
    data = 1; auto.changed();
    await vi.advanceTimersByTimeAsync(10);
    data = 2; auto.changed();                   // during the save of 1
    release();
    await vi.advanceTimersByTimeAsync(10);
    expect(auto.pending).toBe(true);            // 2 is not saved yet
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(sent).toEqual([1, 2]);
    expect(auto.pending).toBe(false);
  });

  it('cancel and reset drop a waiting save; idle waits for the one running', async () => {
    const s = saver(() => 'log');
    const auto = createAutosave({ save: s.save, delay: 100 });
    auto.changed();
    auto.cancel();
    await vi.advanceTimersByTimeAsync(1000);
    expect(s.save).not.toHaveBeenCalled();
    expect(auto.pending).toBe(true);            // cancelled, not forgotten
    auto.reset();
    expect(auto.pending).toBe(false);
    expect(await auto.flush()).toEqual({ ok: true, skipped: true });
    await expect(auto.idle()).resolves.toBeUndefined();
  });

  it('after stop, nothing saves on a timer, but flush still does', async () => {
    const s = saver(() => 'log');
    const auto = createAutosave({ save: s.save, delay: 100, retryDelay: 100 });
    auto.stop();
    auto.changed();
    await vi.advanceTimersByTimeAsync(1000);
    expect(s.save).not.toHaveBeenCalled();
    s.fail = 'offline';
    expect((await auto.flush()).ok).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(s.save).toHaveBeenCalledTimes(1);    // no retry once stopped
  });

  it('with auto off, only flush saves', async () => {
    const s = saver(() => 'log');
    const auto = createAutosave({ save: s.save, delay: 100, auto: false });
    auto.changed();
    await vi.advanceTimersByTimeAsync(1000);
    expect(s.save).not.toHaveBeenCalled();
    expect(await auto.flush()).toEqual({ ok: true });
  });
});
