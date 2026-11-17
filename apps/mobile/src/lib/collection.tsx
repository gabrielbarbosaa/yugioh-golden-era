import { createContext, use, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { api } from '@/lib/api';
import { describeError } from '@/lib/errors';

export const MAX_QUANTITY = 999;
const SAVE_DELAY_MS = 600;

type Quantities = Record<number, number>;

type Collection = {
  /** `loading` enquanto a coleção do servidor não chegou; sem sessão fica `idle`. */
  status: 'idle' | 'loading' | 'ready' | 'error';
  quantities: Quantities;
  /** Há alterações ainda não confirmadas pelo servidor. */
  saving: boolean;
  error: string | null;
  setQuantity(cardId: number, quantity: number): void;
  /** Tenta de novo (carregar ou salvar), conforme o que falhou. */
  retry(): void;
};

const CollectionContext = createContext<Collection | null>(null);

const toItems = (q: Quantities) =>
  Object.entries(q)
    .filter(([, quantity]) => quantity > 0)
    .map(([cardId, quantity]) => ({ cardId: Number(cardId), quantity }));

/**
 * Coleção pessoal em memória. A API só sabe substituir a coleção inteira (PUT), então cada
 * alteração atualiza a tela na hora e uma única gravação (com a coleção completa) sai logo depois,
 * juntando vários toques seguidos. Monte com `key` diferente a cada login/logout para não vazar dados.
 */
export function CollectionProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [state, setState] = useState<{ status: Collection['status']; quantities: Quantities; error: string | null }>({
    status: enabled ? 'loading' : 'idle',
    quantities: {},
    error: null,
  });
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const latest = useRef<Quantities>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const dirty = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void (async () => {
      let next: typeof state;
      try {
        const { data, error } = await api.GET('/me/collection');
        if (data) {
          const quantities: Quantities = {};
          for (const item of data) quantities[item.cardId] = item.quantity;
          latest.current = quantities;
          next = { status: 'ready', quantities, error: null };
        } else {
          next = { status: 'error', quantities: {}, error: describeError(error) };
        }
      } catch (e) {
        next = { status: 'error', quantities: {}, error: describeError(e) };
      }
      if (active) setState(next);
    })();
    return () => {
      active = false;
    };
  }, [enabled, attempt]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const flush = useCallback(async () => {
    if (inFlight.current) {
      dirty.current = true; // a gravação em andamento termina e roda de novo com o estado mais recente
      return;
    }
    inFlight.current = true;
    setSaving(true);
    try {
      do {
        dirty.current = false;
        const { error, response } = await api.PUT('/me/collection', { body: toItems(latest.current) });
        if (!response.ok) {
          setState((s) => ({ ...s, error: describeError(error) }));
          return;
        }
        setState((s) => (s.error ? { ...s, error: null } : s));
      } while (dirty.current);
    } catch (e) {
      setState((s) => ({ ...s, error: describeError(e) }));
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }, []);

  const setQuantity = useCallback(
    (cardId: number, quantity: number) => {
      const q = Math.max(0, Math.min(MAX_QUANTITY, Math.round(quantity)));
      const next = { ...latest.current };
      if (q === 0) delete next[cardId];
      else next[cardId] = q;
      latest.current = next;
      setState((s) => ({ ...s, quantities: next }));
      setSaving(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
    },
    [flush],
  );

  const retry = useCallback(() => {
    if (state.status === 'error') {
      setState((s) => ({ ...s, status: 'loading', error: null }));
      setAttempt((n) => n + 1);
    } else {
      void flush();
    }
  }, [state.status, flush]);

  const value: Collection = { ...state, saving, setQuantity, retry };
  return <CollectionContext value={value}>{children}</CollectionContext>;
}

export function useCollection(): Collection {
  const collection = use(CollectionContext);
  if (!collection) throw new Error('useCollection precisa estar dentro de <CollectionProvider>');
  return collection;
}
