import { hc, type InferResponseType } from "hono/client";
import { expect, expectTypeOf, test } from "vite-plus/test";
import { health } from "./index.ts";

test("GET /health returns the typed liveness response without external services", async () => {
  const client = hc<typeof health>("http://localhost", { fetch: health.request });
  const response = await client.health.$get();

  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("application/json");
  expect(await response.json()).toEqual({ status: "ok" });
  expectTypeOf<InferResponseType<typeof client.health.$get, 200>>().toEqualTypeOf<{
    status: "ok";
  }>();
});
