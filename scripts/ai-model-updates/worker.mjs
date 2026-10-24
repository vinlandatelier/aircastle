import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";

const request = JSON.parse(readFileSync(0, "utf8"));
const context = createContext(Object.create(null), {
  codeGeneration: { strings: false, wasm: false },
});
runInContext(`globalThis.operation = (${request.source})`, context, { timeout: 250 });
const outputs = [];
for (const input of request.inputs) {
  context.input = JSON.stringify(input);
  const output = runInContext("JSON.stringify(operation(JSON.parse(input)))", context, {
    timeout: 250,
  });
  if (typeof output !== "string" || output.length > 8192) process.exit(1);
  outputs.push(JSON.parse(output));
}
process.stdout.write(JSON.stringify(outputs));
