// functions/src/diagnose/index.ts
import * as functions from "firebase-functions";
import { createHandler } from "../shared/utils";
import {
  DiagnoseInputSchema,
  DiagnoseOutput,
} from "../shared/schemas";

export const diagnose = functions.https.onRequest(
  createHandler(DiagnoseInputSchema, async (input): Promise<DiagnoseOutput> => {
    const { extraction } = input;
    const hasFever = extraction.symptoms?.some(s => s.toLowerCase().includes("fiebre"));
    const hasThroat = extraction.symptoms?.some(s => s.toLowerCase().includes("garganta"));

    // Stub de lógica
    let summary = "Cuadro inespecífico.";
    const differentials: string[] = [];
    const recommendations: string[] = ["Hidratación y reposo"];
    let severity: "low" | "moderate" | "high" = "low";

    if (hasThroat) {
      summary = "Cuadro compatible con faringitis leve.";
      differentials.push("faringitis viral", "resfriado común");
      recommendations.push("Antitérmicos si hay fiebre", "Consulta si empeora en 48-72h");
    }
    if (hasFever) {
      severity = "moderate";
    }

    return { summary, differentials, recommendations, severity };
  })
);
