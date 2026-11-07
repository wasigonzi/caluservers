/** Browser-only scheduler. No credentials, storage or WHM calls here. */
export const WHM_REFRESH_MS = 45_000;
export type PollEnvironment = {
  visible: () => boolean;
  online: () => boolean;
  set: typeof setTimeout;
  clear: typeof clearTimeout;
  subscribe: (listener: () => void) => () => void;
};
export function browserPollEnvironment(): PollEnvironment {
  return {
    visible: () => document.visibilityState === "visible",
    online: () => navigator.onLine !== false,
    set: setTimeout,
    clear: clearTimeout,
    subscribe(listener) {
      document.addEventListener("visibilitychange", listener);
      window.addEventListener("online", listener);
      window.addEventListener("offline", listener);
      return () => {
        document.removeEventListener("visibilitychange", listener);
        window.removeEventListener("online", listener);
        window.removeEventListener("offline", listener);
      };
    },
  };
}
export function startWhmPolling<T>(
  read: (signal: AbortSignal) => Promise<T>,
  callbacks: {
    start: () => void;
    success: (value: T) => void;
    error: () => void;
    settled: () => void;
    paused: (value: boolean) => void;
  },
  env: PollEnvironment = browserPollEnvironment(),
) {
  let stopped = false,
    active = false,
    failures = 0,
    wake = false;
  let timer: ReturnType<typeof setTimeout> | undefined,
    controller: AbortController | undefined;
  const available = () => env.visible() && env.online();
  function clear() {
    if (timer !== undefined) env.clear(timer);
    timer = undefined;
  }
  function schedule(delay: number) {
    clear();
    if (!stopped && available())
      timer = env.set(() => {
        timer = undefined;
        void run();
      }, delay);
  }
  async function run() {
    if (stopped || active || !available()) return;
    active = true;
    wake = false;
    controller = new AbortController();
    const current = controller;
    callbacks.start();
    try {
      const value = await read(current.signal);
      if (!stopped && !current.signal.aborted) {
        failures = 0;
        callbacks.success(value);
      }
    } catch {
      if (!stopped && !current.signal.aborted) {
        failures = Math.min(failures + 1, 3);
        callbacks.error();
      }
    } finally {
      active = false;
      controller = undefined;
      if (!stopped) {
        callbacks.settled();
        schedule(wake ? 0 : Math.min(300_000, WHM_REFRESH_MS * 2 ** failures));
      }
    }
  }
  function visibility() {
    if (stopped) return;
    callbacks.paused(!available());
    clear();
    if (!available()) {
      wake = false;
      controller?.abort();
    } else if (active) wake = true;
    else
      schedule(
        failures ? Math.min(300_000, WHM_REFRESH_MS * 2 ** failures) : 0,
      );
  }
  const unsubscribe = env.subscribe(visibility);
  callbacks.paused(!available());
  schedule(0);
  return {
    refresh() {
      if (!stopped && available() && !active) schedule(0);
    },
    stop() {
      stopped = true;
      clear();
      controller?.abort();
      unsubscribe();
    },
  };
}
