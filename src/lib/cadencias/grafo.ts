// Posições do fluxo da cadência no canvas (da esquerda para a direita).
// A árvore de passos continua sendo a fonte da verdade: aqui só se calcula
// onde cada cartão fica e quais ligações desenhar. Cada ligação carrega o
// ponto de inserção que o "+" dela usa. Função pura (testável).
import type { PontoDeInsercao } from "./arvore";
import type { Passo } from "./tipos";

export const LARGURA_DO_NO = 240;
/** Espaço entre colunas: o "+" de cada ligação fica no meio dele. */
export const ESPACO_X = 90;
/** Espaço vertical entre os caminhos "Sim" e "Não" de um ramo. */
export const ESPACO_Y = 40;

/** Alturas fixas dos cartões (o CSS do canvas usa as mesmas). */
export const ALTURA = {
  gatilho: 138,
  passo: 164,
  ramo: 190,
  fim: 138,
  fimDoCaminho: 56,
} as const;

export type TipoDeNoDoGrafo = "gatilho" | "passo" | "fim" | "fimDoCaminho";
/** Saída do nó de onde a ligação parte. */
export type SaidaDoNo = "out" | "sim" | "nao";

export interface NoDoGrafo {
  id: string;
  tipo: TipoDeNoDoGrafo;
  x: number;
  y: number;
  altura: number;
  passo?: Passo;
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
export const ID_FIM = "__fim";

function alturaDoPasso(p: Passo) {
  return p.tipo === "ramo" ? ALTURA.ramo : ALTURA.passo;
}

/** Altura que uma lista ocupa: os passos ficam lado a lado; só um ramo abre dois caminhos. */
export function alturaDaLista(passos: Passo[]): number {
  let h: number = ALTURA.fimDoCaminho;
  for (const p of passos) {
    h = Math.max(h, alturaDoPasso(p));
    if (p.tipo === "ramo") h = Math.max(h, alturaDaLista(p.sim) + ESPACO_Y + alturaDaLista(p.nao));
  }
  return h;
}

export function montarGrafo(passos: Passo[]): { nos: NoDoGrafo[]; ligacoes: LigacaoDoGrafo[] } {
  const nos: NoDoGrafo[] = [];
  const ligacoes: LigacaoDoGrafo[] = [];

  const ligar = (origem: string, saida: SaidaDoNo, destino: string, ponto: PontoDeInsercao) =>
    ligacoes.push({ id: `${origem}:${saida}->${destino}`, origem, saida, destino, ponto });

  const colocar = (lista: Passo[], listaId: string, x: number, centroY: number, de: { id: string; saida: SaidaDoNo }) => {
    let anterior = de;
    for (let i = 0; i < lista.length; i++) {
      const p = lista[i];
      const altura = alturaDoPasso(p);
      nos.push({ id: p.id, tipo: "passo", x, y: centroY - altura / 2, altura, passo: p });
      ligar(anterior.id, anterior.saida, p.id, { lista: listaId, indice: i });
      anterior = { id: p.id, saida: "out" };
      x += LARGURA_DO_NO + ESPACO_X;

      if (p.tipo === "ramo") {
        // um ramo termina o caminho: os passos seguintes vivem nos lados dele
        const hSim = alturaDaLista(p.sim);
        const hNao = alturaDaLista(p.nao);
        const topo = centroY - (hSim + ESPACO_Y + hNao) / 2;
        colocar(p.sim, `${p.id}:sim`, x, topo + hSim / 2, { id: p.id, saida: "sim" });
        colocar(p.nao, `${p.id}:nao`, x, topo + hSim + ESPACO_Y + hNao / 2, { id: p.id, saida: "nao" });
        return;
      }
    }
    const raiz = listaId === "raiz";
    const id = raiz ? ID_FIM : `__fim:${listaId}`;
    const altura = raiz ? ALTURA.fim : ALTURA.fimDoCaminho;
    nos.push({ id, tipo: raiz ? "fim" : "fimDoCaminho", x, y: centroY - altura / 2, altura });
    ligar(anterior.id, anterior.saida, id, { lista: listaId, indice: lista.length });
  };

  nos.push({ id: ID_GATILHO, tipo: "gatilho", x: 0, y: -ALTURA.gatilho / 2, altura: ALTURA.gatilho });
  colocar(passos, "raiz", LARGURA_DO_NO + ESPACO_X, 0, { id: ID_GATILHO, saida: "out" });
  return { nos, ligacoes };
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
