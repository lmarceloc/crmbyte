// Motor do "Analisar Deals": junta os sinais por regra e o julgamento da IA num
// score de atenção de 0 a 100 por negócio. Função pura (testável).
//
//   score = média ponderada dos critérios ESCOLHIDOS (peso de Configurações) × 100
//
// Cada critério vira uma intensidade de 0 a 1. Um critério da IA só entra quando
// a resposta existe e a confiança passa do mínimo; senão sai da média daquele
// negócio (não puxa o score para baixo) e o item avisa "IA incerta".
import {
  ehCriterioDeIa,
  INFO_DOS_CRITERIOS,
  type Criterio,
  type CriterioDeIa,
  type CriterioDeRegra,
} from "./criterios";
import type { ConfigAnalisarDeals } from "./config";
import { notaDoNivel, rotuloDoNivel, ROTULO_DA_ACAO, type AcaoSugerida } from "./perguntas";
import type { SinaisDoNegocio } from "./sinais";

export type FaixaDePrioridade = "critica" | "alta" | "media" | "baixa";

/** Faixas: > 80 crítica, 60–80 alta, 40–60 média, < 40 baixa (o limite de baixo pertence à faixa de cima). */
export function faixaDoScore(score: number): FaixaDePrioridade {
  if (score > 80) return "critica";
  if (score >= 60) return "alta";
  if (score >= 40) return "media";
  return "baixa";
}

export const ROTULO_DA_FAIXA: Record<FaixaDePrioridade, string> = {
  critica: "Crítica",
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
};

/** O que a IA respondeu sobre um negócio. */
export interface RespostaDaIa {
  scores: Partial<Record<CriterioDeIa, { nivel: number; confianca: number | null }>>;
  acao?: { opcao: AcaoSugerida; confianca: number | null };
  /** Modo reduzido (modelo gratuito): sem probabilidades, a confiança não existe. */
  estimado: boolean;
}

export interface ItemPrioritario {
  id: string;
  sinais: SinaisDoNegocio;
  /** 0–100, arredondado. */
  score: number;
  faixa: FaixaDePrioridade;
  motivos: string[];
  acao: string;
  /** A ação veio da IA (e não da regra). */
  acaoDaIa: boolean;
  /** Pediu IA, mas a resposta veio com confiança baixa. */
  iaIncerta: boolean;
  /** Pediu IA, mas o negócio não foi julgado (sem texto ou falha). */
  iaSemDados: boolean;
  /** A resposta da IA é uma estimativa do modo reduzido. */
  estimado: boolean;
}

const limitar01 = (n: number) => Math.min(1, Math.max(0, n));
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const confiancaTexto = (c: number) => c.toFixed(2).replace(".", ",");

type Intensidades = Partial<Record<CriterioDeRegra, number>>;

/** Posição (0–1) de cada valor entre os analisados; empates ficam no meio. */
function posicoesDeValor(sinais: SinaisDoNegocio[]): Map<string, number> {
  const n = sinais.length;
  const posicoes = new Map<string, number>();
  for (const s of sinais) {
    let menores = 0;
    let iguais = 0;
    for (const o of sinais) {
      if (o.valor < s.valor) menores++;
      else if (o.valor === s.valor && o !== s) iguais++;
    }
    posicoes.set(s.id, n <= 1 ? 0.5 : (menores + iguais / 2 + 0.5) / n);
  }
  return posicoes;
}

const PESO_DA_TEMPERATURA: Record<string, number> = {
  sem_interesse: 0,
  frio: 0.15,
  morno: 0.5,
  quente: 0.85,
  quase_fechando: 1,
};

function intensidadesDeRegra(s: SinaisDoNegocio, c: ConfigAnalisarDeals, posicaoDoValor: number): Intensidades {
  return {
    // nunca houve contato registrado = o máximo
    sem_contato: s.diasSemContato === null ? 1 : limitar01(s.diasSemContato / c.diasSemContato),
    sem_atualizacao: s.diasSemAtualizar === null ? 0 : limitar01(s.diasSemAtualizar / c.diasSemAtualizacao),
    parado_na_etapa: s.diasNaEtapa === null ? 0 : limitar01(s.diasNaEtapa / c.diasParadoNaEtapa),
    maior_valor: posicaoDoValor,
    menor_valor: 1 - posicaoDoValor,
    aberturas: s.leadQuente ? 1 : limitar01(s.aberturas / s.limiarDeAberturas),
    resposta_sem_acao:
      s.diasRespostaSemAcao === null ? 0 : limitar01(0.6 + (0.4 * s.diasRespostaSemAcao) / c.diasSemContato),
    fechamento_proximo:
      s.diasParaFechar === null
        ? 0
        : s.diasParaFechar <= 0
          ? 1
          : s.diasParaFechar > c.diasFechamentoProximo
            ? 0
            : limitar01(1 - s.diasParaFechar / (c.diasFechamentoProximo + 1)),
    sem_proxima_tarefa: s.temTarefaPendente ? 0 : 1,
    temperatura: s.temperatura ? (PESO_DA_TEMPERATURA[s.temperatura] ?? 0) : 0,
  };
}

function motivoDeRegra(c: CriterioDeRegra, s: SinaisDoNegocio): string {
  switch (c) {
    case "sem_contato":
      return s.diasSemContato === null
        ? "Nenhum contato registrado"
        : s.diasSemContato === 0
          ? "Contato hoje"
          : `${plural(s.diasSemContato, "dia", "dias")} sem contato`;
    case "sem_atualizacao":
      return `Sem atualização há ${plural(s.diasSemAtualizar ?? 0, "dia", "dias")}`;
    case "parado_na_etapa":
      return `Parado há ${plural(s.diasNaEtapa ?? 0, "dia", "dias")}${s.etapa ? ` em ${s.etapa}` : " na etapa"}`;
    case "maior_valor":
      return "Entre os negócios de maior valor";
    case "menor_valor":
      return "Entre os negócios de menor valor";
    case "aberturas":
      return s.leadQuente
        ? `Lead quente: abriu o e-mail ${s.aberturas}x`
        : `Abriu o e-mail ${s.aberturas}x (quente com ${s.limiarDeAberturas}x)`;
    case "resposta_sem_acao":
      return s.diasRespostaSemAcao === 0
        ? "Respondeu hoje e ninguém agiu"
        : `Respondeu há ${plural(s.diasRespostaSemAcao ?? 0, "dia", "dias")} e ninguém agiu`;
    case "fechamento_proximo": {
      const d = s.diasParaFechar ?? 0;
      return d < 0
        ? `Previsão de fechamento venceu há ${plural(-d, "dia", "dias")}`
        : d === 0
          ? "Previsão de fechamento é hoje"
          : `Fecha em ${plural(d, "dia", "dias")}`;
    }
    case "sem_proxima_tarefa":
      return "Sem tarefa pendente";
    case "temperatura":
      return s.temperatura === "quase_fechando"
        ? "Marcado como quase fechando"
        : s.temperatura === "quente"
          ? "Marcado como quente"
          : "Marcado como morno";
  }
}

const ACAO_DA_REGRA: Record<CriterioDeRegra, string> = {
  sem_contato: "Fazer contato hoje",
  sem_atualizacao: "Atualizar o negócio",
  parado_na_etapa: "Decidir o próximo passo da etapa",
  maior_valor: "Dar atenção especial: negócio de valor alto",
  menor_valor: "Resolver rápido ou descartar",
  aberturas: "Ligar para o lead: ele está lendo os e-mails",
  resposta_sem_acao: "Responder o cliente hoje",
  fechamento_proximo: "Confirmar o fechamento",
  sem_proxima_tarefa: "Agendar a próxima tarefa",
  temperatura: "Fazer follow-up enquanto o interesse está alto",
};

interface Contribuicao {
  criterio: Criterio;
  intensidade: number;
  peso: number;
  motivo: string;
}

/**
 * Calcula e ordena (maior atenção primeiro) os negócios para os critérios escolhidos.
 * `ia` traz o que a IA respondeu por negócio (ausente = não julgado).
 */
export function calcularPrioridades(
  sinais: SinaisDoNegocio[],
  escolhidos: Criterio[],
  config: ConfigAnalisarDeals,
  ia: Record<string, RespostaDaIa | undefined> = {},
): ItemPrioritario[] {
  const posicoes = posicoesDeValor(sinais);
  const criteriosDeIa = escolhidos.filter(ehCriterioDeIa);
  const criteriosDeRegra = escolhidos.filter((c): c is CriterioDeRegra => !ehCriterioDeIa(c));

  const itens = sinais.map((s): ItemPrioritario => {
    const regras = intensidadesDeRegra(s, config, posicoes.get(s.id) ?? 0.5);
    const resposta = ia[s.id];
    const contribuicoes: Contribuicao[] = [];

    for (const c of criteriosDeRegra) {
      const intensidade = regras[c] ?? 0;
      contribuicoes.push({ criterio: c, intensidade, peso: config.pesos[c], motivo: motivoDeRegra(c, s) });
    }

    let iaIncerta = false;
    let iaSemDados = false;
    for (const c of criteriosDeIa) {
      const r = resposta?.scores[c];
      if (!r) {
        iaSemDados = true;
        continue;
      }
      if (r.confianca !== null && r.confianca < config.confiancaMinima) {
        iaIncerta = true;
        continue;
      }
      const detalhe = r.confianca === null ? "estimado" : `confiança ${confiancaTexto(r.confianca)}`;
      contribuicoes.push({
        criterio: c,
        intensidade: notaDoNivel(c, r.nivel),
        peso: config.pesos[c],
        motivo: `${INFO_DOS_CRITERIOS[c].rotulo}: ${rotuloDoNivel(c, r.nivel)} (${detalhe})`,
      });
    }

    const pesoTotal = contribuicoes.reduce((t, x) => t + x.peso, 0);
    const soma = contribuicoes.reduce((t, x) => t + x.peso * x.intensidade, 0);
    const score = pesoTotal > 0 ? Math.round((soma / pesoTotal) * 100) : 0;

    const ordenadas = contribuicoes
      .filter((x) => x.peso > 0 && x.intensidade >= 0.25)
      .sort((a, b) => b.peso * b.intensidade - a.peso * a.intensidade);
    const motivos = ordenadas.slice(0, 3).map((x) => x.motivo);

    // ação: a da IA quando ela está confiante; senão a do critério de regra que mais pesou
    const acaoDaIa = resposta?.acao && (resposta.acao.confianca === null || resposta.acao.confianca >= config.confiancaMinima);
    const dominante = ordenadas.find((x) => !ehCriterioDeIa(x.criterio));
    const acao = acaoDaIa
      ? ROTULO_DA_ACAO[resposta.acao!.opcao]
      : dominante
        ? ACAO_DA_REGRA[dominante.criterio as CriterioDeRegra]
        : "Revisar o negócio";

    return {
      id: s.id,
      sinais: s,
      score,
      faixa: faixaDoScore(score),
      motivos: motivos.length > 0 ? motivos : ["Sem sinais fortes entre os critérios escolhidos"],
      acao,
      acaoDaIa: !!acaoDaIa,
      iaIncerta,
      iaSemDados,
      estimado: !!resposta?.estimado,
    };
  });

  return itens.sort((a, b) => b.score - a.score || b.sinais.valor - a.sinais.valor || a.sinais.titulo.localeCompare(b.sinais.titulo, "pt-BR"));
}
