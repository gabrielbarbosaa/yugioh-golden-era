import Link from "next/link";

import { setOwned } from "@/app/actions";
import { api } from "@/lib/api";
import { authHeaders } from "@/lib/session";

/** Botões − quantidade + (formulários que chamam a Server Action `setOwned`). */
export function QtyForms({ cardId, quantity }: { cardId: number; quantity: number }) {
  return (
    <div className="owned-row">
      <form action={setOwned.bind(null, cardId, quantity - 1)}>
        <button className="step-button" type="submit" aria-label="Tenho uma cópia a menos" disabled={quantity <= 0}>
          −
        </button>
      </form>
      <span className="qty-box" aria-live="polite">
        {quantity}
      </span>
      <form action={setOwned.bind(null, cardId, quantity + 1)}>
        <button className="step-button" type="submit" aria-label="Tenho uma cópia a mais" disabled={quantity >= 999}>
          +
        </button>
      </form>
    </div>
  );
}

/** Caixa "Na minha coleção" da página da carta. Lê o cookie de sessão, então fica dentro de <Suspense>. */
export async function OwnedControl({ cardId }: { cardId: number }) {
  const headers = await authHeaders();
  const res = headers ? await api.GET("/me/collection", { headers }) : null;
  if (!res?.data) {
    return (
      <p className="muted">
        <Link href={`/login?next=${encodeURIComponent(`/cards/${cardId}`)}`}>Entre</Link> para registrar quantas cópias você tem.
      </p>
    );
  }
  const quantity = res.data.find((i) => i.cardId === cardId)?.quantity ?? 0;
  return (
    <div className="owned-box">
      <strong>Na minha coleção</strong>
      <QtyForms cardId={cardId} quantity={quantity} />
    </div>
  );
}