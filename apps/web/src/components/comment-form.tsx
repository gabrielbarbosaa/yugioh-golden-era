"use client";

import { useActionState } from "react";

import { addComment } from "@/app/actions";

export function CommentForm({ deckId }: { deckId: string }) {
  const [state, action, pending] = useActionState(addComment.bind(null, deckId), { error: null });

  return (
    // `key` muda a cada envio bem-sucedido para limpar o campo; erros mantêm o texto digitado.
    <form action={action} className="form" key={state.error === null ? "ok" : "err"}>
      <label>
        Comentar
        <textarea name="body" rows={3} maxLength={1000} required />
      </label>
      {state.error ? (
        <p className="error" role="alert">
          {state.error}
        </p>
      ) : null}
      <button className="button" type="submit" disabled={pending}>
        {pending ? "Enviando…" : "Comentar"}
      </button>
    </form>
  );
}
