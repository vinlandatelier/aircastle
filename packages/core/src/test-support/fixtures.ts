import type {
  CollectionDescription,
  ContentDocument,
  Permission,
  ProjectState,
  PublishedCollection,
  Result,
} from "@aircastle/contracts";
import type { Access, ContentStore, ProjectTransaction } from "../index.ts";
import { expect } from "vite-plus/test";

export const project = "11111111-1111-4111-8111-111111111111";
export const workspace = "22222222-2222-4222-8222-222222222222";
export const documentId = "33333333-3333-4333-8333-333333333333";
export const otherProject = "44444444-4444-4444-8444-444444444444";
export const contract = `v1:${"1".repeat(64)}`;
export const access: Access = { project, apiKey: "ac_test_secret_never_store_raw" };
export const permissions: readonly Permission[] = [
  "content:read",
  "content:write",
  "schema:publish",
];

export const articles: CollectionDescription = {
  fields: {
    title: { type: "text", required: true, nullable: false, unique: false, min: 1 },
    slug: { type: "text", required: true, nullable: false, unique: true },
    summary: { type: "text", required: false, nullable: true, unique: false },
    status: {
      type: "text",
      required: false,
      nullable: false,
      unique: false,
      choices: ["draft", "published"],
      default: "draft",
    },
  },
};
export const collections: PublishedCollection[] = [{ name: "articles", description: articles }];

export function successful<Value>(result: Result<Value>): Value {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`Expected success, received ${result.error.code}`);
  return result.data;
}

export function deferred<Value>() {
  let release: (value: Value) => void = () => {};
  const promise = new Promise<Value>((resolve) => {
    release = resolve;
  });
  return { promise, resolve: (value: Value) => release(value) };
}

export function controlledStore(
  options: {
    state?: ProjectState;
    documents?: ContentDocument[];
    contracts?: Readonly<Record<string, CollectionDescription>>;
    authorization?:
      | "authorized"
      | "unauthorized"
      | "forbidden"
      | ((permission: Permission) => "authorized" | "unauthorized" | "forbidden");
    initialize?: () => Promise<void>;
    beforeTransaction?: () => Promise<void>;
  } = {},
) {
  let state = structuredClone(options.state ?? { revision: "revision-start", collections });
  const documents = structuredClone(options.documents ?? []);
  const contracts = new Map(Object.entries(options.contracts ?? { [contract]: articles }));
  const observations = {
    initialized: 0,
    closed: 0,
    transactions: 0,
    authorization: [] as { project: string; verifier: string; permission: Permission }[],
  };
  const transaction: ProjectTransaction = {
    state: async () => structuredClone(state),
    contract: async (id) => {
      const value = contracts.get(id);
      return value === undefined ? undefined : structuredClone(value);
    },
    documents: async () => structuredClone(documents),
    activate: async (next, publication) => {
      state = { revision: publication.revision, collections: structuredClone(next) };
      for (const entry of next) {
        const id = publication.contracts[entry.name];
        if (id !== undefined) contracts.set(id, structuredClone(entry.description));
      }
    },
    insert: async (_collection, data) => {
      const saved = { ...structuredClone(data), id: documentId };
      documents.push(saved);
      return { ok: true, data: structuredClone(saved) };
    },
    read: async (_collection, id) => structuredClone(documents.find((entry) => entry.id === id)),
  };
  const store: ContentStore = {
    initialize: async () => {
      observations.initialized++;
      await options.initialize?.();
    },
    provision: async () => ({ workspace, project, issued: true }),
    authorize: async (target, verifier, permission) => {
      observations.authorization.push({ project: target, verifier, permission });
      return typeof options.authorization === "function"
        ? options.authorization(permission)
        : (options.authorization ?? "authorized");
    },
    transaction: async (_project, operation) => {
      observations.transactions++;
      await options.beforeTransaction?.();
      const originalState = structuredClone(state);
      const originalDocuments = structuredClone(documents);
      const originalContracts = new Map(contracts);
      try {
        return await operation(transaction);
      } catch (error) {
        state = originalState;
        documents.splice(0, documents.length, ...originalDocuments);
        contracts.clear();
        for (const [id, description] of originalContracts) contracts.set(id, description);
        throw error;
      }
    },
    close: async () => {
      observations.closed++;
    },
  };
  return {
    store,
    observations,
    snapshot: () => structuredClone(state),
    snapshotDocuments: () => structuredClone(documents),
  };
}
