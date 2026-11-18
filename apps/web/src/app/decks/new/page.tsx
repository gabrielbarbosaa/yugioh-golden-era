import { redirect } from "next/navigation";
import { Suspense } from "react";

import { DeckEditor } from "@/components/deck-editor";
import { PageBanner } from "@/components/page-banner";
import { emptyCards } from "@/lib/deck-rules";
import { getCurrentUser } from "@/lib/session";

export const metadata = { title: "Novo deck" };

export default function NewDeckPage() {
  return (
    <>
      <PageBanner title="Novo deck" artCardId={46986414}>
        Monte o deck, escolha se fica privado ou público e salve. Rascunhos privados podem estar incompletos.
      </PageBanner>
      <Suspense fallback={<p className="skeleton">Carregando…</p>}>
        <Editor />
      </Suspense>
    </>
  );
}

async function Editor() {
  if (!(await getCurrentUser())) redirect(`/login?next=${encodeURIComponent("/decks/new")}`);
  return <DeckEditor initial={{ deckId: null, name: "", description: "", visibility: "private", cards: emptyCards(), known: [] }} />;
}