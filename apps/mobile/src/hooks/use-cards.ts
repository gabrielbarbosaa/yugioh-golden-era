import type { Card } from '@golden-era/api-client';
import { useEffect, useState } from 'react';

import { api } from '@/lib/api';

// O deck só guarda ids e quantidades; nomes e imagens vêm de /cards/{id}.
// Guardamos as promessas para não buscar a mesma carta duas vezes (falhas não ficam em cache).
const inflight = new Map<number, Promise<Card | null>>();

function loadCard(id: number): Promise<Card | null> {
  let promise = inflight.get(id);
  if (!promise) {
    promise = api
      .GET('/cards/{cardId}', { params: { path: { cardId: id } } })
      .then(({ data }) => data ?? null)
      .catch(() => null)
      .then((card) => {
        if (!card) inflight.delete(id);
        return card;
      });
    inflight.set(id, promise);
  }
  return promise;
}

/** Detalhes das cartas de um deck, por id. Cartas ainda não carregadas ficam de fora do resultado. */
export function useCards(ids: readonly number[]): Record<number, Card> {
  const key = ids.join(',');
  const [loaded, setLoaded] = useState<Record<number, Card>>({});

  useEffect(() => {
    if (!key) return;
    let active = true;
    const wanted = key.split(',').map(Number);
    void Promise.all(wanted.map(loadCard)).then((cards) => {
      if (!active) return;
      setLoaded((prev) => {
        const next = { ...prev };
        for (const card of cards) if (card) next[card.id] = card;
        return next;
      });
    });
    return () => {
      active = false;
    };
  }, [key]);

  return loaded;
}
