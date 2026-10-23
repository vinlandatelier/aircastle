import { type } from "arktype";
import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";

const responseSchema = type({ status: "'ok'" });

export const health = new Hono().get(
  "/health",
  describeRoute({
    operationId: "getHealth",
    tags: ["Health"],
    summary: "Check process liveness",
    responses: {
      200: {
        description: "Process is running",
        content: { "application/json": { schema: resolver(responseSchema) } },
      },
    },
  }),
  (c) => c.json({ status: "ok" } satisfies typeof responseSchema.infer, 200),
);
