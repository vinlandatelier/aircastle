import { expect, test } from "vite-plus/test";
import * as schema from "../../src/index.ts";

test("invalid compilation throws an instance of the public SchemaError constructor", () => {
  expect(typeof schema.SchemaError).toBe("function");

  let thrown: unknown;
  try {
    schema.compileSchema({
      articles: schema.collection({ title: schema.text().min(2).max(1) }),
    });
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(schema.SchemaError);
});
