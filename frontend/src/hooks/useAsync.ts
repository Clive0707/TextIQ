import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../services/api';

export type AsyncState<T> = {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  reload: () => Promise<void>;
  setData: (value: T | null) => void;
};

function toApiError(e: unknown): ApiError {
  return e instanceof ApiError ? e : new ApiError('unknown', 'Something went wrong. Please try again.');
}

/** Runs `fn` on mount and whenever `deps` change; exposes reload for manual refresh. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const seq = useRef(0);

  const run = useCallback(async () => {
    const id = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const result = await fnRef.current();
      if (id === seq.current) setData(result);
    } catch (e) {
      if (id === seq.current) setError(toApiError(e));
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading, reload: run, setData };
}

/** Wraps a user-triggered async action with pending/error state. */
export function useAction<A extends unknown[], T>(fn: (...args: A) => Promise<T>) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const run = useCallback(
    async (...args: A): Promise<T | undefined> => {
      setPending(true);
      setError(null);
      try {
        return await fn(...args);
      } catch (e) {
        setError(toApiError(e));
        return undefined;
      } finally {
        setPending(false);
      }
    },
    [fn],
  );
  return { run, pending, error, clearError: () => setError(null) };
}

/** Calls `fn` every `ms` while `active` is true. */
export function useInterval(fn: () => void, ms: number, active: boolean) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => ref.current(), ms);
    return () => window.clearInterval(t);
  }, [ms, active]);
}
