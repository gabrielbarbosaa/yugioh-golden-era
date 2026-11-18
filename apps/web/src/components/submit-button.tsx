"use client";

import { useFormStatus } from "react-dom";

/** Botão de envio que se desativa enquanto a Server Action roda (evita cliques duplos, ex.: duas importações). */
export function SubmitButton({ children, pending: pendingLabel }: { children: React.ReactNode; pending?: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="button" type="submit" disabled={pending}>
      {pending ? (pendingLabel ?? "Aguarde…") : children}
    </button>
  );
}