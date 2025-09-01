// functions/src/diagnose/service.ts
import { z } from "zod";
// 👇 import estático (compatible con Jest)
import { GoogleGenerativeAI } from "@google/generative-ai";

// ---------------- Esquemas (Contrato v1) ----------------
export const PatientSchema = z
  .object({
    age: z.number().int().min(0).max(130).optional(),
    sex: z.enum(["M", "F", "X"]).optional(),
  })
  .optional();

export const ExtractionSchema = z.object({
  patient: PatientSchema,
  symptoms: z.array(z.string()).default([]),
  onsetDays: z.number().int().min(0).optional(),
  riskFlags: z.array(z.string()).default([]),
  notes: z.string().optional(),
});

export const DiagnoseRequestSchema = z.object({
  extraction: ExtractionSchema, // obligatorio
  language: z.string().optional().default("es-AR"),
  correlationId: z.string().optional(),
});
export type DiagnoseRequest = z.infer<typeof DiagnoseRequestSchema>;

export const LlmOutputSchema = z.object({
  summary: z.string(),
  differentials: z.array(z.string()).default([]),
  recommendations: z.array(z.string()).default([]),
  severity: z.enum(["low", "moderate", "high"]),
});
export type LlmOutput = z.infer<typeof LlmOutputSchema>;

// ---------------- Prompt Builder ----------------
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

// ---------------- Capa LLM ----------------
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

// Fallback opcional a OpenAI si seteas PROVIDER=openai (import dinámico)
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

  const completion = await client.chat.completions.create({
    model: modelName,
    response_format: { type: "json_object" },
    temperature: 0.2,
    messages: [
      { role: "system", content: system },
      { role: "user", content: JSON.stringify(user) },
    ],
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

// ---------------- Servicio público ----------------
export async function diagnoseService(input: DiagnoseRequest): Promise<LlmOutput> {
  // Validación de entrada (zod)
  const parsed = DiagnoseRequestSchema.parse(input);
  const { system, user } = buildPrompt(parsed);

  const raw = await generateDiagnosisJSON({ system, user });

  // Parse robusto del JSON (limpiando ``` si el modelo los añade)
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    json = JSON.parse(cleaned);
  }

  // Validar contra el esquema de salida
  const llmOut = LlmOutputSchema.parse(json);

  // Normalizar defaults (por si el modelo omite arrays)
  return {
    summary: llmOut.summary,
    differentials: llmOut.differentials ?? [],
    recommendations: llmOut.recommendations ?? [],
    severity: llmOut.severity,
  };
}
