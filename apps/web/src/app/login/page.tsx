import { Suspense } from "react";

import { AuthForm } from "@/components/auth-form";

export const metadata = { title: "Entrar" };

export default function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  return (
    <>
      <h1>Entrar</h1>
      <Suspense fallback={<p className="skeleton">Carregando…</p>}>
        <Form searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Form({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <AuthForm mode="login" next={next ?? "/"} />;
}
