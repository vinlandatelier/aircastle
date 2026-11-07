import { randomUUID } from "node:crypto";
import type {
  CollectionDescription,
  ContentDocument,
  Permission,
  ProjectState,
  PublishedCollection,
  Result,
} from "@aircastle/contracts";
import type {
  Access,
  ContentStore,
  ErrorSummary,
  FieldFilter,
  ListPosition,
  PageRequest,
  ProjectTransaction,
  SortValue,
} from "../index.ts";
import { expect } from "vite-plus/test";

const project = "11111111-1111-4111-8111-111111111111";
const workspace = "22222222-2222-4222-8222-222222222222";
export const documentId = "33333333-3333-4333-8333-333333333333";
export const otherProject = "44444444-4444-4444-8444-444444444444";
export const contract = `v1:${"1".repeat(64)}`;
export const access: Access = { project, apiKey: "ac_test_secret_never_store_raw" };

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

const collator = new Intl.Collator("und");

function compareSortValues(left: SortValue, right: SortValue): number {
  if (left.kind === "empty" || right.kind === "empty")
    return Number(left.kind === "empty") - Number(right.kind === "empty");
  return (
    collator.compare(left.value, right.value) ||
    Buffer.compare(Buffer.from(left.value), Buffer.from(right.value))
  );
}

function sortValue(document: ContentDocument, field: string): SortValue {
  const value = document[field];
  return typeof value === "string" ? { kind: "value", value } : { kind: "empty" };
}

function filterMatches(document: ContentDocument, filter: FieldFilter): boolean {
  const value = document[filter.field];
  const present = typeof value === "string";
  switch (filter.operator) {
    case "is":
      return present && value === filter.value;
    case "not":
      return !(present && value === filter.value);
    case "in":
      return present && filter.values.includes(value);
    case "empty":
      return filter.empty !== present;
    case "contains":
      return present && value.toLowerCase().includes(filter.text.toLowerCase());
  }
}

/**
 * Orders positions as the requested list does: a negative result means `left` comes first. Field
 * orders compare sort values, with empty values last in both directions; ties go newest first.
 */
function comparePositions(
  order: PageRequest["order"],
  left: ListPosition,
  right: ListPosition,
): number {
  const newestFirst = Number(right.created - left.created);
  if (order.by === "created" || left.order !== "field" || right.order !== "field")
    return Math.sign(newestFirst);
  const byValue = compareSortValues(left.value, right.value);
  const bothValues = left.value.kind === "value" && right.value.kind === "value";
  const directed = bothValues && order.direction === "descending" ? -byValue : byValue;
  return directed || Math.sign(newestFirst);
}

export function controlledStore(
  options: {
    state?: ProjectState;
    documents?: Readonly<Record<string, ContentDocument[]>>;
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
  let documents = new Map(Object.entries(structuredClone(options.documents ?? {})));
  let inserted = 0;
  const creation = new Map<string, Map<string, bigint>>();
  let created = 0n;
  const creationOrder = (collection: string, document: ContentDocument): bigint => {
    const orders = creation.get(collection) ?? new Map<string, bigint>();
    creation.set(collection, orders);
    for (const entry of active(collection))
      if (!orders.has(entry.id)) orders.set(entry.id, created++);
    const order = orders.get(document.id);
    if (order === undefined) throw new Error("Unknown document");
    return order;
  };
  const active = (collection: string) => {
    if (!state.collections.some((entry) => entry.name === collection))
      throw new Error("Unknown collection");
    return documents.get(collection) ?? [];
  };
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
    documents: async (collection) => structuredClone(active(collection)),
    activate: async (next, publication) => {
      state = { revision: publication.revision, collections: structuredClone(next) };
      for (const entry of next) {
        const id = publication.contracts[entry.name];
        if (id !== undefined) contracts.set(id, structuredClone(entry.description));
      }
    },
    insert: async (collection, data, uniqueFields) => {
      const existing = active(collection);
      const conflict = uniqueFields.find(
        (field) =>
          typeof data[field] === "string" &&
          existing.some((document) => document[field] === data[field]),
      );
      if (conflict !== undefined)
        return { ok: false, error: { code: "unique_conflict", field: conflict } };
      const saved = { ...structuredClone(data), id: inserted++ === 0 ? documentId : randomUUID() };
      documents.set(collection, [...existing, saved]);
      return { ok: true, data: structuredClone(saved) };
    },
    read: async (collection, id) =>
      structuredClone(active(collection).find((entry) => entry.id === id)),
    replace: async (collection, id, data, uniqueFields) => {
      const existing = active(collection);
      const index = existing.findIndex((entry) => entry.id === id);
      if (index === -1) throw new Error("Unknown document");
      const conflict = uniqueFields.find(
        (field) =>
          typeof data[field] === "string" &&
          existing.some((document) => document.id !== id && document[field] === data[field]),
      );
      if (conflict !== undefined)
        return { ok: false, error: { code: "unique_conflict", field: conflict } };
      const saved = { ...structuredClone(data), id };
      documents.set(
        collection,
        existing.map((entry, position) => (position === index ? saved : entry)),
      );
      return { ok: true, data: structuredClone(saved) };
    },
    remove: async (collection, id) => {
      const existing = active(collection);
      const remaining = existing.filter((entry) => entry.id !== id);
      documents.set(collection, remaining);
      return remaining.length < existing.length;
    },
    page: async (collection, { filters, order, limit }) => {
      const position = (document: ContentDocument): ListPosition =>
        order.by === "created"
          ? { order: "created", created: creationOrder(collection, document) }
          : {
              order: "field",
              value: sortValue(document, order.field),
              created: creationOrder(collection, document),
            };
      const matching = active(collection)
        .filter((document) => filters.every((filter) => filterMatches(document, filter)))
        .map((document) => ({ document: structuredClone(document), position: position(document) }))
        .filter(
          (entry) =>
            order.after === undefined || comparePositions(order, order.after, entry.position) < 0,
        )
        .sort((left, right) => comparePositions(order, left.position, right.position));
      return { entries: matching.slice(0, limit), more: matching.length > limit };
    },
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
      const originalInserted = inserted;
      const originalContracts = new Map(contracts);
      try {
        return await operation(transaction);
      } catch (error) {
        state = originalState;
        documents = originalDocuments;
        inserted = originalInserted;
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
    snapshotDocuments: (collection: string) => structuredClone(documents.get(collection) ?? []),
  };
}

/** Fails the operation, and so the test, when an unexpected error is reported. */
export const failOnReport = (summary: ErrorSummary) => {
  throw summary;
};
