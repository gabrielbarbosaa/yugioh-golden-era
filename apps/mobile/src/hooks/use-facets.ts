import { useEffect, useState } from 'react';

import { api } from '@/lib/api';
import { describeError } from '@/lib/errors';

export type Facets = {
  types: string[];
  attributes: string[];
  races: string[];
  levels: number[];
  archetypes: string[];
};

// Os valores de filtro só mudam quando o catálogo é reimportado: uma busca por sessão do app basta.
let cached: Promise<Facets> | null = null;

function loadFacets(): Promise<Facets> {
  cached ??= Promise.all([api.GET('/cards/facets'), api.GET('/archetypes')]).then(([facets, archetypes]) => {
    if (!facets.data) throw new Error(describeError(facets.error));
    return { ...facets.data, archetypes: archetypes.data ?? [] };
  });
  return cached;
}

/** Valores disponíveis para os filtros de cartas. Só busca quando `enabled` (ex.: ao abrir a folha de filtros). */
export function useFacets(enabled: boolean) {
  const [state, setState] = useState<{ facets?: Facets; error?: string }>({});
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    loadFacets()
      .then((facets) => active && setState({ facets }))
      .catch((e) => {
        cached = null; // não guarda a falha: a próxima tentativa busca de novo
        if (active) setState({ error: describeError(e) });
      });
    return () => {
      active = false;
    };
  }, [enabled, attempt]);

  return { ...state, retry: () => setAttempt((n) => n + 1) };
}
