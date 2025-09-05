import request from "supertest";

const transcribeServiceMock = jest.fn();
const extractServiceMock = jest.fn();
const diagnoseServiceMock = jest.fn();

jest.mock("../transcribe/service", () => ({
  transcribeService: transcribeServiceMock,
}));
jest.mock("../extract/service", () => ({
  extractService: extractServiceMock,
}));
jest.mock("../diagnose/service", () => ({
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

  test("text input -> extract and diagnose sin datos de paciente", async () => {
    const extracted = {
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

    const { pipeline } = require("./index");

    const res = await request(pipeline)
      .post("/")
      .send({ input: { text: "Paciente", language: "es-AR", correlationId: "corr-2" } });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.correlationId).toBe("corr-2");
    expect(res.body.transcript).toBe("Paciente");
    expect(res.body.extracted).toEqual(extracted);
    expect(res.body.diagnosis).toEqual(diagnosis);

    expect(transcribeServiceMock).not.toHaveBeenCalled();
    expect(extractServiceMock).toHaveBeenCalledWith({
      transcript: "Paciente",
      language: "es-AR",
      correlationId: "corr-2",
    });
    expect(diagnoseServiceMock).toHaveBeenCalledWith({
      extraction: {
        patient: undefined,
        symptoms: extracted.symptoms,
        riskFlags: extracted.riskFlags,
        onsetDays: extracted.onsetDays,
        notes: extracted.notes,
      },
      language: "es-AR",
      correlationId: "corr-2",
    });
  });

  test("text input en-US -> extract and diagnose", async () => {
    const extracted = {
      patient: { age: 40, sex: "F" },
      symptoms: ["cough"],
      riskFlags: [],
      onsetDays: 2,
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

    const { pipeline } = require("./index");

    const res = await request(pipeline)
      .post("/")
      .send({ input: { text: "Patient", language: "en-US", correlationId: "corr-en" } });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.correlationId).toBe("corr-en");
    expect(res.body.transcript).toBe("Patient");
    expect(res.body.extracted).toEqual(extracted);
    expect(res.body.diagnosis).toEqual(diagnosis);

    expect(transcribeServiceMock).not.toHaveBeenCalled();
    expect(extractServiceMock).toHaveBeenCalledWith({
      transcript: "Patient",
      language: "en-US",
      correlationId: "corr-en",
    });
    expect(diagnoseServiceMock).toHaveBeenCalledWith({
      extraction: {
        patient: extracted.patient,
        symptoms: extracted.symptoms,
        riskFlags: extracted.riskFlags,
        onsetDays: extracted.onsetDays,
        notes: extracted.notes,
      },
      language: "en-US",
      correlationId: "corr-en",
    });
  });

  test("unsupported language -> 400", async () => {
    const { pipeline } = require("./index");
    const res = await request(pipeline)
      .post("/")
      .send({ input: { text: "Paciente", language: "fr-FR", correlationId: "corr-3" } });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toBe("unsupported language");
    expect(extractServiceMock).not.toHaveBeenCalled();
    expect(diagnoseServiceMock).not.toHaveBeenCalled();
  });

  test("invalid body -> 400", async () => {
    const { pipeline } = require("./index");
    const res = await request(pipeline).post("/").send({ foo: "bar" });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.step).toBe("validation");
  });
});
