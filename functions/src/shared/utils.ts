// ✨ Tipos
import { z } from "zod";   
import type { Request, Response } from "express";

// Respuestas unificadas (sin cambios)
export type OkResponse<T> = { ok: true; correlationId?: string; data: T; };
export type ErrResponse = { ok: false; correlationId?: string; error: { code: string; message: string; details?: unknown } };
export type ApiResponse<T> = OkResponse<T> | ErrResponse;

export function ok<T>(data: T, correlationId?: string): OkResponse<T> {
  return { ok: true, correlationId, data };
}
export function err(code: string, message: string, correlationId?: string, details?: unknown): ErrResponse {
  return { ok: false, correlationId, error: { code, message, details } };
}

// ✅ CORS/response helpers ahora devuelven void
const CORS_ALLOW_ORIGIN = "*";

export function writeJson(res: Response, status: number, body: unknown): void {
  res.set("Access-Control-Allow-Origin", CORS_ALLOW_ORIGIN);
  res.set("Access-Control-Allow-Headers", "Content-Type");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.status(status).json(body);
}

export function handleOptions(req: Request, res: Response): boolean {
  if (req.method === "OPTIONS") {
    res.set("Access-Control-Allow-Origin", CORS_ALLOW_ORIGIN);
    res.set("Access-Control-Allow-Headers", "Content-Type");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.status(204).send("");
    return true; // <- indicamos que ya respondimos
  }
  return false;
}

export function getCorrelationId(req: Request): string | undefined {
  return (req.body && (req.body.correlationId as string)) || req.header("x-correlation-id") || undefined;
}

// Validador (igual)

// ——— Validador genérico con Zod ———
export function validate<T>(
  schema: z.ZodType<T>,
  data: unknown
): { value?: T; error?: z.ZodError } {
  const parsed = schema.safeParse(data);
  if (parsed.success) return { value: parsed.data };
  return { error: parsed.error };
}

// ——— Wrapper de handler ———
export function createHandler<I, O>(
  inputSchema: z.ZodType<I>,
  logic: (input: I, ctx: { correlationId?: string; req: Request }) => Promise<O> | O
) {
  return async (req: Request, res: Response): Promise<void> => {
    if (handleOptions(req, res)) return;

    if (req.method !== "POST") {
      writeJson(res, 405, err("METHOD_NOT_ALLOWED", "Only POST is allowed"));
      return;
    }

    const correlationId = getCorrelationId(req);
    const parsed = inputSchema.safeParse(req.body);
    if (!parsed.success) {
      writeJson(res, 400, err("BAD_REQUEST", "Body validation failed", correlationId, parsed.error.format()));
      return;
    }

    try {
      const output = await logic(parsed.data, { correlationId, req });
      writeJson(res, 200, ok(output as O, correlationId));
    } catch (e: any) {
      const message = e?.message || "Unexpected error";
      writeJson(res, 500, err("INTERNAL_ERROR", message, correlationId));
    }
  };
}

