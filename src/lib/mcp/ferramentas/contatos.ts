import { z } from "zod";
import { importarContatos } from "@/lib/integracoes/importar-contatos";
import { definir, ErroDeFerramenta } from "../tipos";

const COLUNAS = "id,name,first_name,last_name,email,phone,job_title,linkedin_url,company,company_id,created_at";

/** Tira do texto o que quebraria a sintaxe do filtro `or()` do PostgREST ou viraria curinga. */
export function limparBusca(texto: string): string {
  return texto.replace(/[,()%_*\\"]/g, " ").replace(/\s+/g, " ").trim();
}

export const buscarContatos = definir({
  nome: "buscar_contatos",
  descricao:
    "Busca contatos da conta por nome, e-mail, empresa ou telefone (trecho de qualquer um deles). " +
    "Sem `busca`, devolve os contatos mais recentes. Use antes de criar negócio, tarefa ou nota, para achar o `id` do contato.",
  acesso: "leitura",
  entrada: z.object({
    busca: z.string().trim().max(100).optional().describe("Trecho do nome, e-mail, empresa ou telefone."),
    empresa_id: z.string().uuid().optional().describe("Só contatos desta empresa."),
    limite: z.number().int().min(1).max(50).default(20),
  }),
  async executar(ctx, a) {
    let q = ctx.admin
      .from("contacts")
      .select(COLUNAS)
      .eq("account_id", ctx.accountId)
      .order("created_at", { ascending: false })
      .limit(a.limite);
    if (a.empresa_id) q = q.eq("company_id", a.empresa_id);
    const termo = a.busca ? limparBusca(a.busca) : "";
    if (termo) {
      const filtros = [`name.ilike.%${termo}%`, `email.ilike.%${termo}%`, `company.ilike.%${termo}%`];
      const digitos = termo.replace(/\D/g, "");
      if (digitos.length >= 4) filtros.push(`phone_normalized.ilike.%${digitos}%`);
      q = q.or(filtros.join(","));
    }
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return { total: data?.length ?? 0, contatos: data ?? [] };
  },
});

export const criarContato = definir({
  nome: "criar_contato",
  descricao:
    "Cria um contato (e a empresa dele, se informada). Se já existir alguém com o mesmo e-mail, telefone ou LinkedIn, " +
    "NÃO duplica: devolve o existente e só completa campos que estavam vazios, sem sobrescrever nada. " +
    "Precisa de nome e de ao menos e-mail, telefone ou LinkedIn.",
  acesso: "escrita",
  entrada: z.object({
    name: z.string().max(200).optional().describe("Nome completo. Alternativa a first_name + last_name."),
    first_name: z.string().max(100).optional(),
    last_name: z.string().max(100).optional(),
    email: z.string().max(320).optional(),
    phone: z.string().max(40).optional().describe("Com DDI e DDD, ex.: 5511999990000."),
    job_title: z.string().max(200).optional().describe("Cargo."),
    linkedin_url: z.string().max(500).optional(),
    empresa: z
      .object({
        name: z.string().max(200),
        website: z.string().max(500).optional(),
        linkedin_url: z.string().max(500).optional(),
      })
      .optional(),
  }),
  async executar(ctx, a) {
    // a validação de verdade (e-mail, nome, ao menos um meio de contato) é a da API de contatos
    const [r] = await importarContatos(ctx.admin, ctx, "mcp", [a]);
    if (r.status === "invalido") throw new ErroDeFerramenta(r.erro ?? "Contato inválido.");
    if (r.status === "erro") throw new Error(r.erro);
    const mensagem = {
      criado: "Contato criado.",
      atualizado: "O contato já existia: só os campos vazios foram completados.",
      existente: "O contato já existia (ou pediu para não receber e-mails): nada foi alterado.",
    }[r.status];
    return { status: r.status, contact_id: r.contact_id, company_id: r.company_id ?? null, mensagem };
  },
});
