import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import OpenAI from "openai";
import { toFile } from "openai/uploads";

const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");

// Utilidad: normaliza "es-AR" -> "es" para Whisper (acepta ISO-639)
function normalizeLanguage(input?: string): string | undefined {
  if (!input) return undefined;
  // toma el subtag primario (antes del "-")
  const primary = input.split("-")[0]?.trim();
  return primary || undefined;
}

// 👉 Handler que soporta JSON (url/base64) y binario crudo
export async function transcribeHandler(req: any, res: any): Promise<void> {
  // CORS
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST")     { res.status(405).send("Use POST"); return; }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const ct = String(req.headers["content-type"] || "");

  // --- MODO JSON: contrato inicial ---
  if (ct.includes("application/json")) {
    let body: any = req.body;

    // Por si el emulador entrega string o Buffer:
    if (Buffer.isBuffer(body)) {
      try { body = JSON.parse(body.toString("utf8")); } catch { body = undefined; }
    } else if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { body = undefined; }
    }

    if (!body || !body.audio || !body.audio.type || !body.audio.value) {
      res.status(400).json({ error: "JSON inválido: se espera audio: { type: 'url'|'base64', value: '...' }" });
      return;
    }

    let buf: Buffer | undefined;
    let mime = "application/octet-stream";
    let filename = body.filename || "audio";

    try {
      if (body.audio.type === "url") {
        const r = await fetch(body.audio.value);
        if (!r.ok) {
          res.status(400).json({ error: `No se pudo descargar el audio: ${r.status}` });
          return;
        }
        const ab = await r.arrayBuffer();
        buf = Buffer.from(ab);
        mime = r.headers.get("content-type") || "application/octet-stream";
        // intentar inferir nombre desde la URL
        try {
          const u = new URL(body.audio.value);
          const last = u.pathname.split("/").pop();
          if (last) filename = last;
        } catch { /* noop */ }
      } else if (body.audio.type === "base64") {
        const b64 = String(body.audio.value);
        const payload = b64.includes(",") ? b64.split(",").pop()! : b64;
        buf = Buffer.from(payload, "base64");
        // si viene data:audio/xxx;base64,...
        const m = b64.match(/^data:([^;]+);base64,/i);
        if (m) mime = m[1];
        filename = body.filename || "audio";
      } else {
        res.status(400).json({ error: "audio.type debe ser 'url' o 'base64'" });
        return;
      }

      if (!buf || buf.length === 0) {
        res.status(400).json({ error: "Audio vacío o inválido" });
        return;
      }

      const uploadable = await toFile(buf, filename, { type: mime });

      const language = normalizeLanguage(body.language);
      const hint: string | undefined = body.hint || undefined;

      const out = await client.audio.transcriptions.create({
        model: "whisper-1",
        file: uploadable,
        language,
        prompt: hint,
      });

      res.json({
        text: out.text,
        correlationId: body.correlationId || undefined,
      });
      return;
    } catch (e: any) {
      const msg = e?.response?.data?.error?.message || e?.message || "Error procesando transcripción";
      res.status(500).json({ error: msg });
      return;
    }
  }

  // --- Fallback: binario crudo (lo que venías usando con --data-binary) ---
  const raw = req.body as Buffer;
  if (!raw || !Buffer.isBuffer(raw) || raw.length === 0) {
    res.status(400).json({ error: "Body vacío; envía JSON con audio.url/base64 o audio binario con --data-binary" });
    return;
  }

  try {
    const mime = String(req.headers["content-type"] || "application/octet-stream");
    const uploadable = await toFile(raw, "audio", { type: mime });

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

// Cloud Function
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
