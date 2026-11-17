import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { UserMenu } from "@/components/user-menu";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Golden Era", template: "%s · Golden Era" },
  description: "Monte decks e explore o catálogo da era Duel Monsters do Yu-Gi-Oh! (OCG até 2003).",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR">
      <body>
        <header className="topbar">
          <div className="container topbar-inner">
            <Link href="/" className="brand">
              Golden Era
            </Link>
            <nav aria-label="Principal">
              <Link href="/">Cartas</Link>
              <Link href="/decks">Decks</Link>
              <Link href="/banlist">Lista da era</Link>
              {/* Lê o cookie de sessão: fica num Suspense para o resto do topo continuar estático. */}
              <Suspense fallback={<span className="usermenu" />}>
                <UserMenu />
              </Suspense>
            </nav>
          </div>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
