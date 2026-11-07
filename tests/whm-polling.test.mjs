// Fake browser, clock and network only. No real WHM requests or configuration.
import test from "node:test";
import assert from "node:assert/strict";
import { startWhmPolling, WHM_REFRESH_MS } from "../lib/whm-polling.ts";
const flush = () => new Promise((resolve) => setImmediate(resolve));
function fixture(read) {
  let visible = true,
    online = true,
    listener,
    next = 0,
    reads = 0;
  const timers = new Map(),
    events = [];
  const env = {
    visible: () => visible,
    online: () => online,
    set: (fn, ms) => {
      timers.set(++next, { fn, ms });
      return next;
    },
    clear: (id) => timers.delete(id),
    subscribe: (fn) => {
      listener = fn;
      return () => {
        listener = null;
      };
    },
  };
  const poll = startWhmPolling(
    (signal) => {
      reads++;
      return read(signal);
    },
    {
      start: () => events.push("start"),
      success: (value) => events.push(["success", value]),
      error: () => events.push("error"),
      settled: () => events.push("settled"),
      paused: (v) => events.push(["paused", v]),
    },
    env,
  );
  return {
    poll,
    timers,
    events,
    get reads() {
      return reads;
    },
    get subscribed() {
      return Boolean(listener);
    },
    run() {
      const [id, timer] = [...timers][0];
      timers.delete(id);
      timer.fn();
      return timer.ms;
    },
    visible(v) {
      visible = v;
      listener?.();
    },
    online(v) {
      online = v;
      listener?.();
    },
  };
}
test("autoload starts once; 45s refresh scheduled after completion, manual refresh cannot overlap", async () => {
  let finish;
  const f = fixture(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  assert.equal(f.run(), 0);
  assert.equal(f.reads, 1);
  f.poll.refresh();
  assert.equal(f.timers.size, 0);
  finish({ accounts: 4 });
  await flush();
  assert.equal(f.timers.size, 1);
  assert.equal([...f.timers.values()][0].ms, WHM_REFRESH_MS);
  assert.deepEqual(
    f.events.find((v) => Array.isArray(v) && v[0] === "success"),
    ["success", { accounts: 4 }],
  );
  f.poll.stop();
});
test("hidden/offline abort in-flight, ignore stale results, resume without overlap and clean listeners/timers", async () => {
  let finish, signal;
  const f = fixture((s) => {
    signal = s;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  f.run();
  f.visible(false);
  assert.equal(signal.aborted, true);
  assert.equal(f.timers.size, 0);
  f.visible(true);
  assert.equal(f.reads, 1);
  finish("discard");
  await flush();
  assert.equal(
    f.events.some((v) => Array.isArray(v) && v[0] === "success"),
    false,
  );
  assert.equal(f.run(), 0);
  assert.equal(f.reads, 2);
  f.online(false);
  assert.equal(signal.aborted, true);
  finish("discard offline");
  await flush();
  assert.equal(f.timers.size, 0);
  f.online(true);
  assert.equal(f.timers.size, 1);
  f.poll.stop();
  assert.equal(f.timers.size, 0);
  assert.equal(f.subscribed, false);
});
test("errors back off 90/180/300s, successful next read resets to45s; previous data isn't cleared", async () => {
  let fail = false;
  const f = fixture(async () => {
    if (fail) throw Error("TEST error");
    return "verified previous data";
  });
  f.run();
  await flush();
  fail = true;
  for (const expected of [90_000, 180_000, 300_000]) {
    f.run();
    await flush();
    assert.equal([...f.timers.values()][0].ms, expected);
  }
  assert.equal(
    f.events.filter((v) => Array.isArray(v) && v[0] === "success").length,
    1,
  );
  fail = false;
  f.run();
  await flush();
  assert.equal([...f.timers.values()][0].ms, 45_000);
  f.poll.stop();
});
test("offline mount never fetches; stop during pending request aborts and prevents all later callbacks", async () => {
  let resolve, signal;
  const f = fixture((s) => {
    signal = s;
    return new Promise((r) => {
      resolve = r;
    });
  });
  f.online(false);
  assert.equal(f.timers.size, 0);
  assert.equal(f.reads, 0);
  f.online(true);
  f.run();
  f.poll.stop();
  const length = f.events.length;
  resolve("late");
  await flush();
  assert.equal(signal.aborted, true);
  assert.equal(f.events.length, length);
  assert.equal(f.timers.size, 0);
});
