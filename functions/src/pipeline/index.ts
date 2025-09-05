import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import express, { Request, Response } from "express";
import cors from "cors";
import { z } from "zod";

import { transcribeService, type TranscribeInput } from "../transcribe/service";
import { extractService, type ExtractionResponseData } from "../extract/service";
import { diagnoseService } from "../diagnose/service";

const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");
const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

const TextInputSchema = z.object({
  text: z.string().min(1, "text must be non-empty"),
  language: z.string().default("es-AR").optional(),
  correlationId: z.string().default(() => `corr-${Date.now()}`).optional(),
});

const AudioInputSchema = z.object({
  audio: z.object({
    type: z.enum(["url", "base64"]),
    value: z.string().min(1),
  }),
  filename: z.string().optional(),
  language: z.string().default("es-AR").optional(),
  hint: z.string().optional(),
  correlationId: z.string().default(() => `corr-${Date.now()}`).optional(),
});

const PipelineBodySchema = z.object({
  input: z.union([TextInputSchema, AudioInputSchema]),
  options: z
    .object({
      provider: z.enum(["gemini", "openai"]).optional(),
    })
    .optional(),
});
type PipelineBody = z.infer<typeof PipelineBodySchema>;

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "20mb" }));

const elapsed = (t0: number) => Date.now() - t0;

const SUPPORTED_LANGS = ["es", "en"] as const;
function primaryLang(locale: string | undefined): string {
  return locale?.split("-")[0]?.toLowerCase() || "";
}

app.post("/", async (req: Request, res: Response) => {
  
  const parsed = PipelineBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      step: "validation",
      error: "Invalid body",
      details: parsed.error.issues,
    });
  }

  const { input, options } = parsed.data as PipelineBody;

  const t0 = Date.now();
  try {
    // ---- Step 1: transcript ----
    const t1 = Date.now();

    let transcript: string;
    let language: string | undefined;
    let correlationId: string | undefined;

    if ("text" in input) {
      transcript = input.text;
      language = input.language ?? "es-AR";
      correlationId = input.correlationId ?? `corr-${Date.now()}`;
    } else {
      
      const trInput: TranscribeInput =
        input.audio.type === "url"
          ? {
              audio: { type: "url", value: input.audio.value },
              filename: input.filename,
              language: input.language,
              hint: input.hint,
              correlationId: input.correlationId,
            }
          : {
              audio: { type: "base64", value: input.audio.value },
              filename: input.filename,
              language: input.language,
              hint: input.hint,
              correlationId: input.correlationId,
            };

      const tr = await transcribeService(trInput);
      if (!tr?.text) {
        return res
          .status(500)
          .json({ ok: false, step: "transcribe", error: "Transcription has no text" });
      }
      transcript = tr.text;
      language = input.language ?? tr.language ?? "es-AR";
      correlationId = input.correlationId ?? `corr-${Date.now()}`;
    }

    const transcribeMs = elapsed(t1);

    // Normalizamos para tipos estrictos que requiere extract
    const lang: string = language ?? "es-AR";
    const corrId: string = correlationId ?? `corr-${Date.now()}`;

    const primary = primaryLang(lang);
    if (!SUPPORTED_LANGS.includes(primary as any)) {
      return res
        .status(400)
        .json({ ok: false, error: "unsupported language", correlationId: corrId });
    }

    // ---- Step 2: extract ----
    const t2 = Date.now();
    const extracted: ExtractionResponseData = await extractService({
      transcript,
      language: lang,
      correlationId: corrId,
    });
    const extractMs = elapsed(t2);

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
      language: lang,
      correlationId: corrId,
    });
    const diagnoseMs = elapsed(t3);

    return res.status(200).json({
      ok: true,
      pipeline: {
        timingsMs: {
          transcribe: transcribeMs,
          extract: extractMs,
          diagnose: diagnoseMs,
          total: elapsed(t0),
        },
      },
      transcript,
      extracted,
      diagnosis,
      correlationId: corrId,
      provider: options?.provider ?? process.env.PROVIDER ?? "gemini",
    });
  } catch (e: any) {
    return res.status(500).json({
      ok: false,
      step: "unknown",
      error: e?.message ?? "Unexpected error",
    });
  }
});

app.use((_req: Request, res: Response) => {
  res.status(405).json({ ok: false, error: "Use POST /" });
});

// -------- Export Cloud Function --------
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
