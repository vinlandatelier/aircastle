import { createHash } from "node:crypto";
import { expect, test } from "vite-plus/test";
import { createService } from "@aircastle/core";
import { withDatabase } from "./test-support/database.ts";

const apiKey = "ac_existing_lookup_test_key";

test("existing treats ids that are not lowercase canonical UUIDs as missing and keeps the transaction usable", async () => {
  await withDatabase(async ({ store }) => {
    await store.initialize();
    const cms = createService(store, (error) => {
      throw new Error(`Unexpected report: ${error.name}`);
    });
    const { project } = await store.provision({
      verifier: createHash("sha256").update(apiKey).digest("hex"),
      permissions: ["content:read", "content:write", "schema:publish"],
      key: "issue",
      workspaceName: "Lookup workspace",
      projectName: "Lookup project",
    });
    const access = { project, apiKey };
    const published = await cms.publish(access, {
      baseline: null,
      collections: [
        {
          name: "authors",
          description: {
            fields: { name: { type: "text", required: true, nullable: false, unique: false } },
          },
        },
      ],
    });
    if (!published.ok) throw new Error(`Publish failed: ${published.error.code}`);
    const created = await cms.create(access, "authors", published.data.contracts.authors!, {
      name: "Writer",
    });
    if (!created.ok) throw new Error(`Create failed: ${created.error.code}`);
    const id = created.data.id;
    const results = await store.transaction(project, async (transaction) => [
      await transaction.existing("authors", ["a_123", "", id.toUpperCase(), `${id} `]),
      await transaction.existing("authors", ["a_123", id]),
    ]);
    expect(results.map((found) => [...found])).toEqual([[], [id]]);
  });
});
