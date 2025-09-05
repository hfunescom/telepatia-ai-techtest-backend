import { z } from "zod";

export const LanguageSchema = z.string().min(2).max(10).optional();
export const CorrelationIdSchema = z.string().min(1).optional();

const AudioSchema = z.object({
  type: z.enum(["url", "base64"]),
  value: z.string().min(1)
});

export const TranscribeInputSchema = z.object({
  audio: AudioSchema,
  language: LanguageSchema,
  hint: z.string().optional(),
  correlationId: CorrelationIdSchema
});

export type TranscribeInput = z.infer<typeof TranscribeInputSchema>;

export const TranscribeOutputSchema = z.object({
  transcript: z.string(),
  languageDetected: z.string().optional(),
  durationSec: z.number().optional()
});
export type TranscribeOutput = z.infer<typeof TranscribeOutputSchema>;

export const ExtractInputSchema = z.object({
  transcript: z.string().min(1),
  language: LanguageSchema,
  correlationId: CorrelationIdSchema
});
export type ExtractInput = z.infer<typeof ExtractInputSchema>;

export const ExtractionSchema = z.object({
  patient: z
    .object({
      age: z.number().int().min(0).max(130).optional(),
      sex: z.enum(["M", "F", "X"]).optional()
    })
    .optional(),
  symptoms: z.array(z.string()).default([]),
  onsetDays: z.number().int().min(0).optional(),
  riskFlags: z.array(z.string()).default([]),
  notes: z.string().optional()
});
export type Extraction = z.infer<typeof ExtractionSchema>;

export const ExtractOutputSchema = ExtractionSchema;
export type ExtractOutput = z.infer<typeof ExtractOutputSchema>;

export const DiagnoseInputSchema = z.object({
  extraction: ExtractionSchema,
  language: LanguageSchema,
  correlationId: CorrelationIdSchema
});
export type DiagnoseInput = z.infer<typeof DiagnoseInputSchema>;

export const DiagnoseOutputSchema = z.object({
  summary: z.string(),
  differentials: z.array(z.string()).default([]),
  recommendations: z.array(z.string()).default([]),
  severity: z.enum(["low", "moderate", "high"]).default("low")
});
export type DiagnoseOutput = z.infer<typeof DiagnoseOutputSchema>;
