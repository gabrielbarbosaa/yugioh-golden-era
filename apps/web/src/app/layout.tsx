import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { BrandMark } from "@/components/brand-mark";
import { UserMenu } from "@/components/user-menu";
// Fonte dos títulos, autohospedada pelo pacote (sem chamar o Google Fonts em build ou em runtime).
import "@fontsource/cinzel/600.css";
import "@fontsource/cinzel/700.css";
import "@fontsource/cinzel/800.css";
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
            <Link href="/" className="brand" aria-label="Golden Era, página inicial">
              <BrandMark />
              <span className="brand-text">Golden Era</span>
            </Link>
            <nav aria-label="Principal">
              <Link href="/">Cartas</Link>
              <Link href="/decks">Decks</Link>
              <Link href="/banlist">Lista da era</Link>
              <Link href="/collection">Coleção</Link>
              {/* Lê o cookie de sessão: fica num Suspense para o resto do topo continuar estático. */}
              <Suspense fallback={<span className="usermenu" />}>
                <UserMenu />
              </Suspense>
            </nav>
          </div>
        </header>
        <main className="container">{children}</main>
        <footer className="footer">
          <div className="container footer-inner">
            <p>Golden Era é um projeto de fãs, sem afiliação com a Konami nem com os detentores de Yu-Gi-Oh!.</p>
            <p>
              Yu-Gi-Oh! © Kazuki Takahashi / Shueisha / TV Tokyo / Konami. As imagens das cartas pertencem aos seus donos e são
              usadas aqui só para consulta.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
