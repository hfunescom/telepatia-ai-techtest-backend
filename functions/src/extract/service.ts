// functions/src/extract/service.ts
import Ajv, { JSONSchemaType } from "ajv";
import addFormats from "ajv-formats";
import OpenAI from "openai";

/** ---------------- Types ---------------- */
export interface ExtractionRequest {
  transcript: string;
  language: string;       // <- ahora requerido
  correlationId: string;  // <- ahora requerido
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
    language: { type: "string" },
    correlationId: { type: "string" },
  },
  required: ["transcript", "language", "correlationId"], // <- lo que pediste
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
      default: [], // <- usaremos useDefaults para que se aplique
    },
    onsetDays: { type: "integer", minimum: 0 },
    riskFlags: {
      type: "array",
      items: { type: "string" },
      default: [], // <- idem
    },
    notes: { type: "string" },
  },
  required: [],
  additionalProperties: false,
} as const;

/** --------------- Validators --------------- */
// Más tolerante: defaults + quitar props extra del LLM + coerción
const ajv = new Ajv({
  allErrors: true,
  strict: false,
  coerceTypes: true,
  useDefaults: true,            // aplica defaults de schema
  removeAdditional: "all",      // borra props no declaradas
});
addFormats(ajv);
const validateRequest = ajv.compile(requestSchema);
const validateData = ajv.compile(dataSchema as any);

/** --------------- Normalización de salida del LLM --------------- */
// Acepta variaciones típicas del LLM (claves en ES, alias, etc.)
function normalizeExtractionData(raw: any): any {
  if (raw == null || typeof raw !== "object") return raw;

  const out: any = { ...raw };

  // Mapear claves en español/comunes a las del schema
  if (out.sintomas && !out.symptoms) out.symptoms = out.sintomas;
  if (out.riesgos && !out.riskFlags) out.riskFlags = out.riesgos;
  if (out.observaciones && !out.notes) out.notes = out.observaciones;

  if (out.paciente && !out.patient) out.patient = out.paciente;

  if (out.patient && typeof out.patient === "object") {
    const p = { ...out.patient };
    if (p.genero && !p.sex) p.sex = p.genero;
    if (p.sexo && !p.sex) p.sex = p.sexo;
    if (typeof p.age === "string") {
      const num = Number(p.age);
      if (!Number.isNaN(num)) p.age = num;
    }
    out.patient = p;
  }

  // Asegurar arrays si vinieron como string/objeto accidentalmente
  if (typeof out.symptoms === "string") out.symptoms = [out.symptoms];
  if (typeof out.riskFlags === "string") out.riskFlags = [out.riskFlags];

  return out;
}

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
    "Usa claves EXACTAS del schema en inglés (patient, symptoms, onsetDays, riskFlags, notes, sex, age). " +
    "No envíes texto fuera del JSON.";

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

  // Normalizamos ANTES de validar (para aceptar variantes razonables)
  const normalized = normalizeExtractionData(parsed);

  if (!validateData(normalized)) {
    // Arrojar errores visibles para debug rápido
    const errs = JSON.stringify(validateData.errors ?? [], null, 2);
    throw new Error(`LLM no cumple el schema de extracción: ${errs}`);
  }

  const data = normalized as ExtractionResponseData;

  // Defaults finales garantizados (por si el LLM no los puso)
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
    // si falla request, devolvemos explicación con detalles
    throw new Error(
      "Bad request en extractService: " + JSON.stringify(validateRequest.errors ?? [])
    );
  }

  const { transcript, language } = input;
  const data = await extractWithLLM(transcript, language);
  return data;
}
