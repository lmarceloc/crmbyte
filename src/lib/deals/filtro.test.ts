import { describe, expect, it } from "vitest";
import type { Deal } from "@/types";
import { filtrarNegocios, normalizar } from "./filtro";

const deal = (id: string, title: string, assigned_to?: string): Deal =>
  ({ id, title, assigned_to, user_id: "u", pipeline_id: "p", stage_id: "s", contact_id: null, value: 0, created_at: "" }) as Deal;

const deals = [
  deal("1", "Site da Padaria São João", "ana"),
  deal("2", "Tráfego pago Clínica", "bruno"),
  deal("3", "Identidade visual"),
];
const ids = (r: Deal[]) => r.map((d) => d.id);

describe("normalizar", () => {
  it("ignora acentos e maiúsculas", () => {
    expect(normalizar("  São JOÃO ")).toBe("sao joao");
  });
});

describe("filtrarNegocios", () => {
  it("sem filtro devolve tudo", () => {
    expect(ids(filtrarNegocios(deals, { busca: "", dono: "todos" }))).toEqual(["1", "2", "3"]);
  });

  it("busca pelo nome do negócio sem acento e sem diferenciar maiúsculas", () => {
    expect(ids(filtrarNegocios(deals, { busca: "sao joao", dono: "todos" }))).toEqual(["1"]);
    expect(ids(filtrarNegocios(deals, { busca: "TRAFEGO", dono: "todos" }))).toEqual(["2"]);
  });

  it("cada palavra da busca conta separada, em qualquer ordem", () => {
    expect(ids(filtrarNegocios(deals, { busca: "joao padaria", dono: "todos" }))).toEqual(["1"]);
    expect(ids(filtrarNegocios(deals, { busca: "padaria clinica", dono: "todos" }))).toEqual([]);
  });

  it("filtra por dono", () => {
    expect(ids(filtrarNegocios(deals, { busca: "", dono: "bruno" }))).toEqual(["2"]);
  });

  it("filtra negócios sem dono", () => {
    expect(ids(filtrarNegocios(deals, { busca: "", dono: "sem_dono" }))).toEqual(["3"]);
  });

  it("combina busca e dono", () => {
    expect(ids(filtrarNegocios(deals, { busca: "site", dono: "bruno" }))).toEqual([]);
    expect(ids(filtrarNegocios(deals, { busca: "site", dono: "ana" }))).toEqual(["1"]);
  });
});
