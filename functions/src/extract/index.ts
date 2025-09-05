import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { extractService, type ExtractionRequest } from "./service";

export const extract = onRequest({ cors: ["*"] }, async (req, res) => {
  const start = Date.now();

  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
    return;
  }

  const body = req.body as unknown;
  const { transcript, language, correlationId } = (body || {}) as ExtractionRequest;

  try {
    const data = await extractService({ transcript, language, correlationId });

    res.status(200).json({
      ok: true,
      ...(correlationId ? { correlationId } : {}),
      data,
    });
  } catch (err) {
    logger.error("/extract INTERNAL_ERROR", {
      correlationId,
      err: (err as Error)?.message,
    });
    res.status(500).json({ ok: false, error: "INTERNAL_ERROR", correlationId });
  } finally {
    logger.info("/extract durationMs", { ms: Date.now() - start });
  }
});
