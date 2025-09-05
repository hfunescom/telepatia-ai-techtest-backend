import express from "express";
import request from "supertest";
import { transcribeHandler } from "./index";

// --- Mock de OpenAI (controlamos el método create) ---
const createMock = jest.fn(async () => ({ text: "Texto (mock)" }));
jest.mock("openai", () => {
  const OpenAIMock = jest.fn().mockImplementation(() => ({
    audio: { transcriptions: { create: createMock } },
  }));
  return { __esModule: true, default: OpenAIMock };
});

// --- Mock de fetch para el caso audio.type = "url" ---
const fetchMock = jest.fn();
(global as any).fetch = fetchMock as any;

function buildJsonApp() {
  const app = express();
  app.use(express.json({ limit: "25mb" }));      // para application/json
  app.use(express.raw({ type: "*/*", limit: "25mb" })); // fallback raw (igual que el emulador)
  app.post("/", (req, res) => { void transcribeHandler(req, res); });
  return app;
}

describe("transcribe (contrato JSON + raw fallback)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, OPENAI_API_KEY: "test" } as NodeJS.ProcessEnv;
    createMock.mockReset().mockResolvedValue({ text: "Texto (mock)" });
    fetchMock.mockReset();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  // ---------- JSON inválido ----------
  it("Invalid JSON → 400 (missing audio.type/value)", async () => {
    const app = buildJsonApp();
    const res = await request(app)
      .post("/")
      .set("Content-Type", "application/json")
      .send({ audio: { type: "url" } }); // falta value
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid JSON/i);
  });

  // ---------- JSON con URL ----------
  it("JSON con audio.url → 200 y eco de correlationId", async () => {
    // Mock de fetch que “descarga” el audio
    const fakeBuf = Buffer.from("FAKE-OGG");
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => fakeBuf,
      headers: new Map([["content-type", "audio/ogg"]]),
    });

    const app = buildJsonApp();
    const res = await request(app)
      .post("/")
      .set("Content-Type", "application/json")
      .send({
        audio: { type: "url", value: "https://example.com/audio.ogg" },
        language: "es-AR",
        hint: "consulta médica general",
        correlationId: "demo-123",
      });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ text: "Texto (mock)", correlationId: "demo-123" });
  });

  // ---------- JSON con BASE64 ----------
  it("JSON con audio.base64 → 200", async () => {
    const app = buildJsonApp();
    const res = await request(app)
      .post("/")
      .set("Content-Type", "application/json")
      .send({
        audio: { type: "base64", value: "data:audio/ogg;base64,RkFLRS1PR0c=" }, // "FAKE-OGG"
        language: "es",
        hint: "tos seca",
      });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
    expect(res.body.text).toBe("Texto (mock)");
  });

  // ---------- RAW vacío ----------
  it("Empty raw body → 400", async () => {
    const app = buildJsonApp();
    const res = await request(app)
      .post("/")
      .set("Content-Type", "audio/ogg")
      .send(); // sin body
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Empty body/i);
  });

  // ---------- RAW feliz ----------
  it("Raw con audio → 200", async () => {
    const app = buildJsonApp();
    const res = await request(app)
      .post("/")
      .set("Content-Type", "audio/ogg")
      .send(Buffer.from("FAKE-OPUS-BYTES"));
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
    expect(res.body.text).toBe("Texto (mock)");
  });

  // ---------- Error proveedor ----------
  it("Provider error → 500", async () => {
    createMock.mockRejectedValueOnce(new Error("Simulated failure"));
    const app = buildJsonApp();
    const res = await request(app)
      .post("/")
      .set("Content-Type", "audio/ogg")
      .send(Buffer.from("FAKE"));
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Simulated failure|Error processing/i);
  });
});
