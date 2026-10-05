import { z } from "zod";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import { fail, json, toErrorResponse, validationFailed } from "@/lib/api-utils";
import { requireRole } from "@/lib/auth/account";
import { obterChave } from "@/lib/integracoes/chaves";
import { IaError } from "@/lib/ia/erro";
import { lerSite } from "@/lib/ia/firecrawl";
import { gerarEmail } from "@/lib/ia/gerar-email";
import { completar } from "@/lib/ia/openrouter";
import { LIMITE_SKILLS, type SkillDaIa } from "@/lib/ia/prompt";
import { normalizarUrl } from "@/lib/url";

export const dynamic = "force-dynamic";
// Firecrawl (até ~25 s) + modelo gratuito (até ~45 s) em sequência.
export const maxDuration = 60;

const corpo = z
  .object({
    lead_name: z.string().trim().min(1).max(200),
    lead_title: z.string().trim().max(200).default(""),
    lead_linkedin: z.string().trim().max(500).default(""),
    company_name: z.string().trim().min(1).max(200),
    company_site: z.string().trim().min(1).max(500),
    skill_ids: z.array(z.string().uuid()).max(10).default([]),
  })
  .strict();

export async function POST(request: Request) {
  try {
    const ctx = await requireRole("agent");
    const c = corpo.safeParse(await request.json().catch(() => null));
    if (!c.success) return validationFailed(c.error);

    const site = normalizarUrl(c.data.company_site);
    if (!site) return fail("validation_failed", "Site inválido: use um link http(s).", 422);
    const linkedin = c.data.lead_linkedin ? normalizarUrl(c.data.lead_linkedin) : "";
    if (linkedin === null) return fail("validation_failed", "LinkedIn inválido: use um link http(s).", 422);

    // skills da própria conta (RLS), na ordem em que foram escolhidas
    let skills: SkillDaIa[] = [];
    if (c.data.skill_ids.length > 0) {
      const { data, error } = await ctx.supabase
        .from("ai_skills")
        .select("id,name,description,content")
        .eq("account_id", ctx.accountId)
        .in("id", c.data.skill_ids);
      if (error) return fail("db_error", "Não foi possível carregar as skills.", 500);
      const porId = new Map((data ?? []).map((s) => [s.id as string, s]));
      const achadas = c.data.skill_ids.map((id) => porId.get(id));
      if (achadas.some((s) => !s)) return fail("validation_failed", "Uma das skills escolhidas não existe mais.", 422);
      skills = achadas.map((s) => ({
        nome: s!.name as string,
        descricao: String(s!.description ?? ""),
        conteudo: s!.content as string,
      }));
      const total = skills.reduce((t, s) => t + s.conteudo.length, 0);
      if (total > LIMITE_SKILLS)
        return fail(
          "validation_failed",
          `As skills escolhidas somam ${total.toLocaleString("pt-BR")} caracteres; o máximo é ${LIMITE_SKILLS.toLocaleString("pt-BR")}.`,
          422,
        );
    }

    // quem está prospectando (Configurações → IA); sem isso o e-mail sairia genérico
    const { data: perfil, error: erroPerfil } = await ctx.supabase
      .from("ai_company_profile")
      .select("company_name,what_we_do,services")
      .eq("account_id", ctx.accountId)
      .maybeSingle();
    if (erroPerfil) return fail("db_error", "Não foi possível carregar os dados da sua empresa.", 500);
    const nomeDaEmpresa = String(perfil?.company_name ?? "").trim();
    const oQueFaz = String(perfil?.what_we_do ?? "").trim();
    const servicos = String(perfil?.services ?? "").trim();
    if (!nomeDaEmpresa || !servicos)
      return fail(
        "ia_profile_missing",
        "Informe o nome da sua empresa e os serviços que ela oferece em Configurações → IA antes de gerar e-mails.",
        400,
      );

    const admin = supabaseAdmin();
    const [chaveOpenRouter, chaveFirecrawl] = await Promise.all([
      obterChave(admin, ctx.accountId, "openrouter"),
      obterChave(admin, ctx.accountId, "firecrawl"),
    ]);
    if (!chaveOpenRouter)
      return fail("openrouter_key_missing", "Cadastre a chave do OpenRouter em Configurações → Chaves de API.", 400);

    const resultado = await gerarEmail(
      {
        sobreNos: { nome: nomeDaEmpresa, oQueFaz, servicos },
        lead: {
          nomeDoLead: c.data.lead_name,
          cargo: c.data.lead_title,
          linkedin,
          empresa: c.data.company_name,
          site,
        },
        skills,
      },
      {
        // sem chave do Firecrawl o e-mail sai só com os dados digitados, e a tela avisa
        lerSite: (url) => {
          if (!chaveFirecrawl)
            throw new IaError("A chave do Firecrawl não está cadastrada em Configurações → Chaves de API.", 400, "firecrawl_key_missing");
          return lerSite(chaveFirecrawl, url);
        },
        completar: (mensagens) => completar(chaveOpenRouter, mensagens),
      },
    );

    return json({
      assunto: resultado.assunto,
      corpo: resultado.corpo,
      site_lido: resultado.siteLido,
      aviso: resultado.aviso,
    });
  } catch (e) {
    if (e instanceof IaError) return fail(e.code, e.message, e.status);
    return toErrorResponse(e);
  }
}
