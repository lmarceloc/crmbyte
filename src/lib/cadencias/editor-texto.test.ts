import { describe, expect, it } from "vitest";
import { alternarLista, alternarNegrito, continuarLista, inserirLink, mudarNivelDaLista, urlValida } from "./editor-texto";

describe("alternarNegrito", () => {
  it("envolve a seleção e desfaz", () => {
    const a = alternarNegrito("oi Ana", 3, 6);
    expect(a).toEqual({ valor: "oi **Ana**", ini: 5, fim: 8 });
    expect(alternarNegrito(a.valor, a.ini, a.fim)).toEqual({ valor: "oi Ana", ini: 3, fim: 6 });
  });
  it("sem seleção deixa o cursor entre os asteriscos", () => {
    expect(alternarNegrito("oi ", 3, 3)).toEqual({ valor: "oi ****", ini: 5, fim: 5 });
  });
});

describe("inserirLink", () => {
  it("troca a seleção por [texto](url)", () => {
    const r = inserirLink("veja agenda aqui", 5, 11, "agenda", "https://cal.com/x");
    expect(r.valor).toBe("veja [agenda](https://cal.com/x) aqui");
  });
  it("valida a URL", () => {
    expect(urlValida("https://a.com/x")).toBe(true);
    expect(urlValida("mailto:a@b.com")).toBe(true);
    expect(urlValida("javascript:alert(1)")).toBe(false);
    expect(urlValida("a.com")).toBe(false);
  });
});

describe("alternarLista", () => {
  it("transforma as linhas em itens e desfaz", () => {
    const a = alternarLista("um\ndois", 0, 7);
    expect(a.valor).toBe("- um\n- dois");
    expect(alternarLista(a.valor, a.ini, a.fim).valor).toBe("um\ndois");
  });
  it("linha vazia com cursor vira um item novo", () => {
    expect(alternarLista("", 0, 0)).toEqual({ valor: "- ", ini: 2, fim: 2 });
  });
});

describe("mudarNivelDaLista (Tab)", () => {
  it("aninha e sobe um item", () => {
    const a = mudarNivelDaLista("- um\n- dois", 8, 8, 1)!;
    expect(a.valor).toBe("- um\n  - dois");
    expect(a.ini).toBe(10);
    expect(mudarNivelDaLista(a.valor, a.ini, a.fim, -1)!.valor).toBe("- um\n- dois");
  });
  it("não passa do limite nem sobe além do nível 0", () => {
    expect(mudarNivelDaLista("- um", 4, 4, -1)).toBeNull();
    const fundo = `${" ".repeat(10)}- x`;
    expect(mudarNivelDaLista(fundo, fundo.length, fundo.length, 1)).toBeNull();
  });
  it("fora de lista não faz nada (Tab normal do navegador)", () => {
    expect(mudarNivelDaLista("texto", 5, 5, 1)).toBeNull();
  });
  it("'*' sozinho + Tab vira item, aninhado sob o anterior", () => {
    expect(mudarNivelDaLista("- um\n*", 6, 6, 1)!.valor).toBe("- um\n  - ");
    expect(mudarNivelDaLista("*", 1, 1, 1)!.valor).toBe("- ");
  });
});

describe("continuarLista (Enter)", () => {
  it("cria o próximo item no mesmo nível, mantendo o marcador", () => {
    expect(continuarLista("* um", 4)).toEqual({ valor: "* um\n* ", ini: 7, fim: 7 });
    expect(continuarLista("- a\n  - b", 9)!.valor).toBe("- a\n  - b\n  - ");
  });
  it("Enter no meio do item leva o resto para o novo", () => {
    expect(continuarLista("- abcd", 4)!.valor).toBe("- ab\n- cd");
  });
  it("item vazio sai da lista", () => {
    expect(continuarLista("- um\n- ", 7)).toEqual({ valor: "- um\n", ini: 5, fim: 5 });
  });
  it("fora de lista devolve null", () => {
    expect(continuarLista("texto", 5)).toBeNull();
  });
});
