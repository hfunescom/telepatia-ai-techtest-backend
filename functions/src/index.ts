import { setGlobalOptions } from "firebase-functions";

export { transcribe } from "./transcribe/index.js";
export { extract } from "./extract/index.js";
export { diagnose } from "./diagnose/index.js";
export { pipeline }  from "./pipeline/index.js";

setGlobalOptions({ maxInstances: 10 });
