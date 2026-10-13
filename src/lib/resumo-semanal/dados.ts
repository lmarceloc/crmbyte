// Números do resumo semanal de UMA conta (cliente admin: sempre filtra por account_id).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Semana } from "./periodo";

export type Temperatura = "frio" | "morno" | "quente";

export interface PorDono {
  nome: string;
  abertos: number;
  quentes: number;
  novos: number;
  tarefasPendentes: number;
}

export interface ResumoSemanal {
  negocios: { abertos: number; valorAberto: number; novos: number; ganhos: number; perdidos: number };
  tarefas: { realizadas: number; adiadas: number; atrasadas: number; pendentes: number };
  novosContatos: number;
  cadencias: { ativas: number; leadsEmCadencia: number; emailsEnviados: number; aberturas: number };
  temperatura: Record<Temperatura, number>;
  porDono: PorDono[];
}

const PAGINA = 1000;

/** Lê todas as linhas (o PostgREST corta em 1000 por resposta). */
async function todas<T>(consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const saida: T[] = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await consulta(de, de + PAGINA - 1);
    if (error) throw error;
    saida.push(...(data ?? []));
    if (!data || data.length < PAGINA) return saida;
  }
}

const dentro = (iso: string | null, s: Semana) => {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= s.inicio.getTime() && t < s.fim.getTime();
};

export async function montarResumo(admin: SupabaseClient, accountId: string, semana: Semana): Promise<ResumoSemanal> {
  const ini = semana.inicio.toISOString();
  const fim = semana.fim.toISOString();

  type Deal = {
    status: string | null;
    value: number | null;
    temperature: string | null;
    assigned_to: string | null;
    created_at: string | null;
    closed_at: string | null;
  };
  type Tarefa = {
    status: string;
    prazo_em: string | null;
    concluida_em: string | null;
    adiada_em: string | null;
    responsavel_id: string | null;
  };

  const [deals, tarefas, perfis, contatos, cadAtivas, inscritos, enviados, abertos] = await Promise.all([
    // abertos agora + qualquer um criado/fechado na semana
    todas<Deal>((de, ate) =>
      admin
        .from("deals")
        .select("status,value,temperature,assigned_to,created_at,closed_at")
        .eq("account_id", accountId)
        .or(`status.eq.open,created_at.gte.${ini},closed_at.gte.${ini}`)
        .range(de, ate),
    ),
    todas<Tarefa>((de, ate) =>
      admin
        .from("tarefas")
        .select("status,prazo_em,concluida_em,adiada_em,responsavel_id")
        .eq("account_id", accountId)
        .or(`status.eq.pendente,concluida_em.gte.${ini},adiada_em.gte.${ini}`)
        .range(de, ate),
    ),
    admin.from("profiles").select("id,user_id,full_name,email").eq("account_id", accountId),
    admin
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("account_id", accountId)
      .gte("created_at", ini)
      .lt("created_at", fim),
    admin
      .from("email_cadences")
      .select("id", { count: "exact", head: true })
      .eq("account_id", accountId)
      .eq("status", "ativa"),
    admin
      .from("email_cadence_enrollments")
      .select("id", { count: "exact", head: true })
      .eq("account_id", accountId)
      .eq("status", "ativa"),
    admin
      .from("email_cadence_events")
      .select("id", { count: "exact", head: true })
      .eq("account_id", accountId)
      .eq("tipo", "email_enviado")
      .gte("created_at", ini)
      .lt("created_at", fim),
    admin
      .from("email_cadence_events")
      .select("id", { count: "exact", head: true })
      .eq("account_id", accountId)
      .eq("tipo", "aberto")
      .gte("created_at", ini)
      .lt("created_at", fim),
  ]);

  const perfisLista = (perfis.data ?? []) as { id: string; user_id: string; full_name: string | null; email: string | null }[];
  const nomePorPerfil = new Map(perfisLista.map((p) => [p.id, p.full_name || p.email || "—"]));
  const perfilPorUsuario = new Map(perfisLista.map((p) => [p.user_id, p.id]));

  const donos = new Map<string, PorDono>();
  const dono = (perfilId: string | null) => {
    const chave = perfilId && nomePorPerfil.has(perfilId) ? perfilId : "_sem";
    let d = donos.get(chave);
    if (!d) {
      d = { nome: chave === "_sem" ? "Sem dono" : nomePorPerfil.get(chave)!, abertos: 0, quentes: 0, novos: 0, tarefasPendentes: 0 };
      donos.set(chave, d);
    }
    return d;
  };

  const temperatura: Record<Temperatura, number> = { frio: 0, morno: 0, quente: 0 };
  const negocios = { abertos: 0, valorAberto: 0, novos: 0, ganhos: 0, perdidos: 0 };
  for (const d of deals) {
    if (dentro(d.created_at, semana)) {
      negocios.novos++;
      dono(d.assigned_to).novos++;
    }
    if (d.status === "won" && dentro(d.closed_at, semana)) negocios.ganhos++;
    if (d.status === "lost" && dentro(d.closed_at, semana)) negocios.perdidos++;
    if (d.status !== "open") continue;
    negocios.abertos++;
    negocios.valorAberto += Number(d.value) || 0;
    const t = (["frio", "morno", "quente"] as const).find((x) => x === d.temperature) ?? "frio";
    temperatura[t]++;
    const x = dono(d.assigned_to);
    x.abertos++;
    if (t === "quente") x.quentes++;
  }

  const agora = Date.now();
  const tarefasResumo = { realizadas: 0, adiadas: 0, atrasadas: 0, pendentes: 0 };
  for (const t of tarefas) {
    if (t.status === "concluida" && dentro(t.concluida_em, semana)) tarefasResumo.realizadas++;
    if (dentro(t.adiada_em, semana)) tarefasResumo.adiadas++;
    if (t.status !== "pendente") continue;
    tarefasResumo.pendentes++;
    if (t.prazo_em && new Date(t.prazo_em).getTime() < agora) tarefasResumo.atrasadas++;
    dono(t.responsavel_id ? (perfilPorUsuario.get(t.responsavel_id) ?? null) : null).tarefasPendentes++;
  }

  return {
    negocios,
    tarefas: tarefasResumo,
    novosContatos: contatos.count ?? 0,
    cadencias: {
      ativas: cadAtivas.count ?? 0,
      leadsEmCadencia: inscritos.count ?? 0,
      emailsEnviados: enviados.count ?? 0,
      aberturas: abertos.count ?? 0,
    },
    temperatura,
    porDono: [...donos.values()]
      .filter((d) => d.abertos || d.novos || d.tarefasPendentes)
      .sort((a, b) => (a.nome === "Sem dono" ? 1 : b.nome === "Sem dono" ? -1 : b.abertos - a.abertos)),
  };
}
