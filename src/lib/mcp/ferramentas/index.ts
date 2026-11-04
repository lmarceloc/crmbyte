import type { FerramentaMcp } from "../tipos";
import { adicionarNota, criarTarefa, inscreverEmCadenciaFerramenta, listarCadencias } from "./atividades";
import { buscarContatos, criarContato } from "./contatos";
import { criarNegocio, listarPipelines, moverNegocio } from "./funil";

export const FERRAMENTAS: readonly FerramentaMcp[] = [
  buscarContatos,
  listarPipelines,
  listarCadencias,
  criarContato,
  criarNegocio,
  moverNegocio,
  criarTarefa,
  adicionarNota,
  inscreverEmCadenciaFerramenta,
];
