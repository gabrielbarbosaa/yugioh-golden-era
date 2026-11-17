import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { DeckList } from "@/components/deck-list";
import { Pager, withQuery } from "@/components/pager";
import { api, describeError } from "@/lib/api";

type Params = Promise<{ username: string }>;
type SearchParams = Promise<{ cursor?: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { username } = await params;
  return { title: `@${username}` };
}

export default function UserPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  return (
    <Suspense fallback={<p className="skeleton">Carregando perfil…</p>}>
      <Profile params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Profile({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { username } = await params;
  const { cursor } = await searchParams;

  const [profileRes, decksRes] = await Promise.all([
    api.GET("/users/{username}", { params: { path: { username } } }),
    api.GET("/users/{username}/decks", {
      params: { path: { username }, query: { cursor: cursor || undefined, limit: 20 } },
    }),
  ]);
  if (profileRes.response.status === 404) notFound();
  if (!profileRes.data) throw new Error(describeError(profileRes.error));
  const profile = profileRes.data;
  const decks = decksRes.data;

  return (
    <>
      <h1>@{profile.username}</h1>
      {profile.bio ? <p>{profile.bio}</p> : null}
      <div className="stats">
        <div className="stat">
          <strong>{profile.deckCount ?? 0}</strong>
          <span className="muted">Decks</span>
        </div>
        <div className="stat">
          <strong>{profile.followerCount ?? 0}</strong>
          <span className="muted">Seguidores</span>
        </div>
        <div className="stat">
          <strong>{profile.followingCount ?? 0}</strong>
          <span className="muted">Seguindo</span>
        </div>
      </div>
      <h2>Decks públicos</h2>
      {decks?.items.length ? (
        <DeckList decks={decks.items} />
      ) : (
        <p className="muted">Este usuário ainda não publicou decks.</p>
      )}
      <Pager nextHref={decks?.nextCursor ? withQuery(`/users/${username}`, { cursor: decks.nextCursor }) : null} />
    </>
  );
}
