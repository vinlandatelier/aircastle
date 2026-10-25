import { createHash } from "node:crypto";
import { contentStoreContract } from "@aircastle/core/testing";
import { withDatabase } from "./test-support/database.ts";

contentStoreContract("the Postgres adapter", (use) =>
  withDatabase(async ({ store }) => {
    await store.initialize();
    const { project } = await store.provision({
      verifier: createHash("sha256").update("ac_store_contract_secret").digest("hex"),
      permissions: ["content:read"],
      key: "reuse",
      workspaceName: "Contract workspace",
      projectName: "Contract project",
    });
    await use({ store, project });
  }),
);
