// Leitura do site da empresa pelo Firecrawl (server-only: a chave nunca sai daqui).
import { IaError } from "./erro";

export const URL_FIRECRAWL = "https://api.firecrawl.dev/v2/scrape";
const TEMPO_MAX_MS = 25_000;

export interface SiteLido {
  markdown: string;
  titulo: string | null;
}

interface Opcoes {
  fetchFn?: typeof fetch;
  tempoMaxMs?: number;
}

const resumo = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, 200) : "");

/** Lê a página como Markdown. Lança `IaError` com mensagem pronta para a tela. */
export async function lerSite(chave: string, url: string, opcoes: Opcoes = {}): Promise<SiteLido> {
  const fetchFn = opcoes.fetchFn ?? fetch;
  let resposta: Response;
  try {
    resposta = await fetchFn(URL_FIRECRAWL, {
      method: "POST",
      headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
      signal: AbortSignal.timeout(opcoes.tempoMaxMs ?? TEMPO_MAX_MS),
    });
  } catch (e) {
    const demorou = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    throw new IaError(
      demorou ? "O Firecrawl demorou demais para ler o site." : "Não foi possível falar com o Firecrawl.",
      504,
      "firecrawl_unreachable",
    );
  }

  const corpo = (await resposta.json().catch(() => null)) as {
    success?: boolean;
    error?: unknown;
    data?: { markdown?: unknown; metadata?: { title?: unknown } };
  } | null;

  if (!resposta.ok || corpo?.success === false) {
    if (resposta.status === 401 || resposta.status === 403)
      throw new IaError("Chave do Firecrawl recusada. Confira em Configurações → Chaves de API.", 502, "firecrawl_key");
    if (resposta.status === 402)
      throw new IaError("A conta do Firecrawl está sem créditos.", 502, "firecrawl_credits");
    if (resposta.status === 429)
      throw new IaError("Limite de uso do Firecrawl atingido. Tente de novo em instantes.", 429, "firecrawl_rate_limit");
    const detalhe = resumo(corpo?.error);
    throw new IaError(
      `O Firecrawl não conseguiu ler o site (HTTP ${resposta.status}${detalhe ? `: ${detalhe}` : ""}).`,
      502,
      "firecrawl_failed",
    );
  }

  const markdown = typeof corpo?.data?.markdown === "string" ? corpo.data.markdown.trim() : "";
  if (!markdown) throw new IaError("O site não retornou conteúdo legível.", 502, "firecrawl_empty");
  const titulo = resumo(corpo?.data?.metadata?.title) || null;
  return { markdown, titulo };
}
