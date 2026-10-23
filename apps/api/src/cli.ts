import { createRequire } from "node:module";
import { resolve } from "node:path";

const load = createRequire(resolve("package.json"));
const { createApp }: typeof import("./app.ts") = load("./src/app.ts");
const pino: typeof import("pino").default = load("pino");

export default createApp({ logger: pino({ level: "silent" }) });
