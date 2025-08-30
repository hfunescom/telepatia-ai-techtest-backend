import { setGlobalOptions } from "firebase-functions";
import { onRequest } from "firebase-functions/https";
import * as logger from "firebase-functions/logger";

export { transcribe } from "./transcribe";
export { extract } from "./extract";
export { diagnose } from "./diagnose";

setGlobalOptions({ maxInstances: 10 });
