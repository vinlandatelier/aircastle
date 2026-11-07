import { createInterface } from "node:readline";
import { postgresAuthAdmission } from "../index.ts";

const url = process.env.AIRCASTLE_DATABASE_URL;
const namespace = process.env.AIRCASTLE_AUTH_TEST_NAMESPACE;
if (!url || !namespace) throw new Error("Auth admission worker requires its isolated database");

const admission = await postgresAuthAdmission({
  url,
  namespace,
  clock: () => Date.UTC(2026, 0, 1),
  limits: {
    email: { fiveMinutes: 5, oneHour: 20 },
    ip: { fiveMinutes: 10, oneHour: 30 },
    global: { fiveMinutes: 30, oneHour: 100 },
  },
});
process.stdout.write("ready\n");
for await (const command of createInterface({ input: process.stdin })) {
  if (command !== "admit") throw new Error("Unsupported test worker command");
  const result = await admission.admit({ source: "127.0.0.1", email: "alex@example.test" });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
await admission.close();
