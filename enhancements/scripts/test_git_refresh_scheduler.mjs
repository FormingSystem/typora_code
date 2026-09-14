import assert from 'node:assert/strict';
import {build} from 'esbuild';

const compiled = await build({stdin: {contents: 'export {git_refresh_scheduler} from "./src/git_refresh_scheduler";', resolveDir: process.cwd()}, bundle: true, platform: 'node', format: 'esm', write: false});
const {git_refresh_scheduler} = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const flush = async () => { for (let index = 0; index < 6; index++) await Promise.resolve(); };

function fixture() {
  let now = 10000, timer_id = 0, started = 0, completed = 0, busy = false, allowed = true, pending;
  const timers = new Map(), calls = [];
  const clock = {
    now: () => now,
    set_timeout(callback, delay) { const id = ++timer_id; timers.set(id, {at: now + delay, callback}); return id; },
    clear_timeout(id) { timers.delete(id); },
  };
  const scheduler = new git_refresh_scheduler({
    refresh() {
      assert.equal(busy, false, 'automatic refresh must not interrupt an existing read/write');
      calls.push(now); started = now; busy = true;
      return new Promise((resolve, reject) => { pending = {resolve, reject}; });
    },
    busy: () => busy,
    allowed: () => allowed,
    last_refresh: () => completed,
    last_started: () => started,
  }, clock);
  const advance = async delay => {
    const end = now + delay; let count = 0;
    for (;;) {
      const next = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next) break;
      assert(++count < 10000, 'scheduler must not loop on a zero-delay timer');
      now = next[1].at; timers.delete(next[0]); next[1].callback(); await flush();
    }
    now = end; await flush();
  };
  const finish = async (failure = false, notify = true) => {
    assert(pending, 'a scheduled request is pending');
    completed = now; busy = false;
    if (notify) scheduler.settled();
    const request = pending; pending = undefined;
    if (failure) request.reject(new Error('isolated read failure')); else request.resolve();
    await flush();
  };
  return {
    scheduler, timers, calls, advance, finish,
    get now() { return now; },
    set_allowed(value) { allowed = value; },
    start_manual() { assert(!busy); busy = true; started = now; },
    finish_manual() { assert(busy); completed = now; busy = false; scheduler.settled(); },
  };
}

const checks = [];
{
  const test = fixture();
  test.scheduler.set_visible(true); assert.equal(test.calls.length, 1, 'first opening reads immediately');
  test.scheduler.set_visible(true); test.scheduler.resume(); assert.equal(test.calls.length, 1, 'repeated opening reuses the pending read');
  await test.finish(); await test.advance(8000); assert.equal(test.calls.length, 1, 'the former eight-second poll is absent');
  test.scheduler.resume(); test.scheduler.set_visible(false); test.scheduler.set_visible(true); assert.equal(test.calls.length, 1, 'focus and tab return do not read a fresh snapshot');
  await test.advance(30 * 60 * 1000 - 8001); assert.equal(test.calls.length, 1);
  await test.advance(1); assert.equal(test.calls.length, 2, 'visible fallback runs thirty minutes after completion');
  await test.advance(750); await test.finish(); await test.advance(30 * 60 * 1000 - 1); assert.equal(test.calls.length, 2, 'interval starts at completion, not the previous start');
  await test.advance(1); assert.equal(test.calls.length, 3); test.scheduler.dispose(); await test.finish();
  assert.equal(test.timers.size, 0, 'late completion cannot restart a disposed timer');
  checks.push('first open, same open, no eight-second poll, fresh focus/tab return, thirty-minute completion-based interval and late disposal');
}
{
  const test = fixture(); test.start_manual(); test.scheduler.set_visible(true);
  assert.equal(test.calls.length, 0, 'first open joins an existing read');
  test.finish_manual(); await test.advance(8000); assert.equal(test.calls.length, 0);
  test.scheduler.set_visible(false); assert.equal(test.timers.size, 0);
  await test.advance(60 * 60 * 1000); assert.equal(test.calls.length, 0, 'hidden views do not poll');
  test.scheduler.set_visible(true); assert.equal(test.calls.length, 1, 'returning after expiry reads once');
  await test.finish(); test.scheduler.dispose();
  checks.push('first open reuses external read, hidden timer stops, expired return reads once');
}
{
  const test = fixture(); test.scheduler.set_visible(true); await test.finish();
  test.scheduler.invalidate(); await test.advance(400); test.scheduler.invalidate(); await test.advance(400); test.scheduler.invalidate();
  await test.advance(4199); assert.equal(test.calls.length, 1);
  await test.advance(1); assert.equal(test.calls.length, 2, 'a burst is coalesced and respects five-second cooldown');
  await test.finish(); await test.advance(6000);
  test.scheduler.invalidate(); await test.advance(600); test.scheduler.invalidate(); await test.advance(999); assert.equal(test.calls.length, 2);
  await test.advance(1); assert.equal(test.calls.length, 3, 'save debounce follows the last event');
  test.scheduler.dispose(); await test.finish();
  checks.push('save bursts coalesce, five-second completion cooldown and one-second trailing debounce');
}
{
  const test = fixture(); test.scheduler.set_visible(true);
  test.scheduler.invalidate(); await test.advance(12000); assert.equal(test.calls.length, 1, 'dirty while busy cannot cancel or parallelize a read');
  await test.finish(); await test.advance(4999); assert.equal(test.calls.length, 1);
  await test.advance(1); assert.equal(test.calls.length, 2, 'save in the same millisecond as start is retained for a follow-up');
  await test.finish(); test.scheduler.dispose();
  checks.push('pending reads retain later invalidations, including same-millisecond events, and execute one follow-up');
}
{
  const test = fixture(); test.scheduler.set_visible(true); await test.finish(); await test.advance(6000);
  test.scheduler.invalidate(); await test.advance(500); test.start_manual(); await test.advance(900); test.finish_manual();
  await test.advance(5000); assert.equal(test.calls.length, 1, 'manual read covers a save that occurred before its start');
  await test.advance(30 * 60 * 1000 - 5001); assert.equal(test.calls.length, 1);
  await test.advance(1); assert.equal(test.calls.length, 2, 'manual completion resets the automatic deadline');
  await test.finish(); test.scheduler.dispose();
  checks.push('manual completion covers older dirty state and resets the periodic deadline');
}
{
  const test = fixture(); test.scheduler.set_visible(true); await test.finish(); await test.advance(6000);
  test.start_manual(); test.scheduler.invalidate(); await test.advance(3000); assert.equal(test.calls.length, 1);
  test.finish_manual(); await test.advance(4999); assert.equal(test.calls.length, 1);
  await test.advance(1); assert.equal(test.calls.length, 2, 'a save arriving after manual start is not swallowed by its completion');
  test.scheduler.set_visible(false); await test.finish(); assert.equal(test.timers.size, 0, 'completion while hidden does not arm a timer');
  await test.advance(10000); test.scheduler.set_visible(true); assert.equal(test.calls.length, 2, 'fresh hidden completion is reused on return');
  test.scheduler.dispose();
  checks.push('saves during a manual read survive completion; hidden completion remains timer-free and fresh on return');
}
{
  const test = fixture(); test.scheduler.set_visible(true); await test.finish();
  test.scheduler.set_visible(false); test.scheduler.invalidate(); await test.advance(10000); assert.equal(test.calls.length, 1); assert.equal(test.timers.size, 0);
  test.scheduler.set_visible(true); assert.equal(test.calls.length, 2, 'hidden saves remain dirty until visible');
  await test.finish(); test.set_allowed(false); test.scheduler.invalidate(); await test.advance(12000); assert.equal(test.calls.length, 2, 'dialog/document visibility blocks reads');
  test.set_allowed(true); test.scheduler.resume(); assert.equal(test.calls.length, 3, 'resume executes an eligible deferred save');
  await test.finish(); test.scheduler.dispose();
  checks.push('hidden saves persist, blocked reads retry without Git execution and resume wakes only due work');
}
{
  const test = fixture(); test.set_allowed(false); test.scheduler.set_visible(true); await test.advance(3000); assert.equal(test.calls.length, 0);
  test.set_allowed(true); await test.advance(999); assert.equal(test.calls.length, 0); await test.advance(1); assert.equal(test.calls.length, 1, 'blocked initial read retries on its bounded timer');
  await test.finish(true, false); await test.advance(8000); test.scheduler.resume(); assert.equal(test.calls.length, 1, 'failure is an attempt and does not cause a retry loop');
  await test.advance(30 * 60 * 1000 - 8000); assert.equal(test.calls.length, 2);
  test.scheduler.dispose(); test.scheduler.invalidate(); test.scheduler.resume(); test.scheduler.set_visible(true); await test.finish(true, false); assert.equal(test.timers.size, 0);
  checks.push('bounded retry, failed request cooldown without controller notification, disposed calls and late failure stay inert');
}
console.log(JSON.stringify({status: 'PASS', checks}, null, 2));
