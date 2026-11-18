"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";

import { setFollow } from "@/app/actions";

/** Botão Seguir / Seguindo do perfil de outra pessoa. O estado muda na hora e volta atrás se a API recusar. */
export function FollowButton({ username, following }: { username: string; following: boolean }) {
  const [shown, setShown] = useOptimistic(following, (_current, next: boolean) => next);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    const next = !shown;
    setError(null);
    start(async () => {
      setShown(next);
      const res = await setFollow(username, next);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <div className="follow-box">
      <button type="button" className={`button ${shown ? "ghost" : ""}`} aria-pressed={shown} onClick={toggle} disabled={pending}>
        {shown ? "Seguindo" : "Seguir"}
      </button>
      {error ? (
        <span role="alert" className="follow-error">
          {error}
        </span>
      ) : null}
    </div>
  );
}

/** Para quem não entrou: um convite para entrar e poder seguir. */
export function FollowLogin({ username }: { username: string }) {
  return (
    <p className="muted">
      <Link href={`/login?next=${encodeURIComponent(`/users/${username}`)}`}>Entre</Link> para seguir @{username}.
    </p>
  );
}