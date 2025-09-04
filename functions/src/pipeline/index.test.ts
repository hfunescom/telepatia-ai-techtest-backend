import request from "supertest";

const transcribeServiceMock = jest.fn();
const extractServiceMock = jest.fn();
const diagnoseServiceMock = jest.fn();

jest.mock("../transcribe/service.js", () => ({
  transcribeService: transcribeServiceMock,
}));
jest.mock("../extract/service.js", () => ({
  extractService: extractServiceMock,
}));
jest.mock("../diagnose/service.js", () => ({
  diagnoseService: diagnoseServiceMock,
}));

jest.mock("firebase-functions/v2/https", () => ({
  onRequest: (_opts: any, handler: any) => handler,
}));

describe("pipeline", () => {
  beforeEach(() => {
    jest.resetModules();
    transcribeServiceMock.mockReset();
    extractServiceMock.mockReset();
    diagnoseServiceMock.mockReset();
  });

  test("text input -> extract and diagnose", async () => {
    const extracted = {
      patient: { age: 30, sex: "M" },
      symptoms: ["dolor"],
      riskFlags: [],
      onsetDays: 1,
      notes: "",
    };
    const diagnosis = {
      summary: "ok",
      differentials: [],
      recommendations: [],
      severity: "low" as const,
    };
    extractServiceMock.mockResolvedValueOnce(extracted);
    diagnoseServiceMock.mockResolvedValueOnce(diagnosis);

    // Import after mocks
    const { pipeline } = require("./index");

    const res = await request(pipeline)
      .post("/")
      .send({ input: { text: "Paciente", language: "es-AR", correlationId: "corr-1" } });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.correlationId).toBe("corr-1");
    expect(res.body.transcript).toBe("Paciente");
    expect(res.body.extracted).toEqual(extracted);
    expect(res.body.diagnosis).toEqual(diagnosis);

    expect(transcribeServiceMock).not.toHaveBeenCalled();
    expect(extractServiceMock).toHaveBeenCalledWith({
      transcript: "Paciente",
      language: "es-AR",
      correlationId: "corr-1",
    });
    expect(diagnoseServiceMock).toHaveBeenCalledWith({
      extraction: {
        patient: extracted.patient,
        symptoms: extracted.symptoms,
        riskFlags: extracted.riskFlags,
        onsetDays: extracted.onsetDays,
        notes: extracted.notes,
      },
      language: "es-AR",
      correlationId: "corr-1",
    });
  });

  test("invalid body -> 400", async () => {
    const { pipeline } = require("./index");
    const res = await request(pipeline).post("/").send({ foo: "bar" });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.step).toBe("validation");
  });
});
