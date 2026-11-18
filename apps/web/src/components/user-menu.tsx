import Link from "next/link";

import { logout } from "@/app/actions";
import { Avatar } from "@/components/avatar";
import { getCurrentUser } from "@/lib/session";

/** Canto direito do topo: usuário + Sair, ou Entrar. Lê o cookie, então fica dentro de <Suspense>. */
export async function UserMenu() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <span className="usermenu">
        <Link href="/login">Entrar</Link>
      </span>
    );
  }
  return (
    <span className="usermenu">
      <Link href={`/users/${user.username}`} className="usermenu-link">
        <Avatar url={user.avatarUrl} name={user.username} size={26} />@{user.username}
      </Link>
      <form action={logout}>
        <button type="submit" className="linkbutton">
          Sair
        </button>
      </form>
    </span>
  );
}
