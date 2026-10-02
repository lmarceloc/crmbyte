// Negócio criado a partir da empresa (aba "Negócios" do painel da empresa).
//
// O fluxo é EMPRESA → NEGÓCIO → CONTATO: o negócio nasce só com o nome e já
// amarrado à empresa (`deals.company_id`); o contato entra depois, em
// `deal_contacts`. `deals.contact_id` é nulo até lá (nullable desde a 004, e o
// trigger da 027 espelha o contato principal quando ele chegar).

/** Funil em que o negócio nasce: o escolhido, se ainda existe; senão o primeiro (a lista vem por criação). */
export function funilInicial(funis: { id: string }[], escolhido?: string | null): string {
  if (escolhido && funis.some((f) => f.id === escolhido)) return escolhido;
  return funis[0]?.id ?? "";
}

/** Etapa em que o negócio nasce: a de menor posição (a primeira coluna do kanban). */
export function etapaInicial(etapas: { id: string; position: number }[]): string {
  let primeira: { id: string; position: number } | undefined;
  for (const e of etapas) if (!primeira || e.position < primeira.position) primeira = e;
  return primeira?.id ?? "";
}

export interface NegocioDaEmpresaEntrada {
  titulo: string;
  empresaId: string;
  funilId: string;
  etapaId: string;
  accountId: string;
  userId: string;
  moeda?: string | null;
}

export interface NegocioDaEmpresaLinha {
  account_id: string;
  user_id: string;
  company_id: string;
  pipeline_id: string;
  stage_id: string;
  title: string;
  value: number;
  currency?: string;
  status: "open";
}

/** Linha de `deals` do negócio novo, ou o motivo (já em português) de não dar para criar. */
export function montarNegocioDaEmpresa(
  e: NegocioDaEmpresaEntrada,
): { ok: true; negocio: NegocioDaEmpresaLinha } | { ok: false; erro: string } {
  const titulo = e.titulo.trim();
  if (!titulo) return { ok: false, erro: "Dê um nome ao negócio." };
  if (!e.funilId || !e.etapaId) return { ok: false, erro: "Escolha o funil e a etapa do negócio." };
  return {
    ok: true,
    negocio: {
      account_id: e.accountId,
      user_id: e.userId,
      company_id: e.empresaId,
      pipeline_id: e.funilId,
      stage_id: e.etapaId,
      title: titulo,
      value: 0,
      ...(e.moeda ? { currency: e.moeda } : {}),
      status: "open",
    },
  };
}
