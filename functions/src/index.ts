import { setGlobalOptions } from "firebase-functions";

export { transcribeRaw } from "./transcribeRaw";
export { transcribe } from "./transcribe";
export { extract } from "./extract";
export { diagnose } from "./diagnose";

setGlobalOptions({ maxInstances: 10 });
