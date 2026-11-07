"use client";
import { useEffect, useRef, useState } from "react";
import { startWhmPolling } from "@/lib/whm-polling";
export type WhmReadOperation = "overview" | "listaccts" | "listpkgs";
export function useWhmAutoRead<T>(
  operation: WhmReadOperation,
  enabled: boolean,
  validate: (value: unknown) => value is T,
) {
  const [snapshot, setSnapshot] = useState<{
    operation: string;
    value: T;
    at: string;
  } | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(false),
    [paused, setPaused] = useState(false);
  const control = useRef<ReturnType<typeof startWhmPolling<T>> | null>(null);
  useEffect(() => {
    setError(false);
    setBusy(false);
    if (!enabled) {
      setPaused(true);
      return;
    }
    const poll = startWhmPolling(
      async (signal) => {
        const response = await fetch("/api/admin/whm", {
          method: "POST",
          signal,
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ operation }),
        });
        const value: unknown = await response.json();
        if (!response.ok || !validate(value))
          throw Error("whm-read-unconfirmed");
        return value;
      },
      {
        start: () => setBusy(true),
        success: (value) => {
          setSnapshot({ operation, value, at: new Date().toISOString() });
          setError(false);
        },
        error: () => setError(true),
        settled: () => setBusy(false),
        paused: setPaused,
      },
    );
    control.current = poll;
    return () => {
      poll.stop();
      control.current = null;
    };
  }, [operation, enabled, validate]);
  const current = snapshot?.operation === operation ? snapshot : null;
  return {
    result: current?.value ?? null,
    lastRead: current?.at ?? null,
    busy,
    error,
    paused,
    refresh: () => control.current?.refresh(),
  };
}
