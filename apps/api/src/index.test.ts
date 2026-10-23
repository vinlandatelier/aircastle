import { describe, expect, test } from "vite-plus/test";
import app from "./index.ts";

describe("api", () => {
  test("GET /health reports process liveness", async () => {
    const response = await app.fetch(new Request("http://localhost/health"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({ status: "ok" });
  });

  test("unknown routes return 404", async () => {
    const response = await app.fetch(new Request("http://localhost/missing"));

    expect(response.status).toBe(404);
  });
});
