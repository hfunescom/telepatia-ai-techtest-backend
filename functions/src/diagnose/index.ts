import { onRequest } from "firebase-functions/v2/https";
import express, { Request, Response } from "express";
import cors from "cors";
import { diagnoseService, DiagnoseRequestSchema } from "./service";

export async function diagnoseHandler(req: Request, res: Response) {
  try {
    const parsed = DiagnoseRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ ok: false, error: "BAD_REQUEST", details: parsed.error.format() });
    }

    const data = parsed.data;
    const out = await diagnoseService(data);

    return res.status(200).json({
      ok: true as const,
      correlationId: data.correlationId,
      data: out,
    });
  } catch (err: any) {
    console.error("[diagnose] ERROR:", err?.message, err?.stack);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
}

// Export de la Cloud Function "diagnose"
const app = express();
app.use(cors({ origin: true }));
app.use(express.json());
app.post("/", diagnoseHandler);

export const diagnose = onRequest({ cors: true, region: "us-central1" }, app);
