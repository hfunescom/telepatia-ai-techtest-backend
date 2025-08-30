import * as functions from "firebase-functions";

export const transcribe = functions.https.onRequest(async (req, res) => {
  // TODO: implementar
  res.json({ step: "transcribe", status: "OK" });
});
