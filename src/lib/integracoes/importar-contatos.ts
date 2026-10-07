// Entrada de contatos (com a empresa) por API, em lote: n8n puxando uma lista do
// Apollo, um formulário, outro CRM... Rodar a mesma lista de novo não duplica:
// o contato é reconhecido pelo e-mail, senão pelo telefone, senão pelo LinkedIn,
// e no reencontro só os campos VAZIOS são completados — nunca sobrescreve o que o
// vendedor já editou.
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { obterOuCriarEmpresa } from "@/lib/companies";
import { EMAIL } from "@/lib/contato-obrigatorio";
import { findExistingContact, isUniqueViolation } from "@/lib/contacts/dedupe";

type Admin = SupabaseClient;

export const MAX_CONTATOS_POR_PEDIDO = 100;

const texto = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);

const empresaSchema = z
  .object({
    name: z.string().trim().min(1, "Informe o nome da empresa.").max(200),
    website: texto(500),
    linkedin_url: texto(500),
  })
  .strict();

export const contatoSchema = z
  .object({
    name: z.string().trim().min(1, "Informe o nome do contato.").max(200),
    email: texto(320)
      .transform((v) => v?.toLowerCase() ?? null)
      .refine((v) => !v || EMAIL.test(v), "E-mail inválido."),
    phone: texto(40),
    job_title: texto(200),
    linkedin_url: texto(500),
    empresa: empresaSchema.nullish(),
    source_metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()
  .refine((c) => c.email || (c.phone && c.phone.replace(/\D/g, "")) || c.linkedin_url, {
    message: "Informe ao menos e-mail, telefone ou LinkedIn do contato.",
  });
export type ContatoEntrada = z.infer<typeof contatoSchema>;

export const pedidoSchema = z
  .object({
    source: z.string().trim().min(1).max(60).default("api"),
    contatos: z.array(z.unknown()).min(1).max(MAX_CONTATOS_POR_PEDIDO),
  })
  .strict();

export type StatusItem = "criado" | "atualizado" | "existente" | "invalido" | "erro";
export interface ResultadoItem {
  indice: number;
  status: StatusItem;
  contact_id?: string;
  company_id?: string | null;
  erro?: string;
}

/** Valida um item do lote; o erro (em português) não derruba os outros itens. */
export function validarItem(item: unknown): { ok: true; contato: ContatoEntrada } | { ok: false; erro: string } {
  const r = contatoSchema.safeParse(item);
  if (r.success) return { ok: true, contato: r.data };
  return { ok: false, erro: r.error.issues.map((i) => `${i.path.join(".") || "contato"}: ${i.message}`).join("; ") };
}

interface Existente {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  linkedin_url: string | null;
  company: string | null;
  company_id: string | null;
  email_unsubscribed_at: string | null;
}

/** O que completar num contato que já existe: só o que está vazio nele. */
export function camposParaCompletar(
  atual: Omit<Existente, "id" | "email_unsubscribed_at">,
  novo: ContatoEntrada,
  empresa: { id: string | null; nome: string | null },
): Record<string, string> {
  const patch: Record<string, string> = {};
  const vazio = (v: string | null) => !v?.trim();
  if (vazio(atual.name)) patch.name = novo.name;
  if (vazio(atual.email) && novo.email) patch.email = novo.email;
  if (vazio(atual.phone) && novo.phone) patch.phone = novo.phone;
  if (vazio(atual.job_title) && novo.job_title) patch.job_title = novo.job_title;
  if (vazio(atual.linkedin_url) && novo.linkedin_url) patch.linkedin_url = novo.linkedin_url;
  // empresa: só vincula quem ainda não tem uma (mesma regra do painel da empresa)
  if (!atual.company_id && empresa.id) {
    patch.company_id = empresa.id;
    if (vazio(atual.company) && empresa.nome) patch.company = empresa.nome;
  }
  return patch;
}

const COLUNAS = "id,name,email,phone,job_title,linkedin_url,company,company_id,email_unsubscribed_at";

async function acharExistente(admin: Admin, accountId: string, c: ContatoEntrada): Promise<Existente | null> {
  const base = () => admin.from("contacts").select(COLUNAS).eq("account_id", accountId).limit(1);
  if (c.email) {
    const { data } = await base().ilike("email", c.email.replace(/[%_\\]/g, "\\$&")).maybeSingle();
    if (data) return data;
  }
  // telefone: mesma regra do webhook, do formulário e do CSV (tolera DDI/tronco)
  if (c.phone) {
    const achado = await findExistingContact(admin, accountId, c.phone);
    if (achado) return achado as unknown as Existente;
  }
  if (c.linkedin_url) {
    const { data } = await base().eq("linkedin_url", c.linkedin_url).maybeSingle();
    if (data) return data;
  }
  return null;
}

async function completar(admin: Admin, id: string, patch: Record<string, string>): Promise<void> {
  if (!Object.keys(patch).length) return;
  let { error } = await admin.from("contacts").update(patch).eq("id", id);
  // telefone já é de OUTRO contato da conta (índice único): completa o resto sem ele
  if (isUniqueViolation(error) && patch.phone) {
    const semTelefone = { ...patch };
    delete semTelefone.phone;
    if (!Object.keys(semTelefone).length) return;
    ({ error } = await admin.from("contacts").update(semTelefone).eq("id", id));
  }
  if (error) throw new Error(error.message);
}

async function importarUm(
  admin: Admin,
  conta: { accountId: string; userId: string },
  source: string,
  c: ContatoEntrada,
): Promise<Omit<ResultadoItem, "indice">> {
  const companyId = c.empresa
    ? await obterOuCriarEmpresa(admin, conta.accountId, conta.userId, {
        nome: c.empresa.name,
        website: c.empresa.website,
        linkedin: c.empresa.linkedin_url,
      })
    : null;
  const empresa = { id: companyId, nome: c.empresa?.name ?? null };

  const existente = await acharExistente(admin, conta.accountId, c);
  if (existente) {
    // pediu para sair: não mexe no cadastro
    if (existente.email_unsubscribed_at) return { status: "existente", contact_id: existente.id, company_id: existente.company_id };
    const patch = camposParaCompletar(existente, c, empresa);
    await completar(admin, existente.id, patch);
    return {
      status: Object.keys(patch).length ? "atualizado" : "existente",
      contact_id: existente.id,
      company_id: patch.company_id ?? existente.company_id,
    };
  }

  const { data, error } = await admin
    .from("contacts")
    .insert({
      account_id: conta.accountId,
      user_id: conta.userId,
      name: c.name,
      email: c.email,
      phone: c.phone ?? "",
      job_title: c.job_title,
      linkedin_url: c.linkedin_url,
      company: empresa.nome,
      company_id: companyId,
      source,
      source_metadata: c.source_metadata ?? {},
    })
    .select("id")
    .single();
  if (error) {
    // corrida com outro pedido igual: o contato acabou de nascer
    if (isUniqueViolation(error)) {
      const agora = await acharExistente(admin, conta.accountId, c);
      if (agora) return { status: "existente", contact_id: agora.id, company_id: agora.company_id };
    }
    throw new Error(error.message);
  }
  return { status: "criado", contact_id: data.id, company_id: companyId };
}

/** Importa o lote item a item; um item com problema não impede os demais. */
export async function importarContatos(
  admin: Admin,
  conta: { accountId: string; userId: string },
  source: string,
  itens: unknown[],
): Promise<ResultadoItem[]> {
  const resultados: ResultadoItem[] = [];
  for (const [indice, item] of itens.entries()) {
    const v = validarItem(item);
    if (!v.ok) {
      resultados.push({ indice, status: "invalido", erro: v.erro });
      continue;
    }
    try {
      resultados.push({ indice, ...(await importarUm(admin, conta, source, v.contato)) });
    } catch (e) {
      console.error("[importar-contatos] item", indice, e);
      resultados.push({ indice, status: "erro", erro: "Falha ao gravar o contato." });
    }
  }
  return resultados;
}

export function resumir(resultados: ResultadoItem[]): Record<StatusItem, number> {
  const r: Record<StatusItem, number> = { criado: 0, atualizado: 0, existente: 0, invalido: 0, erro: 0 };
  for (const x of resultados) r[x.status]++;
  return r;
}
