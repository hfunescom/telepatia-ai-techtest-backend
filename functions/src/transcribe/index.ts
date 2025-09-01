// functions/src/transcribe/index.ts
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import OpenAI from "openai";
import { toFile } from "openai/uploads";
import { transcribeService } from "./service"; // 👈 NUEVO

const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");

// 👉 Handler que soporta JSON (url/base64) y binario crudo
export async function transcribeHandler(req: any, res: any): Promise<void> {
  // CORS
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST")     { res.status(405).send("Use POST"); return; }

  const ct = String(req.headers["content-type"] || "");

  // --- MODO JSON: contrato inicial ---
  if (ct.includes("application/json")) {
    let body: any = req.body;

    if (Buffer.isBuffer(body)) {
      try { body = JSON.parse(body.toString("utf8")); } catch { body = undefined; }
    } else if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { body = undefined; }
    }

    if (!body || !body.audio || !body.audio.type || !body.audio.value) {
      res.status(400).json({ error: "JSON inválido: se espera audio: { type: 'url'|'base64', value: '...' }" });
      return;
    }

    try {
      const out = await transcribeService({
        audio: body.audio,
        filename: body.filename,
        language: body.language,
        hint: body.hint,
        correlationId: body.correlationId,
      });

      res.json({
        text: out.text,
        correlationId: out.correlationId,
      });
      return;
    } catch (e: any) {
      const msg = e?.response?.data?.error?.message || e?.message || "Error procesando transcripción";
      res.status(500).json({ error: msg });
      return;
    }
  }

  // --- Fallback: binario crudo ---
  const raw = req.body as Buffer;
  if (!raw || !Buffer.isBuffer(raw) || raw.length === 0) {
    res.status(400).json({ error: "Body vacío; envía JSON con audio.url/base64 o audio binario con --data-binary" });
    return;
  }

  try {
    const mime = String(req.headers["content-type"] || "application/octet-stream");
    const uploadable = await toFile(raw, "audio", { type: mime });

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const out = await client.audio.transcriptions.create({
      model: "whisper-1",
      file: uploadable,
    });

    res.json({ text: out.text });
    return;
  } catch (e: any) {
    const msg = e?.response?.data?.error?.message || e?.message || "Error procesando transcripción";
    res.status(500).json({ error: msg });
    return;
  }
}

export const transcribe = onRequest(
  {
    region: "us-central1",
    timeoutSeconds: 300,
    memory: "1GiB",
    maxInstances: 1,
    secrets: [OPENAI_API_KEY],
  },
  (req, res) => { void transcribeHandler(req, res); }
);
