import { z } from "zod";

const DOMINIO = /^(?=.{3,255}$)([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i;

export const b2bSearchSchema = z
  .object({
    action: z.literal("search"),
    request_id: z.string().uuid(),
    search: z
      .object({
        name: z.string().trim().min(2).max(120),
        title: z.string().trim().min(2).max(120).optional(),
        company_domain: z
          .string()
          .trim()
          .toLowerCase()
          .regex(DOMINIO, "Informe só o domínio, ex.: empresa.com.br (sem https:// nem caminho).")
          .optional(),
        limit: z.number().int().min(1).max(100).default(20),
        budget_usd: z.number().min(0.5).max(10).default(1),
        legal_basis_ref: z.string().trim().min(3).max(500),
      })
      .strict()
      .refine((s) => s.title || s.company_domain, {
        message: "Informe o cargo-alvo e/ou o domínio da empresa.",
      }),
  })
  .strict();
export type B2bSearchInput = z.infer<typeof b2bSearchSchema>;

export const prospectingActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("configure"), api_key: z.string().trim().min(10).max(500) }).strict(),
  z
    .object({
      action: z.literal("search"),
      request_id: z.string().uuid(),
      search: z
        .object({
          name: z.string().trim().min(2).max(120),
          niche: z.string().trim().min(2).max(120),
          location: z.string().trim().min(2).max(160),
          limit: z.number().int().min(1).max(100).default(20),
          budget_usd: z.number().min(0.5).max(10).default(1),
          enrich: z.boolean().default(true),
        })
        .strict(),
    })
    .strict(),
]);

export const importSchema = z
  .object({
    kind: z.enum(["simples", "b2b"]),
    candidate_ids: z.array(z.string().uuid()).min(1).max(100),
    pipeline_id: z.string().uuid(),
    stage_id: z.string().uuid(),
    legal_basis_ref: z.string().trim().min(3).max(500).optional(),
  })
  .strict();
