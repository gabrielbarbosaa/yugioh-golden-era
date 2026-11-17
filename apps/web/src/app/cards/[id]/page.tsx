import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { api, describeError } from "@/lib/api";
import { banlistLabel } from "@/lib/banlist";

type Params = Promise<{ id: string }>;

// A busca é repetida aqui e na página; o fetch idêntico é memoizado dentro do mesmo pedido.
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const cardId = Number(id);
  if (!Number.isSafeInteger(cardId)) return {};
  const { data } = await api.GET("/cards/{cardId}", { params: { path: { cardId } } });
  return data ? { title: data.name, description: data.desc.slice(0, 160) } : {};
}

export default function CardPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<p className="skeleton">Carregando carta…</p>}>
      <CardDetail params={params} />
    </Suspense>
  );
}

function Fact({ label, value }: { label: string; value?: string | number | null }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className="fact">
      <span>{label}</span>
      {value}
    </div>
  );
}

async function CardDetail({ params }: { params: Params }) {
  const { id } = await params;
  const cardId = Number(id);
  if (!Number.isSafeInteger(cardId)) notFound();

  const { data: card, error, response } = await api.GET("/cards/{cardId}", { params: { path: { cardId } } });
  if (response.status === 404) notFound();
  if (!card) throw new Error(describeError(error));

  return (
    <>
      <h1>{card.name}</h1>
      <div className="card-detail">
        <div className="card-art">
          <Image src={card.imageUrl} alt={card.name} width={420} height={612} unoptimized priority />
        </div>
        <div>
          <div className="facts">
            <Fact label="Tipo" value={card.type} />
            <Fact label="Atributo" value={card.attribute} />
            <Fact label="Espécie" value={card.race} />
            <Fact label="Nível" value={card.level} />
            <Fact label="ATK" value={card.atk} />
            <Fact label="DEF" value={card.def} />
            <Fact label="Arquétipo" value={card.archetype} />
            <Fact label="Lista da era" value={banlistLabel(card.maxCopies)} />
            <Fact label="Lançamento (OCG)" value={card.ocgDate} />
          </div>
          <p style={{ whiteSpace: "pre-line" }}>{card.desc}</p>
        </div>
      </div>
    </>
  );
}
