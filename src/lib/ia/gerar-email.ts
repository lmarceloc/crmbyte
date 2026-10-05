// Fluxo da página IA: lê o site (Firecrawl) → monta o pedido → pede o e-mail ao modelo (OpenRouter).
// É um fluxo fixo, não um agente com ferramentas: com modelo gratuito é muito mais confiável.
import { IaError } from "./erro";
import {
  interpretarEmail,
  montarMensagens,
  type DadosDoLead,
  type MensagemDoModelo,
  type SkillDaIa,
  type SobreNos,
} from "./prompt";
import type { SiteLido } from "./firecrawl";

export interface EntradaDoEmail {
  sobreNos: SobreNos;
  lead: DadosDoLead;
  skills: SkillDaIa[];
}

export interface DependenciasDoEmail {
  lerSite: (url: string) => Promise<SiteLido>;
  completar: (mensagens: MensagemDoModelo[]) => Promise<string>;
}

export interface ResultadoDoEmail {
  assunto: string;
  corpo: string;
  /** false = o e-mail foi escrito só com os dados digitados. */
  siteLido: boolean;
  /** Por que o site não foi lido, quando for o caso. */
  aviso: string | null;
}

export async function gerarEmail(entrada: EntradaDoEmail, deps: DependenciasDoEmail): Promise<ResultadoDoEmail> {
  // Falha ao ler o site não impede o e-mail: segue com os dados digitados e avisa.
  let conteudoDoSite: string | null = null;
  let aviso: string | null = null;
  try {
    conteudoDoSite = (await deps.lerSite(entrada.lead.site)).markdown;
  } catch (e) {
    aviso = `Não consegui ler o site: ${e instanceof IaError ? e.message : "erro inesperado."} O e-mail foi escrito só com os dados informados.`;
  }

  const texto = await deps.completar(montarMensagens({ sobreNos: entrada.sobreNos, lead: entrada.lead, conteudoDoSite, skills: entrada.skills }));
  const { assunto, corpo } = interpretarEmail(texto);
  if (!corpo) throw new IaError("O modelo devolveu um e-mail vazio. Tente de novo.", 502, "ia_empty");
  return { assunto, corpo, siteLido: conteudoDoSite !== null, aviso };
}
