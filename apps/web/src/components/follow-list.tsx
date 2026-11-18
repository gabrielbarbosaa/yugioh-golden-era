import { Pager, withQuery } from "@/components/pager";
import { UserList } from "@/components/user-list";
import { api, describeError } from "@/lib/api";
import { notFound } from "next/navigation";

/** Página de "Seguidores" ou "Seguindo" de um usuário (pública, paginada por cursor). */
export async function FollowList({ username, kind, cursor }: { username: string; kind: "followers" | "following"; cursor?: string }) {
  const params = { path: { username }, query: { cursor: cursor || undefined, limit: 40 } };
  const res = kind === "followers" ? await api.GET("/users/{username}/followers", { params }) : await api.GET("/users/{username}/following", { params });
  if (res.response.status === 404) notFound();
  if (!res.data) throw new Error(describeError(res.error));
  const page = res.data;
  return (
    <>
      <UserList users={page.items} empty={kind === "followers" ? "Ninguém segue este jogador ainda." : "Este jogador ainda não segue ninguém."} />
      <Pager nextHref={page.nextCursor ? withQuery(`/users/${username}/${kind}`, { cursor: page.nextCursor }) : null} />
    </>
  );
}