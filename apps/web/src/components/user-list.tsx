import type { Schemas } from "@golden-era/api-client";
import Link from "next/link";

import { Avatar } from "@/components/avatar";

/** Lista de jogadores (foto + nome), cada um levando ao perfil. */
export function UserList({ users, empty }: { users: Schemas["UserSummary"][]; empty: string }) {
  if (users.length === 0) return <p className="muted">{empty}</p>;
  return (
    <ul className="user-list">
      {users.map((u) => (
        <li key={u.id}>
          <Link href={`/users/${u.username}`} className="user-row">
            <Avatar url={u.avatarUrl} name={u.username} size={44} />
            <strong>@{u.username}</strong>
          </Link>
        </li>
      ))}
    </ul>
  );
}