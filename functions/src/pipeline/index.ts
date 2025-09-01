import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import express, { Request, Response } from "express";
import cors from "cors";
import { z } from "zod";

import { transcribeService, type TranscribeInput } from "../transcribe/service.js";
import { extractService, type ExtractionResponseData } from "../extract/service.js";
import { diagnoseService } from "../diagnose/service.js";

const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");
const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

// ---------- Schemas ----------
const TextInputSchema = z.object({
  text: z.string().min(1, "text debe ser no vacío"),
  language: z.string().optional(),
  correlationId: z.string().optional(),
});

const AudioInputSchema = z.object({
  audio: z.object({
    type: z.enum(["url", "base64"]),
    value: z.string().min(1),
  }),
  filename: z.string().optional(),
  language: z.string().optional(),
  hint: z.string().optional(),
  correlationId: z.string().optional(),
});

const PipelineBodySchema = z.object({
  input: z.union([TextInputSchema, AudioInputSchema]),
  options: z.object({
    provider: z.enum(["gemini", "openai"]).optional(),
  }).optional(),
});
type PipelineBody = z.infer<typeof PipelineBodySchema>;

// ---------- App ----------
const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "20mb" }));

const msDiff = (t: number) => Date.now() - t;

app.post("/", async (req: Request, res: Response) => { 
  const parsed = PipelineBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      step: "validation",
      error: "Body inválido",
      details: parsed.error.issues,
    });
  }

  const { input, options } = parsed.data as PipelineBody;

  try {
    // ---- Step 1: transcript ----
    const t1 = Date.now();
    let transcript: string;
    let language: string | undefined;
    let correlationId: string | undefined;

    if ("text" in input) {
      transcript = input.text;
      language = input.language;
      correlationId = input.correlationId;
    } else {
      let trInput: TranscribeInput;
      if (input.audio.type === "url") {
        trInput = {
          audio: { type: "url", value: input.audio.value },
          filename: input.filename,
          language: input.language,
          hint: input.hint,
          correlationId: input.correlationId,
        };
      } else {
        trInput = {
          audio: { type: "base64", value: input.audio.value },
          filename: input.filename,
          language: input.language,
          hint: input.hint,
          correlationId: input.correlationId,
        };
      }

      const tr = await transcribeService(trInput);
      if (!tr?.text) {
        return res.status(500).json({ ok: false, step: "transcribe", error: "Transcription sin texto" });
      }
      transcript = tr.text;
      language = input.language;
      correlationId = input.correlationId;
    }
    const transcribeMs = msDiff(t1);

    // ---- Step 2: extract ----
    const t2 = Date.now();
    const extracted: ExtractionResponseData = await extractService({
      transcript,
      language,
      correlationId,
    });
    const extractMs = msDiff(t2);

    // ---- Step 3: diagnose ----
    const t3 = Date.now();
    const extractionForDiagnose = {
      patient: extracted.patient,
      symptoms: extracted.symptoms ?? [],
      riskFlags: extracted.riskFlags ?? [],
      onsetDays: extracted.onsetDays,
      notes: extracted.notes,
    };

    const diagnosis = await diagnoseService({
      extraction: extractionForDiagnose,
      language: language ?? "es-AR",
      correlationId,
    });
    const diagnoseMs = msDiff(t3);

    return res.status(200).json({
      ok: true,
      pipeline: {
        timingsMs: {
          transcribe: transcribeMs,
          extract: extractMs,
          diagnose: diagnoseMs,
          total: msDiff(t1),
        },
      },
      transcript,
      extracted,
      diagnosis,
      correlationId,
      provider: options?.provider ?? (process.env.PROVIDER || "gemini"),
    });
  } catch (e: any) {
    return res.status(500).json({
      ok: false,
      step: "unknown",
      error: e?.message ?? "Error inesperado",
    });
  }
});

app.use((_req: Request, res: Response) => {
  res.status(405).json({ ok: false, error: "Usa POST /" });
});

export const pipeline = onRequest(
  {
    region: "us-central1",
    timeoutSeconds: 300,
    memory: "1GiB",
    maxInstances: 1,
    secrets: [OPENAI_API_KEY, GEMINI_API_KEY],
    cors: true,
  },
  app
);
