// Cliente Apify (Google Maps). Run assíncrono: dispara, o worker acompanha.
import { MSG_SEM_CONFIRMACAO, ProspectingError } from "./errors";

const BASE = "https://api.apify.com/v2";
const ACTOR = "compass~crawler-google-places";

export interface Prospect {
  key: string;
  name: string;
  phone: string | null;
  website: string | null;
  category: string | null;
  address: string | null;
  maps_url: string | null;
  rating: number | null;
  reviews: number | null;
  emails: string[];
  socials: { instagrams: string[]; facebooks: string[]; linkedins: string[] };
}

async function req<T>(key: string, path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${key}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });
  } catch {
    throw new ProspectingError(MSG_SEM_CONFIRMACAO);
  }
  if (res.status === 401) throw new ProspectingError("Chave de busca inválida.");
  if (res.status === 402) throw new ProspectingError("Saldo ou limite de uso insuficiente no provedor de busca.");
  if (!res.ok) throw new ProspectingError(`Busca indisponível (HTTP ${res.status}).`);
  return (await res.json()) as T;
}

export async function validarChave(key: string): Promise<void> {
  await req(key, "users/me");
}

export interface RunInfo {
  id: string;
  status: string;
  defaultDatasetId: string;
  usageTotalUsd?: number;
}

export async function iniciarBusca(
  key: string,
  s: { niche: string; location: string; limit: number; budget_usd: number; enrich: boolean },
): Promise<RunInfo> {
  const r = await req<{ data: RunInfo }>(
    key,
    `acts/${ACTOR}/runs?maxItems=${s.limit}&maxTotalChargeUsd=${s.budget_usd}&timeout=300`,
    {
      method: "POST",
      body: JSON.stringify({
        searchStringsArray: [s.niche],
        locationQuery: s.location,
        maxCrawledPlacesPerSearch: s.limit,
        language: "pt-BR",
        countryCode: "br",
        skipClosedPlaces: true,
        scrapeContacts: s.enrich,
        maxReviews: 0,
        maxImages: 0,
        maximumLeadsEnrichmentRecords: 0,
      }),
    },
  );
  return r.data;
}

export async function lerRun(key: string, runId: string): Promise<RunInfo> {
  return (await req<{ data: RunInfo }>(key, `actor-runs/${encodeURIComponent(runId)}`)).data;
}

export async function lerDataset(key: string, datasetId: string, limit: number): Promise<unknown[]> {
  const itens = await req<unknown[]>(
    key,
    `datasets/${encodeURIComponent(datasetId)}/items?clean=true&limit=${Math.min(100, limit)}`,
  );
  return Array.isArray(itens) ? itens : [];
}

// ---------- normalização

type Bruto = Record<string, unknown>;
const s = (v: unknown, max = 500): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
const lista = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()).slice(0, 5) : [];

/** Só celular/fixo BR: nunca adivinha país estrangeiro. */
export function normalizarTelefoneBr(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let d = raw.replace(/\D/g, "");
  if (!d) return null;
  if (!raw.trim().startsWith("+") && (d.length === 10 || d.length === 11)) d = `55${d}`;
  return /^55\d{10,11}$/.test(d) ? `+${d}` : null;
}

export function normalizeProspect(raw: unknown): Prospect | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Bruto;
  const name = s(p.title, 200);
  const key = s(p.placeId, 300);
  if (!name || !key) return null;
  if (p.permanentlyClosed === true || p.temporarilyClosed === true) return null;
  return {
    key,
    name,
    phone: normalizarTelefoneBr(p.phoneUnformatted ?? p.phone),
    website: s(p.website),
    category: s(p.categoryName),
    address: s(p.address),
    maps_url: s(p.url),
    rating: typeof p.totalScore === "number" ? p.totalScore : null,
    reviews: typeof p.reviewsCount === "number" ? p.reviewsCount : null,
    emails: lista(p.emails),
    socials: { instagrams: lista(p.instagrams), facebooks: lista(p.facebooks), linkedins: lista(p.linkedIns) },
  };
}
