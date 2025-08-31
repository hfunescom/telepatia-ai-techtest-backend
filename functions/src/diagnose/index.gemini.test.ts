import request from "supertest";
import express from "express";

// 1) Mock de Gemini
jest.mock("@google/generative-ai", () => {
  const mockedJson = JSON.stringify({
    summary:
      "Probable faringitis viral. Esta información es orientativa y no reemplaza la consulta con profesionales de la salud.",
    differentials: ["Faringitis bacteriana", "IRVA"],
    recommendations: ["Hidratación", "Antitérmicos", "Consultar si empeora"],
    severity: "low",
  });

  const generateContent = jest.fn().mockResolvedValue({
    response: { text: () => mockedJson },
  });

  class GoogleGenerativeAI {
    constructor(_apiKey: string) {}
    getGenerativeModel(_opts: { model: string }) {
      return { generateContent };
    }
  }

  return { __esModule: true, GoogleGenerativeAI };
});

// 2) (Opcional pero recomendado) Mock de onRequest para que no haga side-effects al cargar el módulo
jest.mock("firebase-functions/v2/https", () => ({
  onRequest: (_opts: any, handler: any) => handler, // export const diagnose = onRequest(..., app);
}));

describe("POST /diagnose (Gemini mocked)", () => {
  let app: express.Express;

  beforeAll(() => {
    // Setear env ANTES de cargar el módulo a testear
    process.env.PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "test-key";
    process.env.GEMINI_MODEL = "gemini-1.5-flash";

    // Asegurar que el require use las env ya seteadas
    jest.resetModules();
    // Cargar el handler (sin import() dinámico)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require("../diagnose");
    const { diagnoseHandler } = mod as { diagnoseHandler: any };

    app = express();
    app.use(express.json());
    app.post("/diagnose", diagnoseHandler);
  });

  it("200 OK con body válido (contrato completo)", async () => {
    const res = await request(app)
      .post("/diagnose")
      .send({
        extraction: {
          patient: { age: 34, sex: "M" },
          symptoms: ["dolor de garganta", "fiebre leve"],
          onsetDays: 2,
          riskFlags: [],
          notes: "sin medicación previa",
        },
        language: "es-AR",
        correlationId: "abc-123",
      });

    if (res.status !== 200) {
      // Ayuda para depurar si algo falla
      // eslint-disable-next-line no-console
      console.error("Respuesta inesperada:", res.status, res.body);
    }

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.correlationId).toBe("abc-123");

    const data = res.body.data;
    expect(typeof data.summary).toBe("string");
    expect(Array.isArray(data.differentials)).toBe(true);
    expect(Array.isArray(data.recommendations)).toBe(true);
    expect(["low", "moderate", "high"]).toContain(data.severity);
    expect(data.summary.toLowerCase()).toContain("orientativa");
  });

  it("400 BAD_REQUEST con body inválido", async () => {
    const res = await request(app).post("/diagnose").send({ foo: "bar" });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBeFalsy();
    expect(res.body.error).toBe("BAD_REQUEST");
  });
});
