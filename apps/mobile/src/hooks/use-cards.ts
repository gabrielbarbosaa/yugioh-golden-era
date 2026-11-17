import type { Card } from '@golden-era/api-client';
import { useEffect, useState } from 'react';

import { api } from '@/lib/api';

// O deck só guarda ids e quantidades; nomes e imagens vêm de /cards?ids=... (até 100 por chamada).
// Dados de carta não mudam durante o uso do app, então ficam em cache pelo resto da sessão.
const known = new Map<number, Card>();
const BATCH = 100;

async function loadCards(ids: readonly number[]): Promise<void> {
  const missing = ids.filter((id) => !known.has(id));
  for (let i = 0; i < missing.length; i += BATCH) {
    try {
      const { data } = await api.GET('/cards', {
        params: { query: { ids: missing.slice(i, i + BATCH), limit: BATCH } },
      });
      for (const card of data?.items ?? []) known.set(card.id, card);
    } catch {
      // Sem rede as cartas ficam sem nome; a próxima abertura tenta de novo.
    }
  }
}

/** Detalhes das cartas de um deck, por id. Cartas ainda não carregadas ficam de fora do resultado. */
export function useCards(ids: readonly number[]): Record<number, Card> {
  const key = ids.join(',');
  const [loaded, setLoaded] = useState<Record<number, Card>>({});

  useEffect(() => {
    if (!key) return;
    let active = true;
    const wanted = key.split(',').map(Number);
    void loadCards(wanted).then(() => {
      if (!active) return;
      setLoaded((prev) => {
        const next = { ...prev };
        for (const id of wanted) {
          const card = known.get(id);
          if (card) next[id] = card;
        }
        return next;
      });
    });
    return () => {
      active = false;
    };
  }, [key]);

  return loaded;
}
