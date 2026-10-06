// Chamada ao OpenRouter (server-only: a chave nunca sai daqui).
import { IaError } from "./erro";
import type { MensagemDoModelo } from "./prompt";

export const URL_OPENROUTER = "https://openrouter.ai/api/v1/chat/completions";
/** Roteador do OpenRouter que escolhe entre os modelos gratuitos disponíveis. */
export const MODELO_GRATUITO = "openrouter/free";
const TEMPO_MAX_MS = 45_000;

interface Opcoes {
  modelo?: string;
  fetchFn?: typeof fetch;
  tempoMaxMs?: number;
  /** Padrão 0,7 (texto criativo); respostas em JSON pedem valores baixos. */
  temperatura?: number;
  /** Padrão 800. */
  maxTokens?: number;
}

const MSG_LIMITE =
  "Limite do modelo gratuito atingido: o OpenRouter limita os modelos gratuitos por minuto e por dia. Tente de novo mais tarde.";

const resumo = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, 200) : "");

/** Pede uma resposta ao modelo e devolve o texto. Lança `IaError` com mensagem pronta para a tela. */
export async function completar(chave: string, mensagens: MensagemDoModelo[], opcoes: Opcoes = {}): Promise<string> {
  const fetchFn = opcoes.fetchFn ?? fetch;
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  let resposta: Response;
  try {
    resposta = await fetchFn(URL_OPENROUTER, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${chave}`,
        "Content-Type": "application/json",
        ...(site ? { "HTTP-Referer": site } : {}),
        "X-Title": "wacrm",
      },
      body: JSON.stringify({
        model: opcoes.modelo ?? MODELO_GRATUITO,
        messages: mensagens,
        temperature: opcoes.temperatura ?? 0.7,
        max_tokens: opcoes.maxTokens ?? 800,
      }),
      signal: AbortSignal.timeout(opcoes.tempoMaxMs ?? TEMPO_MAX_MS),
    });
  } catch (e) {
    const demorou = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    throw new IaError(
      demorou ? "O modelo demorou demais para responder. Tente de novo." : "Não foi possível falar com o OpenRouter.",
      504,
      "openrouter_unreachable",
    );
  }

  const corpo = (await resposta.json().catch(() => null)) as {
    error?: { code?: unknown; message?: unknown };
    choices?: { message?: { content?: unknown } }[];
  } | null;

  // o OpenRouter também devolve `error` no corpo com status 200
  const status = !resposta.ok ? resposta.status : Number(corpo?.error?.code) || 0;
  if (!resposta.ok || corpo?.error) {
    if (status === 401 || status === 403)
      throw new IaError("Chave do OpenRouter recusada. Confira em Configurações → Chaves de API.", 502, "openrouter_key");
    if (status === 402)
      throw new IaError("O OpenRouter pediu créditos para usar este modelo.", 502, "openrouter_credits");
    if (status === 429) throw new IaError(MSG_LIMITE, 429, "openrouter_rate_limit");
    const detalhe = resumo(corpo?.error?.message);
    throw new IaError(
      `O OpenRouter não respondeu (${status ? `HTTP ${status}` : "erro"}${detalhe ? `: ${detalhe}` : ""}).`,
      502,
      "openrouter_failed",
    );
  }

  const conteudo = corpo?.choices?.[0]?.message?.content;
  const texto = typeof conteudo === "string" ? conteudo.trim() : "";
  if (!texto) throw new IaError("O modelo não devolveu texto. Tente de novo.", 502, "openrouter_empty");
  return texto;
}
