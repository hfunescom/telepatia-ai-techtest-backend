import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import OpenAI from "openai";
import { toFile } from "openai/uploads";

const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");

// 👇 Exportamos el handler puro para test
export async function transcribeRawHandler(req: any, res: any): Promise<void> {
  // CORS básico
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST")     { res.status(405).send("Use POST"); return; }

  const raw = req.body as Buffer;
  if (!raw || !Buffer.isBuffer(raw) || raw.length === 0) {
    res.status(400).json({ error: "Body vacío; envía audio binario con --data-binary" });
    return;
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const mime = String(req.headers["content-type"] || "application/octet-stream");

    const uploadable = await toFile(raw, "audio", { type: mime });

    const out = await client.audio.transcriptions.create({
      model: "whisper-1",
      file: uploadable,
    });

    res.json({ text: out.text });
    return;
  } catch (e: any) {
    const msg =
      e?.response?.data?.error?.message ||
      e?.message ||
      "Error procesando transcripción";
    res.status(500).json({ error: msg });
    return;
  }
}

// 👇 Cloud Function que usa el handler
export const transcribeRaw = onRequest(
  {
    region: "us-central1",
    timeoutSeconds: 300,
    memory: "1GiB",
    maxInstances: 1,
    secrets: [OPENAI_API_KEY],
  },
  (req, res) => { void transcribeRawHandler(req, res); }
);
