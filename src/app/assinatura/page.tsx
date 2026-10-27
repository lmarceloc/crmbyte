import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Check, MessageSquare } from "lucide-react";

import { getCurrentAccount, type AccountContext } from "@/lib/auth/account";
import { hasMinRole } from "@/lib/auth/roles";
import { acessoDaConta } from "@/lib/assinatura/acesso";
import { PRECO_CENTAVOS } from "@/lib/assinatura/abacatepay";
import { AguardandoConfirmacao, BotaoAssinar, BotaoSair } from "./acoes";

// Para onde o layout do painel manda a conta sem assinatura e com o teste grátis
// vencido. Conta liberada que chega aqui volta para o CRM.

export const metadata: Metadata = { title: "Assinatura", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const reais = (centavos: number) =>
  (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const INCLUSO = [
  "Time inteiro no mesmo preço, sem cobrança por usuário",
  "Funil, cadências de e-mail, leads quentes e Analisar Deals",
  "Prospecção, IA e WhatsApp oficial",
  "Seus dados continuam guardados: é só assinar para voltar",
];

export default async function AssinaturaPage({
  searchParams,
}: {
  searchParams: Promise<{ assinatura?: string }>;
}) {
  const voltouDoPagamento = (await searchParams).assinatura === "ok";

  let ctx: AccountContext;
  try {
    ctx = await getCurrentAccount();
  } catch {
    redirect("/login");
  }
  const acesso = await acessoDaConta(ctx.supabase, ctx.accountId);
  if (acesso.liberado) redirect(voltouDoPagamento ? "/settings?tab=plano&assinatura=ok" : "/dashboard");

  const podeAssinar = hasMinRole(ctx.role, "admin");
  const cancelada = acesso.motivo === "cancelada";

  return (
    <main className="bg-background text-foreground flex min-h-screen flex-col">
      <header className="border-border flex h-14 items-center justify-between border-b px-4">
        <span className="flex items-center gap-2">
          <span className="bg-primary text-primary-foreground flex h-8 w-8 items-center justify-center rounded-lg">
            <MessageSquare className="h-4 w-4" />
          </span>
          <span className="text-sm font-semibold">CRM Byte</span>
        </span>
        <BotaoSair />
      </header>

      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md space-y-6">
          <div className="space-y-2 text-center">
            <h1 className="text-2xl font-bold tracking-tight">
              {cancelada ? "Sua assinatura foi cancelada" : "Seu teste grátis acabou"}
            </h1>
            <p className="text-muted-foreground text-sm">
              {cancelada
                ? `Assine de novo para voltar a usar o CRM com a conta ${ctx.account.name}.`
                : `Os 7 dias grátis da conta ${ctx.account.name} terminaram. Assine para continuar de onde parou.`}
            </p>
          </div>

          {voltouDoPagamento && <AguardandoConfirmacao />}

          <div className="border-primary bg-card space-y-5 rounded-2xl border-2 p-6">
            <div>
              <p className="text-primary text-sm font-semibold">CRM Byte · mensal</p>
              <p className="mt-1">
                <span className="text-4xl font-bold">{reais(PRECO_CENTAVOS)}</span>
                <span className="text-muted-foreground">/mês</span>
              </p>
            </div>
            <ul className="space-y-2 text-sm">
              {INCLUSO.map((i) => (
                <li key={i} className="flex gap-2">
                  <Check className="text-primary mt-0.5 h-4 w-4 shrink-0" />
                  <span>{i}</span>
                </li>
              ))}
            </ul>
            {podeAssinar ? (
              <BotaoAssinar rotulo={`Assinar por ${reais(PRECO_CENTAVOS)}/mês`} />
            ) : (
              <p className="text-muted-foreground rounded-lg bg-muted p-3 text-sm">
                Só o dono ou um administrador da conta pode assinar. Peça para um deles entrar e concluir a assinatura.
              </p>
            )}
          </div>

          <p className="text-muted-foreground text-center text-xs">
            Pagamento seguro pela AbacatePay. Dúvidas:{" "}
            <a href="mailto:hello@agenciabyte.com" className="text-primary hover:underline">
              hello@agenciabyte.com
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}
