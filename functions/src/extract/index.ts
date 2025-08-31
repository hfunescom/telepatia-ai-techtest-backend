// functions/src/extract/index.ts
import * as functions from "firebase-functions";
import { createHandler } from "../shared/utils";
import {
  ExtractInputSchema,
  ExtractOutput,
} from "../shared/schemas";

export const extract = functions.https.onRequest(
  createHandler(ExtractInputSchema, async (input): Promise<ExtractOutput> => {
    const { transcript } = input;

    // TODO: NER real (LLM o lib). Stub heurístico mínimo:
    const lower = transcript.toLowerCase();
    const symptoms: string[] = [];
    if (lower.includes("garganta")) symptoms.push("dolor de garganta");
    if (lower.includes("fiebre")) symptoms.push("fiebre");
    if (lower.includes("tos")) symptoms.push("tos");

    return {
      patient: { age: 34, sex: "M" }, // demo
      symptoms,
      onsetDays: lower.includes("2 día") || lower.includes("dos día") ? 2 : undefined,
      riskFlags: [],
      notes: "Extracción dummy basada en heurísticas simples"
    };
  })
);
