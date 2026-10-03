import { describe, expect, it } from "vitest";
import { criarTarefaSchema, editarTarefaSchema, situacaoDoPrazo } from "./tipos";

describe("situacaoDoPrazo", () => {
  const agora = new Date(2026, 9, 2, 10, 0, 0); // 02/10/2026 10:00 local

  it("classifica o prazo em relação a agora", () => {
    expect(situacaoDoPrazo(null, agora)).toBe("sem_prazo");
    expect(situacaoDoPrazo(new Date(2026, 9, 2, 9, 0).toISOString(), agora)).toBe("atrasada");
    expect(situacaoDoPrazo(new Date(2026, 9, 2, 18, 0).toISOString(), agora)).toBe("hoje");
    expect(situacaoDoPrazo(new Date(2026, 9, 3, 9, 0).toISOString(), agora)).toBe("futura");
  });
});

describe("schemas de tarefa", () => {
  it("exige título e usa 'outra' como tipo padrão", () => {
    expect(criarTarefaSchema.safeParse({ titulo: "  " }).success).toBe(false);
    const r = criarTarefaSchema.parse({ titulo: "Ligar" });
    expect(r.tipo).toBe("outra");
  });

  it("rejeita campos desconhecidos e edição vazia", () => {
    expect(criarTarefaSchema.safeParse({ titulo: "x", account_id: "y" }).success).toBe(false);
    expect(editarTarefaSchema.safeParse({}).success).toBe(false);
    expect(editarTarefaSchema.safeParse({ status: "concluida" }).success).toBe(true);
  });
});
