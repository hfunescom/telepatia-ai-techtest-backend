import express from "express";
import request from "supertest";

// Mock de OpenAI ANTES de importar el handler:
const mockCreate = jest.fn();

// Clase mock que "simula" el SDK de OpenAI
jest.mock("openai", () => {
  return jest.fn().mockImplementation(() => {
    return {
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    };
  });
});

describe("extract (HTTP Function)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv, OPENAI_API_KEY: "test-key", OPENAI_MODEL: "gpt-4o-mini" };
    mockCreate.mockReset();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  function buildApp() {
    // Import tardío para que tome el mock y las env vars de cada test
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { extract } = require("./index"); // v2 onRequest handler (req,res) compatible
    const app = express();
    app.use(express.json());
    // montamos en raíz para simplificar
    app.post("/", extract);
    return app;
  }

  test("200 OK - extracción exitosa con JSON válido del LLM", async () => {
    // El LLM devuelve SOLO el objeto 'data' (según nuestra implementación)
    const llmData = {
      patient: { age: 34, sex: "M" },
      symptoms: ["dolor de garganta"],
      onsetDays: 2,
      riskFlags: [],
      notes: ""
    };

    mockCreate.mockResolvedValueOnce({
      choices: [
        { message: { content: JSON.stringify(llmData) } }
      ]
    });

    const app = buildApp();

    const res = await request(app)
      .post("/")
      .send({
        transcript: "Paciente masculino de 34 años con dolor de garganta desde hace 2 días...",
        language: "es-AR",
        correlationId: "abc-123"
      })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.correlationId).toBe("abc-123");
    expect(res.body.data).toEqual({
      // el handler asegura defaults para arrays
      symptoms: ["dolor de garganta"],
      riskFlags: [],
      patient: { age: 34, sex: "M" },
      onsetDays: 2,
      notes: ""
    });
    // asegura que llamamos al LLM
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  test("500 INTERNAL_ERROR - body incompleto", async () => {
    const app = buildApp();

    const res = await request(app)
      .post("/")
      // falta transcript y correlationId
      .send({ language: "es-AR" })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(500);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toBe("INTERNAL_ERROR");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("500 INTERNAL_ERROR - LLM devuelve JSON inválido", async () => {
    // Mensaje que no es JSON parseable
    mockCreate.mockResolvedValueOnce({
      choices: [
        { message: { content: "not a json" } }
      ]
    });

    const app = buildApp();

    const res = await request(app)
      .post("/")
      .send({
        transcript: "Texto clínico...",
        language: "es-AR",
        correlationId: "xyz-999"
      })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(500);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toBe("INTERNAL_ERROR");
    expect(res.body.correlationId).toBe("xyz-999");
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});
