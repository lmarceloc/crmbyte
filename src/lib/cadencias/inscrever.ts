// Inscrição de contatos ou de um negócio numa cadência de e-mail. Vive aqui, e não na
// rota, para a tela e o MCP seguirem exatamente as mesmas regras: só cadência ativa, só
// quem tem e-mail e não pediu para sair, e um lead fica em uma cadência por vez.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import { ocupacaoEmOutraCadencia, textoDaOcupacao } from "@/lib/cadencias/inscricao-do-negocio";
import { inscricoesAtivasEmOutras } from "@/lib/cadencias/ocupacao";
import type { inscreverNegocioSchema } from "@/lib/cadencias/schemas";

type Admin = SupabaseClient;
export type EntradaDeInscricao = z.infer<typeof inscreverNegocioSchema>;

export type ResultadoDaInscricao =
  | { ok: true; inscricoes: Record<string, unknown>[]; inscritos: number; ignorados: number }
  | { ok: false; code: string; message: string; status: number };

const erro = (code: string, message: string, status: number): ResultadoDaInscricao => ({ ok: false, code, message, status });

export async function inscreverEmCadencia(
  admin: Admin,
  conta: { accountId: string; userId: string },
  cadenceId: string,
  entrada: EntradaDeInscricao,
): Promise<ResultadoDaInscricao> {
    const { data: cadencia } = await admin
      .from("email_cadences")
      .select("id,status")
      .eq("id", cadenceId)
      .eq("account_id", conta.accountId)
      .maybeSingle();
    if (!cadencia) return erro("cadencia_nao_encontrada", "Cadência não encontrada.", 404);
    if (cadencia.status !== "ativa")
      return erro("cadencia_estado_invalido", "A cadência precisa estar ativa para inscrever.", 409);

    type C = { email: string | null; email_unsubscribed_at: string | null; company_id?: string | null };
    const um = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
    // Alvo: contatos de um negócio, ou contatos soltos (o negócio é criado depois, se o lead evoluir).
    let dealId: string | null = null;
    let todos: { id: string; c: C | null }[];
    let companyIds: string[];
    if ("deal_id" in entrada) {
      const { data: deal } = await admin
        .from("deals")
        .select("id,status,company_id")
        .eq("id", entrada.deal_id)
        .eq("account_id", conta.accountId)
        .maybeSingle();
      if (!deal) return erro("cadencia_lead_indisponivel", "Negócio não encontrado.", 409);
      if (deal.status !== "open")
        return erro("cadencia_lead_indisponivel", "Só negócios em aberto podem entrar numa cadência.", 409);
      dealId = deal.id as string;
      let qc = admin
        .from("deal_contacts")
        .select("contact_id, contacts(email,email_unsubscribed_at)")
        .eq("deal_id", deal.id)
        .eq("account_id", conta.accountId);
      if (entrada.contact_id) qc = qc.eq("contact_id", entrada.contact_id);
      const { data: vinculos } = await qc;
      todos = (vinculos ?? []).map((v) => ({ id: v.contact_id as string, c: um(v.contacts as C | C[] | null) }));
      if (todos.length === 0)
        return erro("cadencia_lead_indisponivel", "Este negócio não tem contatos. Adicione um contato ao negócio.", 409);
      companyIds = deal.company_id ? [deal.company_id as string] : [];
    } else {
      const { data: contatos } = await admin
        .from("contacts")
        .select("id,email,email_unsubscribed_at,company_id")
        .eq("account_id", conta.accountId)
        .in("id", [...new Set(entrada.contact_ids)]);
      todos = (contatos ?? []).map((c) => ({ id: c.id as string, c: c as C }));
      if (todos.length === 0) return erro("cadencia_lead_indisponivel", "Contato não encontrado.", 409);
      companyIds = [...new Set(todos.map((t) => t.c?.company_id).filter((x): x is string => !!x))];
    }
    // Já ativo NESTA cadência (sem negócio ou por outro negócio): não recebe duas sequências.
    const { data: jaAtivos } = await admin
      .from("email_cadence_enrollments")
      .select("contact_id")
      .eq("cadence_id", cadenceId)
      .eq("account_id", conta.accountId)
      .eq("status", "ativa")
      .in("contact_id", todos.map((t) => t.id));
    const ativosAqui = new Set((jaAtivos ?? []).map((r) => r.contact_id as string));
    const elegiveis = todos.filter((t) => t.c?.email?.trim() && !t.c.email_unsubscribed_at && !ativosAqui.has(t.id));
    if (elegiveis.length === 0 && ativosAqui.size > 0)
      return erro("cadencia_inscricao_existente", "Estes contatos já estão nesta cadência.", 409);
    if (elegiveis.length === 0)
      return erro(
        "cadencia_lead_indisponivel",
        "Nenhum contato pode receber e-mail (sem e-mail ou descadastrado).",
        409,
      );

    // Um lead fica numa cadência por vez: negócio, empresa ou contato já ativo em outra = recusa.
    const ativas = await inscricoesAtivasEmOutras(
      admin,
      cadenceId,
      { dealIds: dealId ? [dealId] : [], contactIds: elegiveis.map((t) => t.id), companyIds },
      conta.accountId,
    );
    // Contatos soltos: a empresa só bloqueia se a ocupação vier de OUTRO contato dela
    // — cada contato é avaliado com a própria empresa.
    const ocupacao = dealId
      ? ocupacaoEmOutraCadencia({ id: dealId, company_id: companyIds[0] ?? null, contatos: elegiveis.map((t) => t.id) }, ativas)
      : elegiveis
          .map((t) => ocupacaoEmOutraCadencia({ id: null, company_id: t.c?.company_id ?? null, contatos: [t.id] }, ativas))
          .find((o) => o) ?? null;
    if (ocupacao)
      return erro(
        "cadencia_lead_indisponivel",
        `${textoDaOcupacao(ocupacao)} Um lead fica em uma cadência por vez: pare a outra inscrição antes.`,
        409,
      );

    const { data: novas, error } = await admin
      .from("email_cadence_enrollments")
      .upsert(
        elegiveis.map((t) => ({
          account_id: conta.accountId,
          cadence_id: cadenceId,
          deal_id: dealId,
          contact_id: t.id,
          origem: "manual",
          inscrito_por: conta.userId,
        })),
        { onConflict: "cadence_id,deal_id,contact_id", ignoreDuplicates: true },
      )
      .select("*");
    if (error) return erro("db_error", error.message, 500);
    if (!novas?.length)
      return erro("cadencia_inscricao_existente", "Estes contatos já estão nesta cadência.", 409);
    await admin.from("email_cadence_events").insert(
      novas.map((n) => ({
        account_id: conta.accountId,
        cadence_id: cadenceId,
        enrollment_id: n.id,
        deal_id: dealId,
        tipo: "inscrito",
        ator_user_id: conta.userId,
      })),
    );
  return { ok: true, inscricoes: novas, inscritos: novas.length, ignorados: todos.length - novas.length };
}
