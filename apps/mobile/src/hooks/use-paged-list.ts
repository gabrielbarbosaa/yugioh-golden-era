import { useCallback, useEffect, useRef, useState } from 'react';

import { describeError } from '@/lib/errors';

type Page<T> = { items: T[]; nextCursor?: string | null };
type Result<T> = { data?: Page<T>; error?: unknown };

/** Uma chamada paginada da API: devolve a página ou um erro (como o openapi-fetch). */
type Fetcher<T> = (cursor: string | undefined) => Promise<Result<T>>;

type State<T> = {
  /** Para qual consulta (deps) estes dados valem; se não bater com a atual, ainda estamos carregando. */
  key: string;
  items: T[];
  nextCursor: string | null;
  error: string | null;
  loadingMore: boolean;
};

const empty = <T,>(): Omit<State<T>, 'key'> => ({ items: [], nextCursor: null, error: null, loadingMore: false });

async function safely<T>(run: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await run();
  } catch (error) {
    return { error }; // falha de rede
  }
}

/**
 * Lista paginada por cursor. Recomeça do zero quando `deps` mudam (ex.: texto da busca) e
 * descarta respostas atrasadas de consultas antigas.
 */
export function usePagedList<T>(fetchPage: Fetcher<T>, deps: readonly unknown[]) {
  const key = JSON.stringify(deps);
  const [state, setState] = useState<State<T>>({ key: '', ...empty<T>() });
  const [attempt, setAttempt] = useState(0);

  const fetchRef = useRef(fetchPage);
  useEffect(() => {
    fetchRef.current = fetchPage;
  });

  // Primeira página: roda ao mudar a consulta (ou ao pedir de novo). O estado só muda após o await.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await safely(() => fetchRef.current(undefined));
      if (cancelled) return;
      setState(
        data
          ? { key, items: data.items, nextCursor: data.nextCursor ?? null, error: null, loadingMore: false }
          : { key, ...empty<T>(), error: describeError(error) },
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [key, attempt]);

  const current = state.key === key;

  const loadMore = useCallback(async () => {
    if (!current || !state.nextCursor || state.loadingMore) return;
    const cursor = state.nextCursor;
    setState((s) => ({ ...s, loadingMore: true, error: null }));
    const { data, error } = await safely(() => fetchRef.current(cursor));
    setState((s) => {
      if (s.key !== key) return s; // a consulta mudou enquanto esperávamos
      return data
        ? { ...s, items: [...s.items, ...data.items], nextCursor: data.nextCursor ?? null, loadingMore: false }
        : { ...s, error: describeError(error), loadingMore: false };
    });
  }, [current, state.nextCursor, state.loadingMore, key]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  return {
    items: current ? state.items : [],
    loading: !current || state.loadingMore,
    error: current ? state.error : null,
    hasMore: current && state.nextCursor !== null,
    loadMore,
    reload,
  };
}
