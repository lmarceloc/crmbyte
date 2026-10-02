// Contato criado ou vinculado a partir da aba "Contatos" do painel da empresa.
//
// Mesma ideia do negócio: o contato nasce já da empresa (`contacts.company_id`),
// sem o vendedor sair do painel. Só o nome é obrigatório — como no cadastro
// rápido do negócio e na prospecção B2B, que também criam contato sem telefone
// (`phone` vazio não entra no índice único).

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ContatoDaEmpresaEntrada {
  nome: string;
  cargo?: string;
  email?: string;
  telefone?: string;
  empresa: { id: string; name: string };
  accountId: string;
  userId: string;
}

export interface ContatoDaEmpresaLinha {
  account_id: string;
  user_id: string;
  name: string;
  email: string | null;
  phone: string;
  job_title: string | null;
  company: string;
  company_id: string;
}

/** Linha de `contacts` do contato novo, ou o motivo (já em português) de não dar para criar. */
export function montarContatoDaEmpresa(
  e: ContatoDaEmpresaEntrada,
): { ok: true; contato: ContatoDaEmpresaLinha } | { ok: false; erro: string } {
  const nome = e.nome.trim();
  if (!nome) return { ok: false, erro: "Dê um nome ao contato." };
  const email = (e.email ?? "").trim();
  if (email && !EMAIL.test(email)) return { ok: false, erro: "E-mail inválido." };
  return {
    ok: true,
    contato: {
      account_id: e.accountId,
      user_id: e.userId,
      name: nome,
      email: email || null,
      phone: (e.telefone ?? "").trim(),
      job_title: (e.cargo ?? "").trim() || null,
      company: e.empresa.name,
      company_id: e.empresa.id,
    },
  };
}

/**
 * O que gravar para vincular um contato que já existe à empresa. Só vincula quem
 * ainda NÃO tem empresa: tirar um contato de outra empresa é decisão que o
 * vendedor toma na ficha dele, não aqui. O texto legado `company` só é
 * preenchido se estiver vazio — nunca sobrescreve o que a pessoa já escreveu.
 */
export function vinculoDoContato(
  atual: { company_id?: string | null; company?: string | null },
  empresa: { id: string; name: string },
): { ok: true; campos: { company_id: string; company?: string } } | { ok: false; erro: string } {
  if (atual.company_id) {
    return {
      ok: false,
      erro: atual.company_id === empresa.id ? "Este contato já é desta empresa." : "Este contato já pertence a outra empresa.",
    };
  }
  return {
    ok: true,
    campos: { company_id: empresa.id, ...(atual.company?.trim() ? {} : { company: empresa.name }) },
  };
}
