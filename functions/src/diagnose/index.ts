import * as functions from "firebase-functions";

export const diagnose = functions.https.onRequest(async (req, res) => {
  // TODO: implementar
  res.json({ step: "diagnose", status: "OK" });
});
