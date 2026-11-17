"use client";

import Link from "next/link";
import { useActionState } from "react";

import { login, register } from "@/app/actions";

/** Formulário de entrar / criar conta; envia para uma Server Action que grava os cookies de sessão. */
export function AuthForm({ mode, next }: { mode: "login" | "register"; next: string }) {
  const isRegister = mode === "register";
  const [state, action, pending] = useActionState(isRegister ? register : login, { error: null });
  const otherHref = `${isRegister ? "/login" : "/register"}?next=${encodeURIComponent(next)}`;

  return (
    <form action={action} className="form">
      <input type="hidden" name="next" value={next} />
      <label>
        E-mail
        <input type="email" name="email" autoComplete="email" defaultValue={state.email} required />
      </label>
      {isRegister ? (
        <label>
          Nome de usuário
          <input
            type="text"
            name="username"
            autoComplete="username"
            defaultValue={state.username}
            pattern="[A-Za-z0-9_]{3,24}"
            title="3 a 24 caracteres: letras, números e _"
            required
          />
        </label>
      ) : null}
      <label>
        Senha
        <input
          type="password"
          name="password"
          autoComplete={isRegister ? "new-password" : "current-password"}
          minLength={isRegister ? 8 : undefined}
          required
        />
      </label>
      {state.error ? (
        <p className="error" role="alert">
          {state.error}
        </p>
      ) : null}
      <button className="button" type="submit" disabled={pending}>
        {pending ? "Aguarde…" : isRegister ? "Criar conta" : "Entrar"}
      </button>
      <p className="muted">
        <Link href={otherHref}>{isRegister ? "Já tenho conta" : "Ainda não tenho conta"}</Link>
      </p>
    </form>
  );
}
