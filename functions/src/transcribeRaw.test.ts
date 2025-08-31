// src/transcribeRaw.test.ts
import express from "express";
import request from "supertest";
import { transcribeRawHandler } from "./transcribeRaw";

// --- Mock de OpenAI como clase mockeada y con createMock exportado:
const createMock = jest.fn(async () => ({ text: "Texto de prueba (mock)" }));

jest.mock("openai", () => {
  const OpenAIMock = jest.fn().mockImplementation(() => ({
    audio: { transcriptions: { create: createMock } },
  }));
  return { __esModule: true, default: OpenAIMock };
});

// Helper: app que pasa el body como Buffer (raw) igual que el emulador
function buildTestApp() {
  const app = express();
  app.use(express.raw({ type: "*/*", limit: "10mb" }));
  app.post("/", (req, res) => transcribeRawHandler(req, res));
  return app;
}

describe("transcribeRaw", () => {
  beforeEach(() => {
    createMock.mockReset().mockResolvedValue({ text: "Texto de prueba (mock)" });
  });

  it("debería responder 400 si el body está vacío", async () => {
    const app = buildTestApp();
    const res = await request(app).post("/").set("Content-Type", "audio/ogg").send();
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Body vacío/i);
  });

  it("debería devolver 200 y texto cuando se envía audio binario", async () => {
    const app = buildTestApp();
    const res = await request(app)
      .post("/")
      .set("Content-Type", "audio/ogg")
      .send(Buffer.from("FAKE-OPUS-BYTES"));
    expect(res.status).toBe(200);
    expect(res.body.text).toBe("Texto de prueba (mock)");
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("debería mapear errores a 500", async () => {
    createMock.mockRejectedValueOnce(new Error("Falla simulada"));

    const app = buildTestApp();
    const res = await request(app)
      .post("/")
      .set("Content-Type", "audio/ogg")
      .send(Buffer.from("FAKE"));
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Falla simulada|Error procesando/i);
    expect(createMock).toHaveBeenCalledTimes(1);
  });
});
