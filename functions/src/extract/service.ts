// functions/src/extract/service.ts
import Ajv, { JSONSchemaType } from "ajv";
import addFormats from "ajv-formats";
import OpenAI from "openai";

/** ---------------- Types ---------------- */
export interface ExtractionRequest {
  transcript: string;
  language?: string; // e.g., "es-AR"
  correlationId?: string;
}

export interface ExtractionResponseData {
  patient?: {
    age?: number; // 0..130
    sex?: "M" | "F" | "X";
  };
  symptoms?: string[];       // [] allowed
  onsetDays?: number;        // >= 0
  riskFlags?: string[];      // [] allowed
  notes?: string;
}

/** --------------- JSON Schemas --------------- */
const requestSchema: JSONSchemaType<ExtractionRequest> = {
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "ExtractionRequest",
  type: "object",
  properties: {
    transcript: { type: "string", minLength: 1 },
    language: { type: "string", nullable: true, optional: true },
    correlationId: { type: "string", nullable: true, optional: true },
  },
  required: ["transcript"],
  additionalProperties: false,
};

const dataSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "ExtractionResponseData",
  type: "object",
  properties: {
    patient: {
      type: "object",
      properties: {
        age: { type: "integer", minimum: 0, maximum: 130 },
        sex: { type: "string", enum: ["M", "F", "X"] },
      },
      required: [],
      additionalProperties: false,
    },
    symptoms: {
      type: "array",
      items: { type: "string" },
      default: [],
    },
    onsetDays: { type: "integer", minimum: 0 },
    riskFlags: {
      type: "array",
      items: { type: "string" },
      default: [],
    },
    notes: { type: "string" },
  },
  required: [],
  additionalProperties: false,
} as const;

/** --------------- Validators --------------- */
// 👇 cambio: coerceTypes para que "2" -> 2 y similares
const ajv = new Ajv({ allErrors: true, strict: false, coerceTypes: true });
addFormats(ajv);
const validateRequest = ajv.compile(requestSchema);
const validateData = ajv.compile(dataSchema as any);

/** --------------- LLM call + validation --------------- */
async function extractWithLLM(
  transcript: string,
  language?: string
): Promise<ExtractionResponseData> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY no está seteada");
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const openai = new OpenAI({ apiKey });

  const system =
    "Eres un asistente de extracción clínica. Extrae SOLO los campos solicitados. " +
    "No inventes datos. Si algo no está, omítelo. Devuelve JSON válido que cumpla con el schema. " +
    "Responde en el idioma del paciente si hace falta, pero mantiene claves en inglés del schema.";

  const user =
    `Texto clínico (lang=${language || "es-AR"}):\n\n${transcript}\n\n` +
    "Devuelve únicamente el JSON del objeto 'data' sin texto adicional.";

  const completion = await openai.chat.completions.create({
    model,
    temperature: 0,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "ExtractionResponseData",
        schema: dataSchema as any,
        strict: false,
      },
    },
  });

  const content = completion.choices?.[0]?.message?.content;
  if (!content) throw new Error("LLM devolvió contenido vacío");

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("LLM no devolvió JSON válido");
  }

  if (!validateData(parsed)) {
    throw new Error("LLM no cumple el schema de extracción");
  }

  const data = parsed as ExtractionResponseData;
  // Normalizar defaults en arrays
  return {
    symptoms: [],
    riskFlags: [],
    ...data,
  };
}

/** --------------- Servicio público --------------- */
export async function extractService(
  input: ExtractionRequest
): Promise<ExtractionResponseData> {
  const ok = validateRequest(input);
  if (!ok) {
    throw new Error("Bad request en extractService");
  }

  const { transcript, language } = input;
  const data = await extractWithLLM(transcript, language);
  return data;
}
