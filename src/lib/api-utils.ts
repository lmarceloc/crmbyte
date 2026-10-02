import { NextResponse } from "next/server";
import type { ZodError } from "zod";
import { toErrorResponse } from "@/lib/auth/account";

export const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export const fail = (code: string, message: string, status: number, details?: unknown) =>
  json({ error: message, code, ...(details ? { details } : {}) }, status);

export function validationFailed(err: ZodError) {
  const msg = err.issues.map((i) => `${i.path.join(".") || "corpo"}: ${i.message}`).join("; ");
  return fail("validation_failed", msg, 422);
}

export { toErrorResponse };
