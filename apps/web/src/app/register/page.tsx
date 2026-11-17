import { Suspense } from "react";

import { AuthForm } from "@/components/auth-form";

export const metadata = { title: "Criar conta" };

export default function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  return (
    <>
      <h1>Criar conta</h1>
      <Suspense fallback={<p className="skeleton">Carregando…</p>}>
        <Form searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Form({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <AuthForm mode="register" next={next ?? "/"} />;
}
