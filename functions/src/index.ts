import { setGlobalOptions } from "firebase-functions";

export { transcribe } from "./transcribe";
export { extract } from "./extract";
export { diagnose } from "./diagnose";

setGlobalOptions({ maxInstances: 10 });
