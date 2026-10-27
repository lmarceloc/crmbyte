import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentAccount } from "@/lib/auth/account";
import { acessoDaConta } from "@/lib/assinatura/acesso";
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

/** Conta sem assinatura e com o teste grátis vencido? (Sem sessão/perfil: o shell cuida.) */
async function contaBloqueada(): Promise<boolean> {
  try {
    const ctx = await getCurrentAccount();
    return !(await acessoDaConta(ctx.supabase, ctx.accountId)).liberado;
  } catch {
    return false;
  }
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // redirect() fora do try: ele funciona lançando uma exceção
  if (await contaBloqueada()) redirect("/assinatura");
  return <DashboardShell>{children}</DashboardShell>;
}
