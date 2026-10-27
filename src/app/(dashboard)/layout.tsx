import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentAccount } from "@/lib/auth/account";
import { acessoDaConta, type Acesso } from "@/lib/assinatura/acesso";
import { DashboardShell } from "./dashboard-shell";

// Server layout whose only job is to declare "do not index" metadata
// for the authed app. robots.ts already disallows these paths at the
// crawler-level and middleware redirects unauthenticated visitors, so
// this is belt-and-suspenders — but SEO-critical if a URL ever leaks
// via a link shared externally.
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

/** Acesso da conta (teste, assinatura, isenção). Sem sessão/perfil: null, o shell cuida. */
async function acessoAtual(): Promise<Acesso | null> {
  try {
    const ctx = await getCurrentAccount();
    return await acessoDaConta(ctx.supabase, ctx.accountId);
  } catch {
    return null;
  }
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const acesso = await acessoAtual();
  // redirect() fora do try: ele funciona lançando uma exceção
  if (acesso && !acesso.liberado) redirect("/assinatura");
  return (
    <DashboardShell testeAte={acesso?.motivo === "teste" ? acesso.testeAte : null}>{children}</DashboardShell>
  );
}
