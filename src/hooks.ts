import { useCallback, useEffect, useRef, useState } from 'react';
import { toSalesError, type SalesError } from './errors';

export interface AsyncState<T> {
  data: T | undefined;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/** Runs `load` when `deps` change; ignores stale results. (From Inventory.) */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const runId = useRef(0);

  useEffect(() => {
    const id = ++runId.current;
    setLoading(true);
    setError(null);
    load()
      .then((d) => {
        if (id === runId.current) setData(d);
      })
      .catch((e: unknown) => {
        if (id === runId.current) setError(toSalesError(e).message);
      })
      .finally(() => {
        if (id === runId.current) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload };
}

/** Wraps a submit: busy flag, error (text and the full SalesError), success text. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<SalesError | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const run = useCallback(async (action: () => Promise<string | void>) => {
    setBusy(true);
    setFailure(null);
    setDone(null);
    try {
      const message = await action();
      if (message) setDone(message);
      return true;
    } catch (e) {
      setFailure(toSalesError(e));
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const clear = useCallback(() => {
    setFailure(null);
    setDone(null);
  }, []);

  return { busy, error: failure?.message ?? null, failure, done, run, clear };
}

/** A value that settles `ms` after the last change (search boxes). */
export function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setSettled(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return settled;
}

/**
 * Double-submit guard: one request_id per form opening. The same id is reused
 * on retry (the server returns the first document again); call renew() after
 * a success.
 */
export function useRequestId(): { id: string; renew: () => void } {
  const [id, setId] = useState(() => crypto.randomUUID());
  const renew = useCallback(() => setId(crypto.randomUUID()), []);
  return { id, renew };
}

/** localStorage read/write that never throws (conveniences only). */
export function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function storageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the convenience is simply lost.
  }
}
