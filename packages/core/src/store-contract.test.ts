import { contentStoreContract } from "./test-support/store-contract.ts";
import { access, controlledStore } from "./test-support/fixtures.ts";

contentStoreContract("the core fake store", async (use) => {
  const { store } = controlledStore({ state: { revision: null, collections: [] }, contracts: {} });
  await use({ store, project: access.project });
});
