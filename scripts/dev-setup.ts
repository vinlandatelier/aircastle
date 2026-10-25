import { postgresAdapter } from "@aircastle/adapter-postgres";
import { provisionDevelopment } from "@aircastle/core";

const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--new-key") || args.length > 1) {
  console.error("Usage: vp run dev:setup [--new-key]");
  process.exitCode = 1;
} else {
  let database: ReturnType<typeof postgresAdapter> | undefined;
  try {
    const url = new URL(
      process.env.AIRCASTLE_URL ?? `http://localhost:${process.env.PORT ?? "43122"}`,
    );
    if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.search || url.hash)
      throw new Error("Invalid AIRCASTLE_URL");
    database = postgresAdapter({
      url: process.env.DATABASE_URL ?? "",
      ...(process.env.AIRCASTLE_DATABASE_NAMESPACE === undefined
        ? {}
        : { namespace: process.env.AIRCASTLE_DATABASE_NAMESPACE }),
    });
    await database.initialize();
    const result = await provisionDevelopment(database, {
      key: args.includes("--new-key") ? "issue" : "reuse",
    });
    console.log(`AIRCASTLE_URL=${url.href.replace(/\/$/, "")}`);
    console.log(`AIRCASTLE_PROJECT_ID=${result.project}`);
    if (result.issued) console.log(`AIRCASTLE_API_KEY=${result.apiKey}`);
    else
      console.log(
        "The existing API key is not recoverable. Reuse your saved key or run vp run dev:setup --new-key.",
      );
  } catch {
    console.error(
      "Development setup failed. Check DATABASE_URL, AIRCASTLE_DATABASE_NAMESPACE and AIRCASTLE_URL.",
    );
    process.exitCode = 1;
  } finally {
    await database?.close();
  }
}
