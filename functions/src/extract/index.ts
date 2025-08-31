import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import Ajv, { type JSONSchemaType } from "ajv";
import addFormats from "ajv-formats";
import OpenAI from "openai";

/**
 * -------------------------------
 * Types
 * -------------------------------
 */
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
  symptoms?: string[]; // [] allowed
  onsetDays?: number; // >= 0
  riskFlags?: string[]; // [] allowed
  notes?: string;
}

export interface ExtractionResponse {
  ok: boolean;
  correlationId?: string;
  data: ExtractionResponseData;
}

/**
 * -------------------------------
 * JSON Schemas
 * -------------------------------
 */
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


/**
 * -------------------------------
 * Validators
 * -------------------------------
 */
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validateRequest = ajv.compile(requestSchema);

/**
 * -------------------------------
 * OpenAI client (use GPT-4o-mini by default)
 * -------------------------------
 */
const openaiApiKey = process.env.OPENAI_API_KEY;
const openaiModel = process.env.OPENAI_MODEL || "gpt-4o-mini";
const openai = openaiApiKey ? new OpenAI({ apiKey: openaiApiKey }) : undefined;

if (!openaiApiKey) {
  logger.warn(
    "OPENAI_API_KEY is not set. The extract function will respond with an INTERNAL_ERROR on LLM usage."
  );
}

/**
 * -------------------------------
 * Helper: call LLM with Structured Outputs
 * -------------------------------
 */
async function extractWithLLM(
  transcript: string,
  language: string | undefined
): Promise<ExtractionResponseData> {
  if (!openai) throw new Error("OpenAI client not configured");

  const system =
    "Eres un asistente de extracción clínica. Extrae SOLO los campos solicitados. " +
    "No inventes datos. Si algo no está, omítelo. Devuelve JSON válido que cumpla con el schema. " +
    "Responde en el idioma del paciente si hace falta, pero mantiene claves en inglés del schema.";

  const user = `Texto clínico (lang=${language || "es-AR"}):\n\n${transcript}`;

  // Pedimos que el modelo devuelva SOLO el objeto "data" del schema (no el envoltorio { ok, data, ... })
  const completion = await openai.chat.completions.create({
    model: openaiModel,
    temperature: 0,
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content:
          user +
          "\n\nDevuelve únicamente el JSON del objeto 'data' sin texto adicional.",
      },
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
  if (!content) throw new Error("LLM empty content");

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    logger.error("Failed to parse LLM JSON", e as any);
    throw new Error("LLM returned non-JSON content");
  }

  // Validate the LLM output against dataSchema
  const validateData = ajv.compile(dataSchema as any);
  if (!validateData(parsed)) {
    logger.error("LLM output validation error", {
      errors: validateData.errors,
      output: parsed,
    });
    throw new Error("LLM output failed schema validation");
  }

  return parsed as ExtractionResponseData;
}

/**
 * -------------------------------
 * HTTP Function
 * -------------------------------
 */
export const extract = onRequest({ cors: ["*"] }, async (req, res) => {
  const start = Date.now();

  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
    return;
  }

  const body = req.body as unknown;

  if (!validateRequest(body)) {
    logger.warn("Bad request on /extract", { errors: validateRequest.errors });
    res.status(400).json({ ok: false, error: "BAD_REQUEST" });
    return;
  }

  const { transcript, language, correlationId } = body as ExtractionRequest;

  try {
    const data = await extractWithLLM(transcript, language);

    const response: ExtractionResponse = {
      ok: true,
      ...(correlationId ? { correlationId } : {}),
      data: {
        // Ensure arrays default
        symptoms: [],
        riskFlags: [],
        ...data,
      },
    };

    res.status(200).json(response);
  } catch (err) {
    logger.error("/extract INTERNAL_ERROR", {
      correlationId,
      err: (err as Error)?.message,
    });
    res.status(500).json({ ok: false, error: "INTERNAL_ERROR", correlationId });
  } finally {
    logger.info("/extract durationMs", { ms: Date.now() - start });
  }
});
