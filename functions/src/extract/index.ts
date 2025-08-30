import * as functions from "firebase-functions";

export const extract = functions.https.onRequest(async (req, res) => {
  // TODO: implementar
  res.json({ step: "extract", status: "OK" });
});
