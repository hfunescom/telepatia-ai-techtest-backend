import { onRequest } from "firebase-functions/v2/https";
import express, { Request, Response } from "express";
import cors from "cors";
import { z } from "zod";
// 👇 import estático (soluciona el error en Jest)
import { GoogleGenerativeAI } from "@google/generative-ai";

/** =========================
 *  Esquemas (Contrato v1)
 *  ========================= */

const PatientSchema = z
  .object({
    age: z.number().int().min(0).max(130).optional(),
    sex: z.enum(["M", "F", "X"]).optional(),
  })
  .optional();

const ExtractionSchema = z.object({
  patient: PatientSchema,
  symptoms: z.array(z.string()).default([]),
  onsetDays: z.number().int().min(0).optional(),
  riskFlags: z.array(z.string()).default([]),
  notes: z.string().optional(),
});

const DiagnoseRequestSchema = z.object({
  extraction: ExtractionSchema, // obligatorio
  language: z.string().optional().default("es-AR"),
  correlationId: z.string().optional(),
});

type DiagnoseRequest = z.infer<typeof DiagnoseRequestSchema>;

const LlmOutputSchema = z.object({
  summary: z.string(),
  differentials: z.array(z.string()).default([]),
  recommendations: z.array(z.string()).default([]),
  severity: z.enum(["low", "moderate", "high"]),
});

const DiagnoseResponseSchema = z.object({
  ok: z.literal(true),
  correlationId: z.string().optional(),
  data: LlmOutputSchema,
});

/** =========================
 *  Prompt Builder
 *  ========================= */

function buildPrompt(req: DiagnoseRequest) {
  const locale = req.language ?? "es-AR";
  const system = `
Eres un asistente clínico para triage inicial. No brindas diagnóstico definitivo ni reemplazas a profesionales.
Debes:
- Analizar los datos suministrados (síntomas, edad, sexo, días de evolución, banderas de riesgo, notas).
- Producir un texto CLARO que combine: diagnóstico orientativo + tratamiento/medidas iniciales + recomendaciones.
- Devolver SOLO un JSON con: summary (texto claro), differentials[], recommendations[], severity ("low"|"moderate"|"high").
- Responder en idioma/localización: ${locale}.
- No inventes datos; si faltan, menciónalo.
- Incluye aviso: "Esta información es orientativa y no reemplaza la consulta con profesionales de la salud."
- Si detectas signos de alarma o riesgo, usa severity="high" y prioriza urgencia.
- Devuelve solo JSON válido, sin explicaciones alrededor.

FORMATO JSON EXACTO:
{
  "summary": "string",
  "differentials": ["string", ...],
  "recommendations": ["string", ...],
  "severity": "low" | "moderate" | "high"
}
`.trim();

  const user = {
    locale,
    extraction: req.extraction,
  };

  return { system, user };
}

/** =========================
 *  Capa LLM (Gemini por defecto)
 *  ========================= */

async function callGeminiJSON({
  system,
  user,
  model,
}: {
  system: string;
  user: unknown;
  model?: string;
}): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

  const genAI = new GoogleGenerativeAI(apiKey);
  const modelName = model || process.env.GEMINI_MODEL || "gemini-1.5-flash";
  const m = genAI.getGenerativeModel({ model: modelName });

  const prompt = [
    `# Sistema\n${system}`,
    `# Usuario (JSON)\n${JSON.stringify(user)}`,
    `# Responde SOLO un JSON válido.`,
  ].join("\n\n");

  const result = await m.generateContent(prompt);
  const text = result.response.text().trim();
  if (!text) throw new Error("Gemini empty response");
  return text;
}

// Fallback opcional a OpenAI si seteas PROVIDER=openai (mantenemos import dinámico aquí)
async function callOpenAIJSON({
  system,
  user,
  model,
}: {
  system: string;
  user: unknown;
  model?: string;
}): Promise<string> {
  const { default: OpenAI } = await import("openai");
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const client = new OpenAI({ apiKey });
  const modelName = model || process.env.OPENAI_MODEL || "gpt-4o-mini";

  const messages = [
    { role: "system" as const, content: system },
    { role: "user" as const, content: JSON.stringify(user) },
  ];

  const completion = await client.chat.completions.create({
    model: modelName,
    response_format: { type: "json_object" },
    temperature: 0.2,
    messages,
  });

  const content = completion.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("OpenAI empty response");
  return content;
}

async function generateDiagnosisJSON(opts: {
  system: string;
  user: unknown;
}): Promise<string> {
  const provider = (process.env.PROVIDER || "gemini").toLowerCase();
  if (provider === "openai") {
    return callOpenAIJSON(opts);
  }
  return callGeminiJSON(opts);
}

/** =========================
 *  Handler HTTP (export nombrado)
 *  ========================= */

export async function diagnoseHandler(req: Request, res: Response) {
  try {
    const parsed = DiagnoseRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ ok: false, error: "BAD_REQUEST", details: parsed.error.format() });
    }

    const data = parsed.data;
    const { system, user } = buildPrompt(data);

    const raw = await generateDiagnosisJSON({ system, user });

    // Parseo robusto del JSON (limpia bloques ``` si el modelo los añade)
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      const cleaned = raw.replace(/```json|```/g, "").trim();
      json = JSON.parse(cleaned);
    }

    const llmOut = LlmOutputSchema.parse(json);

    const response = {
      ok: true as const,
      correlationId: data.correlationId,
      data: llmOut,
    };

    // Validar contra nuestro contrato de respuesta
    DiagnoseResponseSchema.parse(response);

    return res.status(200).json(response);
  } catch (err: any) {
    console.error("[diagnose] ERROR:", err?.message, err?.stack);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
}

/** =========================
 *  Export de la Cloud Function "diagnose" (Firebase v2)
 *  ========================= */

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());
app.post("/", diagnoseHandler);

export const diagnose = onRequest({ cors: true, region: "us-central1" }, app);
