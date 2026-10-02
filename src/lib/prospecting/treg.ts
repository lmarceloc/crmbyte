// Cliente da Treg (gateway de dados de pessoas). Um único mecanismo:
// POST https://treg.to/call/<tool_id>. SEM retry em POST: timeout ambíguo
// não pode repetir chamada paga.
import { MSG_SEM_CONFIRMACAO, ProspectingError } from "./errors";

export interface Lead {
  key: string;
  fullName: string;
  title: string | null;
  companyName: string | null;
  companyDomain: string | null;
  location: string | null;
  linkedin: string | null;
  email: string | null;
  emailVerified: boolean;
}

interface RespostaTreg {
  output?: unknown;
  _treg?: { charged_micro?: number };
}

async function chamar(
  key: string,
  tool: string,
  corpo: unknown,
  timeoutMs: number,
  maxCostUsd?: number,
): Promise<{ output: unknown; custoUsd: number }> {
  const headers: Record<string, string> = {
    "X-Treg-Token": key,
    "Content-Type": "application/json",
  };
  if (maxCostUsd !== undefined) headers["X-Treg-Route-Max-Cost"] = String(maxCostUsd);

  let res: Response;
  try {
    res = await fetch(`https://treg.to/call/${tool}`, {
      method: "POST",
      headers,
      body: JSON.stringify(corpo),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new ProspectingError(MSG_SEM_CONFIRMACAO);
  }

  const dados = (await res.json().catch(() => ({}))) as RespostaTreg & {
    detail?: string;
    error?: string;
    errors?: { details?: string }[];
  };
  if (!res.ok) throw new ProspectingError(mapearErro(res.status, dados));
  return { output: dados.output, custoUsd: (dados._treg?.charged_micro ?? 0) / 1_000_000 };
}

function mapearErro(
  status: number,
  d: { detail?: string; error?: string; errors?: { details?: string }[] },
): string {
  const texto = d.detail ?? d.error ?? d.errors?.[0]?.details;
  if (status === 401) return "Chave da Treg inválida ou expirada.";
  if (status === 402 && d.error === "route_max_cost")
    return "O resultado custaria mais que o teto de busca definido. Aumente o orçamento ou reduza a quantidade.";
  if (status === 402) return "Saldo insuficiente na conta da Treg da instalação. Avise quem administra a instalação.";
  if (status === 429) return "Limite de chamadas da Treg atingido. Tente novamente em instantes.";
  if (status === 503 && /provider_capacity_unavailable/.test(`${d.error ?? ""}${d.detail ?? ""}`))
    return "Provedor de busca sem capacidade no momento. Tente novamente em alguns minutos.";
  if (status === 503) return "Busca sobrecarregada no momento. Tente novamente em instantes.";
  return `Busca indisponível: ${texto ?? `(HTTP ${status})`}`;
}

// ---------- normalização (cada provedor por trás da Treg usa campos próprios)

type Bruto = Record<string, unknown>;
const obj = (v: unknown): Bruto | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Bruto) : null);
const str = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
};
const primeiroStr = (max: number, ...vs: unknown[]): string | null => {
  for (const v of vs) {
    const s = str(v, max);
    if (s) return s;
  }
  return null;
};

function dominio(v: unknown): string | null {
  const s = str(v, 300);
  if (!s) return null;
  const d = s.replace(/^https?:\/\//i, "").split(/[/?#]/)[0].toLowerCase();
  return d ? d.slice(0, 255) : null;
}

function linkedin(v: unknown): string | null {
  const s = str(v, 500);
  if (!s) return null;
  const url = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? url.slice(0, 500) : null;
  } catch {
    return null;
  }
}

export function normalizeLead(raw: unknown): Lead | null {
  const p = obj(raw);
  if (!p) return null;
  const company = obj(p.company);
  const jobTitle = obj(p.jobTitle);
  const social = obj(p.socialLinks);
  const urls = obj(p.URLs);
  const loc = obj(p.location);

  const fullName =
    str(p.fullName, 200) ??
    str(p.full_name, 200) ??
    str([str(p.firstName, 100), str(p.lastName, 100)].filter(Boolean).join(" "), 200) ??
    str([str(p.first_name, 100), str(p.last_name, 100)].filter(Boolean).join(" "), 200);
  if (!fullName) return null;

  const companyDomain = dominio(
    company?.domain ?? p.company_domain ?? p.companyDomain ?? p.email_domain ?? p.company_url,
  );
  const location =
    str(p.location, 300) ??
    (loc ? str([loc.city, loc.state, loc.country].filter((x) => typeof x === "string" && x).join(", "), 300) : null) ??
    str(p.locality, 300) ??
    str([p.city, p.region_code, p.country_code].filter((x) => typeof x === "string" && x).join(", "), 300);

  const id = p.id ?? p.emp_id;
  const key = (typeof id === "string" || typeof id === "number" ? String(id) : `${fullName}:${companyDomain ?? ""}`).slice(0, 200);

  return {
    key,
    fullName,
    title: primeiroStr(300, jobTitle?.title, p.title, p.job_title),
    companyName: primeiroStr(300, company?.name, p.company_name, p.companyName),
    companyDomain,
    location,
    linkedin: linkedin(social?.linkedin ?? urls?.linkedin ?? p.employee_linkedin ?? p.linkedin),
    email: null,
    emailVerified: false,
  };
}

// ---------- operações

export async function buscarPessoas(
  key: string,
  p: { limit: number; title?: string; company_domain?: string },
  maxCostUsd: number,
): Promise<{ leads: Lead[]; custoUsd: number }> {
  const corpo: Record<string, unknown> = { limit: p.limit };
  if (p.title) corpo.title = p.title;
  if (p.company_domain) corpo.company_domain = p.company_domain;
  const { output, custoUsd } = await chamar(key, "treg.people.search", corpo, 60_000, maxCostUsd);
  const pessoas = obj(output)?.people;
  const leads = Array.isArray(pessoas) ? pessoas.map(normalizeLead).filter((l): l is Lead => !!l) : [];
  return { leads, custoUsd };
}

export async function acharEmail(
  key: string,
  fullName: string,
  domain: string,
): Promise<{ email: string | null; custoUsd: number }> {
  const { output, custoUsd } = await chamar(key, "treg.people.email.find", { full_name: fullName, domain }, 90_000);
  const email = obj(output)?.email;
  return { email: typeof email === "string" && email.includes("@") ? email.trim().toLowerCase() : null, custoUsd };
}

export async function verificarEmail(key: string, email: string): Promise<{ valido: boolean; custoUsd: number }> {
  const { output, custoUsd } = await chamar(key, "treg.people.email.verify", { email }, 30_000);
  return { valido: obj(output)?.valid === true, custoUsd };
}
