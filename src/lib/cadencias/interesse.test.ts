import { describe, expect, it } from "vitest";
import { montarGrafo, ID_GATILHO_INTERESSE } from "./grafo";
import { desligar, estaNoInteresse, inserirNaFloresta, ligar, podeLigar, removerNaFloresta, validarFloresta, type Floresta } from "./montagem";
import { renderizar } from "./renderizar";
import { configuracaoSchema } from "./schemas";
import { configuracaoPadrao, interessePadrao, type Passo } from "./tipos";
import { deveIrParaInteresse, maiorAberturasNoMesmoEmail } from "./worker";

const email = (id: string): Passo => ({ id, tipo: "email", assunto: "a", corpo: "b", mesmaConversa: false });
const espera = (id: string): Passo => ({ id, tipo: "espera", diasUteis: 1 });
const fim = (id: string): Passo => ({ id, tipo: "fim" });

const floresta = (interesse: Passo[] = []): Floresta => ({
  passos: [email("e1"), espera("w1"), email("e2"), fim("f1")],
  soltos: [{ id: "b", x: 0, y: 500, passos: [espera("iw"), email("ie"), fim("if")] }],
  interesse,
});

describe("caminho de interesse no canvas", () => {
  it("o gatilho Interesse liga num bloco solto, e o bloco vira o caminho", () => {
    const f = floresta();
    expect(podeLigar(f, ID_GATILHO_INTERESSE, "out", "iw").ok).toBe(true);
    const ligada = ligar(f, ID_GATILHO_INTERESSE, "out", "iw");
    expect(ligada.interesse!.map((p) => p.id)).toEqual(["iw", "ie", "if"]);
    expect(ligada.soltos).toHaveLength(0);
    expect(ligada.passos).toBe(f.passos);
    expect(estaNoInteresse(ligada, "ie")).toBe(true);
    expect(estaNoInteresse(ligada, "e1")).toBe(false);
    // saída do gatilho já ocupada
    expect(podeLigar({ ...ligada, soltos: [{ id: "c", x: 0, y: 0, passos: [email("x")] }] }, ID_GATILHO_INTERESSE, "out", "x").ok).toBe(false);
  });

  it("inserir, desligar e excluir mexem só no caminho de interesse", () => {
    const f = floresta([espera("iw"), email("ie"), fim("if")]);
    const inserida = inserirNaFloresta(f, { lista: "interesse", indice: 1 }, email("novo"));
    expect(inserida.interesse!.map((p) => p.id)).toEqual(["iw", "novo", "ie", "if"]);
    expect(inserida.passos).toBe(f.passos);
    const solta = desligar(f, "ie", 10, 10);
    expect(solta.interesse!.map((p) => p.id)).toEqual(["iw"]);
    expect(solta.soltos.at(-1)!.passos.map((p) => p.id)).toEqual(["ie", "if"]);
    expect(removerNaFloresta(f, "iw").interesse!.map((p) => p.id)).toEqual(["ie", "if"]);
  });

  it("valida o caminho de interesse (precisa terminar em Fim)", () => {
    expect(validarFloresta(floresta([email("ie")])).has("ie")).toBe(true);
    expect(validarFloresta(floresta([email("ie"), fim("if")])).has("ie")).toBe(false);
  });

  it("o grafo desenha o segundo gatilho abaixo do fluxo principal", () => {
    const { nos, ligacoes } = montarGrafo(floresta().passos, [], [email("ie"), fim("if")]);
    const g = nos.find((n) => n.id === ID_GATILHO_INTERESSE)!;
    expect(g.tipo).toBe("gatilho_interesse");
    expect(g.y).toBeGreaterThan(0);
    expect(ligacoes.find((l) => l.origem === ID_GATILHO_INTERESSE)?.ponto).toEqual({ lista: "interesse", indice: 0 });
    // sem caminho de interesse (undefined), nada muda no desenho antigo
    expect(montarGrafo(floresta().passos).nos.some((n) => n.id === ID_GATILHO_INTERESSE)).toBe(false);
  });
});

describe("decisão do worker", () => {
  it("conta aberturas por e-mail, não a soma", () => {
    expect(maiorAberturasNoMesmoEmail([{ passo_id: "e1" }, { passo_id: "e2" }, { passo_id: "e1" }, { passo_id: null }])).toBe(2);
    expect(maiorAberturasNoMesmoEmail([])).toBe(0);
  });

  it("desvia só se ligado, com passos, ainda no fluxo principal e com aberturas suficientes", () => {
    const ligado = { ...interessePadrao(), ativo: true, aberturas: 3, passos: [email("ie"), fim("if")] };
    expect(deveIrParaInteresse(ligado, false, 3)).toBe(true);
    expect(deveIrParaInteresse(ligado, false, 2)).toBe(false);
    expect(deveIrParaInteresse(ligado, true, 9)).toBe(false);
    expect(deveIrParaInteresse({ ...ligado, ativo: false }, false, 9)).toBe(false);
    expect(deveIrParaInteresse({ ...ligado, passos: [fim("if")] }, false, 9)).toBe(false);
  });
});

describe("configuração", () => {
  it("cadências antigas ganham o padrão; link da agenda precisa ser http(s)", () => {
    const { linkAgenda, interesse, ...antiga } = configuracaoPadrao();
    void linkAgenda;
    void interesse;
    const lida = configuracaoSchema.parse(antiga);
    expect(lida.interesse).toEqual(interessePadrao());
    expect(lida.linkAgenda).toBe("");
    expect(configuracaoSchema.safeParse({ ...configuracaoPadrao(), linkAgenda: "cal.com/x" }).success).toBe(false);
    expect(configuracaoSchema.safeParse({ ...configuracaoPadrao(), linkAgenda: "https://cal.com/luiz" }).success).toBe(true);
  });

  it("{{link_agenda}} entra no texto", () => {
    expect(renderizar("Agende: {{link_agenda}}", { link_agenda: "https://cal.com/luiz" })).toBe("Agende: https://cal.com/luiz");
  });
});
