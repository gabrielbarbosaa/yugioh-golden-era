import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { FollowList } from "@/components/follow-list";

type Params = Promise<{ username: string }>;
type SearchParams = Promise<{ cursor?: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { username } = await params;
  return { title: `Seguidores de @${username}` };
}

export default function Page({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  return (
    <Suspense fallback={<p className="skeleton">Carregando…</p>}>
      <Content params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { username } = await params;
  const { cursor } = await searchParams;
  return (
    <>
      <p>
        <Link href={`/users/${username}`}>← @{username}</Link>
      </p>
      <h1>Seguidores</h1>
      <FollowList username={username} kind="followers" cursor={cursor} />
    </>
  );
}