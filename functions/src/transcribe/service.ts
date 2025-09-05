// functions/src/transcribe/service.ts
import OpenAI from "openai";
import { toFile } from "openai/uploads";

/** Normaliza "es-AR" -> "es" (Whisper usa ISO-639 primario) */
function normalizeLanguage(input?: string): string | undefined {
  if (!input) return undefined;
  const primary = input.split("-")[0]?.trim();
  return primary || undefined;
}

/** Entrada admitida por el servicio (URL o Base64) */
export type TranscribeInput =
  | {
      audio: { type: "url"; value: string };
      filename?: string;
      language?: string;
      hint?: string;
      correlationId?: string;
    }
  | {
      audio: { type: "base64"; value: string };
      filename?: string;
      language?: string;
      hint?: string;
      correlationId?: string;
    };

/** Salida del servicio */
export type TranscribeResult = { text: string; language: string, correlationId?: string };

/** Servicio puro reutilizable por handler HTTP y por el pipeline */
export async function transcribeService(input: TranscribeInput): Promise<TranscribeResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  const client = new OpenAI({ apiKey });

  let buf: Buffer;
  let mime = "application/octet-stream";
  let filename = input.filename || "audio";

  if (input.audio.type === "url") {
    const r = await fetch(input.audio.value);
    if (!r.ok) throw new Error(`No se pudo descargar el audio: ${r.status}`);
    const ab = await r.arrayBuffer();
    buf = Buffer.from(ab);
    mime = r.headers.get("content-type") || "application/octet-stream";
    try {
      const u = new URL(input.audio.value);
      const last = u.pathname.split("/").pop();
      if (last) filename = last;
    } catch {
      /* noop */
    }
  } else {
    const b64 = String(input.audio.value);
    const payload = b64.includes(",") ? b64.split(",").pop()! : b64;
    buf = Buffer.from(payload, "base64");
    const m = b64.match(/^data:([^;]+);base64,/i);
    if (m) mime = m[1];
  }

  if (!buf || buf.length === 0) throw new Error("Audio vacío o inválido");

  const uploadable = await toFile(buf, filename, { type: mime });
  const language = normalizeLanguage(input.language);
  const hint = input.hint || undefined;

  const out = await client.audio.transcriptions.create({
    model: "whisper-1",
    file: uploadable,
    ...(language ? { language } : {}),
    prompt: hint,
    response_format: "verbose_json",
  } as any);

  const detected = normalizeLanguage((out as any).language);

  return {
    text: out.text,
    language: detected || language || "",
    correlationId: input.correlationId,
  };
}
