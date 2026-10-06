// Posições do fluxo da cadência no canvas (da esquerda para a direita).
// A árvore de passos continua sendo a fonte da verdade: aqui só se calcula
// onde cada cartão fica e quais ligações desenhar. Cada ligação carrega o
// ponto de inserção que o "+" dela usa. Blocos soltos ficam onde foram
// deixados. Função pura (testável).
import type { PontoDeInsercao } from "./arvore";
import type { BlocoSolto, Passo } from "./tipos";

export const LARGURA_DO_NO = 240;
/** Espaço entre colunas: o "+" de cada ligação fica no meio dele. */
export const ESPACO_X = 90;
/** Espaço vertical entre os caminhos "Sim" e "Não" de um ramo. */
export const ESPACO_Y = 40;

/** Alturas fixas dos cartões (o CSS do canvas usa as mesmas). */
/** Alturas fixas dos cartões (o CSS do canvas usa as mesmas). */
export const ALTURA = {
  gatilho: 138,
  passo: 164,
  ramo: 190,
  fim: 56,
} as const;

export type TipoDeNoDoGrafo = "gatilho" | "passo" | "fim";
/** Saída do nó de onde a ligação parte. */
export type SaidaDoNo = "out" | "sim" | "nao";

export interface NoDoGrafo {
  id: string;
  tipo: TipoDeNoDoGrafo;
  x: number;
  y: number;
  altura: number;
  passo?: Passo;
  /** Id do bloco solto (fora do fluxo); ausente = ligado ao gatilho. */
  solto?: string;
}

export interface LigacaoDoGrafo {
  id: string;
  origem: string;
  saida: SaidaDoNo;
  destino: string;
  /** Onde um passo novo entra ao usar o "+" desta ligação. */
  ponto: PontoDeInsercao;
}

export const ID_GATILHO = "__gatilho";

function alturaDoPasso(p: Passo) {
  return p.tipo === "ramo" ? ALTURA.ramo : p.tipo === "fim" ? ALTURA.fim : ALTURA.passo;
}

/** Espaço mínimo de um lado vazio do ramo (as portas Sim/Não não encostam). */
const ALTURA_MINIMA = 56;

/** Altura que uma lista ocupa: os passos ficam lado a lado; só um ramo abre dois caminhos. */
export function alturaDaLista(passos: Passo[]): number {
  let h = ALTURA_MINIMA;
  for (const p of passos) {
    h = Math.max(h, alturaDoPasso(p));
    if (p.tipo === "ramo") h = Math.max(h, alturaDaLista(p.sim) + ESPACO_Y + alturaDaLista(p.nao));
  }
  return h;
}

/**
 * Nós e ligações do fluxo (a partir do gatilho, da esquerda para a direita) e
 * dos blocos soltos (cada um a partir da posição onde foi deixado). O fim de
 * cada caminho é a caixa Fim colocada à mão; caminho sem ela termina numa
 * saída livre, pronta para ligar.
 */
export function montarGrafo(passos: Passo[], soltos: BlocoSolto[] = []): { nos: NoDoGrafo[]; ligacoes: LigacaoDoGrafo[] } {
  const nos: NoDoGrafo[] = [];
  const ligacoes: LigacaoDoGrafo[] = [];

  const ligar = (origem: string, saida: SaidaDoNo, destino: string, ponto: PontoDeInsercao) =>
    ligacoes.push({ id: `${origem}:${saida}->${destino}`, origem, saida, destino, ponto });

  const colocar = (
    lista: Passo[],
    listaId: string,
    x: number,
    centroY: number,
    de: { id: string; saida: SaidaDoNo } | null,
    solto: string | undefined,
  ) => {
    let anterior = de;
    for (let i = 0; i < lista.length; i++) {
      const p = lista[i];
      const altura = alturaDoPasso(p);
      nos.push({ id: p.id, tipo: p.tipo === "fim" ? "fim" : "passo", x, y: centroY - altura / 2, altura, passo: p, solto });
      if (anterior) ligar(anterior.id, anterior.saida, p.id, { lista: listaId, indice: i });
      anterior = { id: p.id, saida: "out" };
      x += LARGURA_DO_NO + ESPACO_X;

      if (p.tipo === "ramo") {
        // um ramo termina a sequência: o que vem depois vive nos lados dele
        const hSim = alturaDaLista(p.sim);
        const hNao = alturaDaLista(p.nao);
        const topo = centroY - (hSim + ESPACO_Y + hNao) / 2;
        colocar(p.sim, `${p.id}:sim`, x, topo + hSim / 2, { id: p.id, saida: "sim" }, solto);
        colocar(p.nao, `${p.id}:nao`, x, topo + hSim + ESPACO_Y + hNao / 2, { id: p.id, saida: "nao" }, solto);
        return;
      }
    }
  };

  nos.push({ id: ID_GATILHO, tipo: "gatilho", x: 0, y: -ALTURA.gatilho / 2, altura: ALTURA.gatilho });
  colocar(passos, "raiz", LARGURA_DO_NO + ESPACO_X, 0, { id: ID_GATILHO, saida: "out" }, undefined);
  for (const b of soltos) {
    if (b.passos.length === 0) continue;
    // (x, y) do bloco = canto superior esquerdo da primeira caixa
    colocar(b.passos, `solto:${b.id}`, b.x, b.y + alturaDoPasso(b.passos[0]) / 2, null, b.id);
  }
  return { nos, ligacoes };
}

export interface Retangulo {
  x: number;
  y: number;
  largura: number;
  altura: number;
}

/**
 * Posição livre (canto superior esquerdo) mais perto de `alvo` para uma caixa
 * nova, sem encostar em nenhum cartão (`margem` de folga): a caixa solta não
 * nasce em cima de outra, escondendo as portas dela.
 */
export function pontoLivre(
  ocupados: Retangulo[],
  alvo: { x: number; y: number },
  tamanho: { largura: number; altura: number },
  margem = 24,
): { x: number; y: number } {
  const colide = (x: number, y: number) =>
    ocupados.some(
      (r) =>
        x < r.x + r.largura + margem &&
        x + tamanho.largura + margem > r.x &&
        y < r.y + r.altura + margem &&
        y + tamanho.altura + margem > r.y,
    );
  if (!colide(alvo.x, alvo.y)) return alvo;
  const PASSO = 40;
  const candidatos: { x: number; y: number; d: number }[] = [];
  for (let i = -20; i <= 20; i++) {
    for (let j = -20; j <= 20; j++) {
      if (i === 0 && j === 0) continue;
      candidatos.push({ x: alvo.x + i * PASSO, y: alvo.y + j * PASSO, d: Math.hypot(i, j * 1.15) });
    }
  }
  candidatos.sort((a, b) => a.d - b.d);
  const livre = candidatos.find((c) => !colide(c.x, c.y));
  return livre ? { x: livre.x, y: livre.y } : alvo;
}

/** Altura do cartão de um tipo de passo (para achar espaço livre antes de criar). */
export function alturaDoTipo(tipo: Passo["tipo"]): number {
  return tipo === "ramo" ? ALTURA.ramo : tipo === "fim" ? ALTURA.fim : ALTURA.passo;
}

/** Curva da ligação: mesma fórmula do canvas de referência (alças horizontais). */
export function caminhoDaLigacao(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const dx = Math.max(50, Math.abs(b.x - a.x) * 0.48);
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
}

/** Mini-raio em zigue-zague entre dois pontos (a amplitude encolhe em distâncias curtas). */
export function caminhoDoRaio(a: { x: number; y: number }, b: { x: number; y: number }, segmentos = 5): string {
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const amplitude = Math.min(7, dist / 6);
  const nx = -(b.y - a.y) / (dist || 1);
  const ny = (b.x - a.x) / (dist || 1);
  let d = `M ${a.x} ${a.y}`;
  for (let i = 1; i < segmentos; i++) {
    const t = i / segmentos;
    const lado = i % 2 === 0 ? 1 : -1;
    d += ` L ${a.x + (b.x - a.x) * t + nx * amplitude * lado} ${a.y + (b.y - a.y) * t + ny * amplitude * lado}`;
  }
  return `${d} L ${b.x} ${b.y}`;
}
