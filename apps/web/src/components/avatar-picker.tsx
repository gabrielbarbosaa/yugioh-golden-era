"use client";

import { useEffect, useState, useTransition } from "react";

import { searchCards, setAvatarCard } from "@/app/actions";
import type { CardLite } from "@/lib/deck-rules";

/** Escolha da carta da foto de perfil: busca por nome, clique na carta para usar; também remove a foto atual. */
export function AvatarPicker({ hasAvatar }: { hasAvatar: boolean }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<CardLite[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const found = await searchCards(q);
      if (!cancelled) setResults(found);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, open]);

  function choose(cardId: number) {
    start(async () => {
      const res = await setAvatarCard(cardId);
      setMessage(res.ok ? (cardId === 0 ? "Foto removida." : "Foto de perfil atualizada.") : res.error);
      if (res.ok) setOpen(false);
    });
  }

  return (
    <div className="avatar-picker">
      <div className="avatar-picker-bar">
        <button type="button" className="button ghost small" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? "Fechar" : "Escolher foto de perfil"}
        </button>
        {hasAvatar ? (
          <button type="button" className="linkbutton" onClick={() => choose(0)} disabled={pending}>
            Remover foto
          </button>
        ) : null}
        <span className="muted" role="status" aria-live="polite">
          {message}
        </span>
      </div>
      {open ? (
        <div className="avatar-picker-panel">
          <label className="sr-only" htmlFor="avatar-search">Buscar carta</label>
          <input id="avatar-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Busque uma carta pelo nome (ex.: Dark Magician)" autoFocus />
          {q.trim().length < 2 ? <p className="muted">Digite pelo menos 2 letras. A ilustração da carta escolhida vira a sua foto.</p> : null}
          {q.trim().length >= 2 && results.length === 0 ? <p className="muted">Nenhuma carta encontrada.</p> : null}
          <ul className="avatar-picker-grid">
            {results.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => choose(c.id)} disabled={pending} title={c.name}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.imageSmallUrl} alt={c.name} width={84} height={122} loading="lazy" />
                  <span>{c.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** Botão da página da carta: usa esta carta como foto de perfil. */
export function UseAsAvatar({ cardId }: { cardId: number }) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="use-avatar">
      <button
        type="button"
        className="button ghost small"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await setAvatarCard(cardId);
            setMessage(res.ok ? "Pronto! Esta carta agora é a sua foto de perfil." : res.error);
          })
        }
      >
        {pending ? "Salvando…" : "Usar como minha foto de perfil"}
      </button>
      <span className="muted" role="status" aria-live="polite">
        {message}
      </span>
    </div>
  );
}