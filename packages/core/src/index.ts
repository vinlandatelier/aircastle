import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  compatibleForCreate,
  compileDescription,
  contractId,
  parseCollections,
  projectDocument,
  sameSchema,
  uniqueFields,
  validateStored,
} from "@aircastle/contracts";
import type {
  ContentError,
  CollectionDescription,
  ContentDocument,
  DocumentData,
  DocumentListQuery,
  DocumentPage,
  DocumentUpdate,
  Permission,
  ProjectState,
  Publication,
  PublishedCollection,
  Result,
} from "@aircastle/contracts";
import { ErrorSummary } from "./error-summary.ts";
import { encodeCursor, listPlan, listSyntax, type PageRequest, type StoredPage } from "./list.ts";

export { ErrorSummary };
export type {
  CreatedPosition,
  FieldFilter,
  FieldPosition,
  ListOrder,
  ListPosition,
  PageEntry,
  PageRequest,
  SortValue,
  StoredPage,
} from "./list.ts";

export interface ProjectTransaction {
  state: () => Promise<ProjectState>;
  contract: (id: string) => Promise<CollectionDescription | undefined>;
  documents: (collection: string) => Promise<ContentDocument[]>;
  activate: (
    collections: readonly PublishedCollection[],
    publication: Publication,
  ) => Promise<void>;
  insert: (
    collection: string,
    data: DocumentData,
    uniqueFields: readonly string[],
  ) => Promise<Result<ContentDocument>>;
  read: (collection: string, id: string) => Promise<ContentDocument | undefined>;
  /**
   * Replaces the stored data of an existing document, keeping its id and creation order. Releases
   * the document's old unique values and claims the new string values of `uniqueFields`; a value
   * held by another document returns `unique_conflict` and changes nothing.
   */
  replace: (
    collection: string,
    id: string,
    data: DocumentData,
    uniqueFields: readonly string[],
  ) => Promise<Result<ContentDocument>>;
  /** Deletes a document and its unique values. Returns `false` when no such document existed. */
  remove: (collection: string, id: string) => Promise<boolean>;
  page: (collection: string, request: PageRequest) => Promise<StoredPage>;
}
export interface ProvisionedProject {
  workspace: string;
  project: string;
  issued: boolean;
}
/**
 * How {@link ContentStore.provision} treats keys: `reuse` issues the key only when the project has
 * none, and `issue` always adds it alongside the existing keys.
 */
export type KeyMode = "reuse" | "issue";
/** A provisioned development project, with the API key when this call issued one. */
export type DevelopmentProject =
  | { workspace: string; project: string; issued: true; apiKey: string }
  | { workspace: string; project: string; issued: false };
/**
 * Thrown by a {@link ContentStore} when storage is temporarily unreachable and the operation can be
 * retried. Core turns it into an `unavailable` result instead of an `internal_error`.
 */
export class StorageUnavailable extends Error {
  constructor(options?: ErrorOptions) {
    super("Storage is temporarily unavailable", options);
    this.name = "StorageUnavailable";
  }
}
/** Persistence for projects and content. Throws {@link StorageUnavailable} for retryable outages. */
export interface ContentStore {
  initialize: () => Promise<void>;
  provision: (options: {
    verifier: string;
    permissions: readonly Permission[];
    key: KeyMode;
    workspaceName: string;
    projectName: string;
  }) => Promise<ProvisionedProject>;
  authorize: (
    project: string,
    verifier: string,
    permission: Permission,
  ) => Promise<"authorized" | "unauthorized" | "forbidden">;
  transaction: <Value>(
    project: string,
    operation: (transaction: ProjectTransaction) => Promise<Value>,
  ) => Promise<Value>;
  close: () => Promise<void>;
}
export interface Access {
  project: string;
  apiKey: string;
}
export interface ContentService {
  authorize: (access: Access, permission: Permission) => Promise<Result<null>>;
  schema: (access: Access) => Promise<Result<ProjectState>>;
  publish: (
    access: Access,
    request: { baseline: string | null; collections: unknown },
  ) => Promise<Result<Publication>>;
  create: (
    access: Access,
    collection: string,
    contract: string,
    input: unknown,
  ) => Promise<Result<ContentDocument>>;
  findById: (
    access: Access,
    collection: string,
    contract: string,
    id: string,
  ) => Promise<Result<ContentDocument>>;
  update: (
    access: Access,
    collection: string,
    contract: string,
    id: string,
    request: DocumentUpdate,
  ) => Promise<Result<ContentDocument>>;
  delete: (
    access: Access,
    collection: string,
    contract: string,
    id: string,
  ) => Promise<Result<{ id: string }>>;
  list: (
    access: Access,
    collection: string,
    contract: string,
    query: DocumentListQuery,
  ) => Promise<Result<DocumentPage>>;
}
export interface AircastleRuntime extends ContentService {
  close: () => Promise<void>;
}
/** Receives a summary of each unexpected error after it becomes an `internal_error` result. */
export type ReportError = (error: ErrorSummary) => void;
type SimpleCode = Exclude<
  ContentError["code"],
  "validation_failed" | "unique_conflict" | "referenced"
>;
const failure = (code: SimpleCode): { ok: false; error: { code: SimpleCode } } => ({
  ok: false,
  error: { code },
});
const verifier = (secret: string) => createHash("sha256").update(secret).digest("hex");
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

class RejectedOperation extends Error {
  constructor(readonly failure: ContentError) {
    super(failure.code);
  }
}

class CorruptDocument extends Error {}

async function attempt<Value>(
  report: ReportError,
  operation: () => Promise<Result<Value>>,
): Promise<Result<Value>> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof RejectedOperation) return { ok: false, error: error.failure };
    if (error instanceof StorageUnavailable) return failure("unavailable");
    report(ErrorSummary.of(error));
    return failure("internal_error");
  }
}

function storedData(document: ContentDocument): DocumentData {
  return Object.fromEntries(Object.entries(document).filter(([name]) => name !== "id"));
}

async function publicationFor(
  collections: readonly PublishedCollection[],
  revision: string,
): Promise<Publication> {
  const entries = await Promise.all(
    collections.map(
      async (collection) => [collection.name, await contractId(collection.description)] as const,
    ),
  );
  return { revision, contracts: Object.fromEntries(entries) };
}

export function createService(store: ContentStore, report: ReportError): ContentService {
  const authorize = (access: Access, permission: Permission): Promise<Result<null>> =>
    attempt(report, async () => {
      if (!access.apiKey) return failure("unauthorized");
      const decision = await store.authorize(access.project, verifier(access.apiKey), permission);
      return decision === "authorized" ? { ok: true, data: null } : failure(decision);
    });
  const permitted = <Value>(
    access: Access,
    permission: Permission,
    operation: () => Promise<Result<Value>>,
  ): Promise<Result<Value>> =>
    attempt(report, async () => {
      const decision = await authorize(access, permission);
      return decision.ok ? operation() : decision;
    });
  return {
    authorize,
    schema: (access) =>
      permitted(access, "schema:publish", () =>
        store.transaction(access.project, async (transaction) => ({
          ok: true,
          data: await transaction.state(),
        })),
      ),
    publish: (access, request) =>
      permitted(access, "schema:publish", async () => {
        const parsed = parseCollections(request.collections);
        if (!parsed.ok) return parsed;
        const proposed = parsed.data;
        return store.transaction(access.project, async (transaction) => {
          const active = await transaction.state();
          if (active.revision !== null && sameSchema(active.collections, proposed))
            return { ok: true, data: await publicationFor(proposed, active.revision) };
          if (request.baseline !== active.revision) return failure("schema_conflict");
          const proposedByName = new Map(
            proposed.map((collection) => [collection.name, collection.description]),
          );
          for (const collection of active.collections) {
            const next = proposedByName.get(collection.name);
            if (
              !next ||
              Object.keys(collection.description.fields).some(
                (field) => !Object.hasOwn(next.fields, field),
              )
            )
              return failure("migration_required");
            const documents = await transaction.documents(collection.name);
            const unique = new Map(uniqueFields(next).map((name) => [name, new Set<string>()]));
            for (const document of documents) {
              if (!validateStored(next, storedData(document))) return failure("migration_required");
              for (const [field, values] of unique) {
                const value = document[field];
                if (typeof value !== "string") continue;
                if (values.has(value)) return failure("migration_required");
                values.add(value);
              }
            }
          }
          const publication = await publicationFor(proposed, randomUUID());
          await transaction.activate(proposed, publication);
          return { ok: true, data: publication };
        });
      }),
    create: (access, collectionName, requestedContract, input) =>
      permitted(access, "content:write", () =>
        store.transaction(access.project, async (transaction) => {
          const state = await transaction.state();
          const collection = state.collections.find(
            (candidate) => candidate.name === collectionName,
          );
          if (!collection) return failure("not_found");
          const client = await transaction.contract(requestedContract);
          if (!client || !compatibleForCreate(client, collection.description))
            return failure("schema_mismatch");
          const validated = compileDescription(collection.description).validate(input);
          if (!validated.ok)
            return { ok: false, error: { code: "validation_failed", issues: validated.issues } };
          const projected = projectDocument(client, collection.description, {
            ...validated.data,
            id: randomUUID(),
          });
          if (!projected.ok) return projected;
          const inserted = await transaction.insert(
            collectionName,
            validated.data,
            uniqueFields(collection.description),
          );
          if (!inserted.ok) return inserted;
          const result = projectDocument(client, collection.description, inserted.data);
          if (!result.ok) throw new RejectedOperation(result.error);
          return result;
        }),
      ),
    findById: (access, collectionName, requestedContract, id) =>
      permitted(access, "content:read", async () => {
        if (!uuid.test(id)) return failure("invalid_request");
        return store.transaction(access.project, async (transaction) => {
          const state = await transaction.state();
          const collection = state.collections.find(
            (candidate) => candidate.name === collectionName,
          );
          if (!collection) return failure("not_found");
          const client = await transaction.contract(requestedContract);
          if (!client) return failure("schema_mismatch");
          const document = await transaction.read(collectionName, id);
          if (!document) return failure("not_found");
          if (!validateStored(collection.description, storedData(document))) {
            report(ErrorSummary.of(new CorruptDocument()));
            return failure("internal_error");
          }
          return projectDocument(client, collection.description, document);
        });
      }),
    update: (access, collectionName, requestedContract, id, request) =>
      permitted(access, "content:write", async () => {
        const { changes, unset } = request;
        if (changes === null || typeof changes !== "object" || Array.isArray(changes))
          return failure("invalid_request");
        if (unset.some((name) => Object.hasOwn(changes, name))) return failure("invalid_request");
        if (!uuid.test(id)) return failure("invalid_request");
        return store.transaction(access.project, async (transaction) => {
          const state = await transaction.state();
          const collection = state.collections.find(
            (candidate) => candidate.name === collectionName,
          );
          if (!collection) return failure("not_found");
          const client = await transaction.contract(requestedContract);
          if (!client || !compatibleForCreate(client, collection.description))
            return failure("schema_mismatch");
          const stored = await transaction.read(collectionName, id.toLowerCase());
          if (!stored) return failure("not_found");
          const current = storedData(stored);
          if (!validateStored(collection.description, current)) {
            report(ErrorSummary.of(new CorruptDocument()));
            return failure("internal_error");
          }
          if (Object.keys(changes).length === 0 && unset.length === 0)
            return projectDocument(client, collection.description, stored);
          const declared = (name: string) => Object.hasOwn(collection.description.fields, name);
          const kept = Object.entries(current).filter(([name]) => !unset.includes(name));
          const unknownUnset = unset.filter((name) => !declared(name)).map((name) => [name, null]);
          const validated = compileDescription(collection.description).validate({
            ...Object.fromEntries([...kept, ...unknownUnset]),
            ...changes,
          });
          if (!validated.ok)
            return { ok: false, error: { code: "validation_failed", issues: validated.issues } };
          const replaced = await transaction.replace(
            collectionName,
            stored.id,
            validated.data,
            uniqueFields(collection.description),
          );
          if (!replaced.ok) return replaced;
          const result = projectDocument(client, collection.description, replaced.data);
          if (!result.ok) throw new RejectedOperation(result.error);
          return result;
        });
      }),
    delete: (access, collectionName, requestedContract, id) =>
      permitted(access, "content:write", async () => {
        if (!uuid.test(id)) return failure("invalid_request");
        return store.transaction(access.project, async (transaction) => {
          const state = await transaction.state();
          const collection = state.collections.find(
            (candidate) => candidate.name === collectionName,
          );
          if (!collection) return failure("not_found");
          if (!(await transaction.contract(requestedContract))) return failure("schema_mismatch");
          const target = id.toLowerCase();
          if (!(await transaction.remove(collectionName, target))) return failure("not_found");
          return { ok: true, data: { id: target } };
        });
      }),
    list: (access, collectionName, requestedContract, query) =>
      permitted(access, "content:read", async () => {
        const syntax = listSyntax(query);
        if (!syntax) return failure("invalid_request");
        return store.transaction(access.project, async (transaction) => {
          const state = await transaction.state();
          const collection = state.collections.find(
            (candidate) => candidate.name === collectionName,
          );
          if (!collection) return failure("not_found");
          const client = await transaction.contract(requestedContract);
          if (!client) return failure("schema_mismatch");
          const plan = listPlan(
            syntax,
            { project: access.project, collection: collectionName },
            client,
            collection.description,
          );
          if (!plan.ok) return plan;
          const stored = await transaction.page(collectionName, plan.data.request);
          if (
            stored.entries.some(
              (entry) => !validateStored(collection.description, storedData(entry.document)),
            )
          ) {
            report(ErrorSummary.of(new CorruptDocument()));
            return failure("internal_error");
          }
          const documents: ContentDocument[] = [];
          for (const entry of stored.entries) {
            const projected = projectDocument(client, collection.description, entry.document);
            if (!projected.ok) return projected;
            documents.push(projected.data);
          }
          const last = stored.entries.at(-1);
          const next = stored.more && last ? encodeCursor(plan.data.digest, last.position) : null;
          return { ok: true, data: { documents, next } };
        });
      }),
  };
}

export async function createAircastle(config: {
  database: ContentStore;
  report: ReportError;
}): Promise<AircastleRuntime> {
  try {
    await config.database.initialize();
  } catch (error) {
    const [cleanup] = await Promise.allSettled([config.database.close()]);
    if (cleanup?.status === "rejected")
      throw new AggregateError([error, cleanup.reason], "Aircastle startup and cleanup failed", {
        cause: error,
      });
    throw error;
  }
  const service = createService(config.database, config.report);
  let state: "running" | "closing" | "closed" = "running";
  let closing: Promise<void> | undefined;
  const pending = new Set<Promise<unknown>>();
  const tracked =
    <Args extends readonly unknown[], Value>(
      operation: (...args: Args) => Promise<Result<Value>>,
    ) =>
    (...args: Args): Promise<Result<Value>> => {
      if (state !== "running") return Promise.resolve(failure("unavailable"));
      const result = operation(...args);
      pending.add(result);
      void result.then(
        () => pending.delete(result),
        () => pending.delete(result),
      );
      return result;
    };
  return {
    authorize: tracked(service.authorize),
    schema: tracked(service.schema),
    publish: tracked(service.publish),
    create: tracked(service.create),
    findById: tracked(service.findById),
    update: tracked(service.update),
    delete: tracked(service.delete),
    list: tracked(service.list),
    close: () => {
      if (closing) return closing;
      state = "closing";
      closing = (async () => {
        await Promise.allSettled(pending);
        try {
          await config.database.close();
        } finally {
          state = "closed";
        }
      })();
      return closing;
    },
  };
}

export async function provisionDevelopment(
  store: ContentStore,
  options: { key?: KeyMode } = {},
): Promise<DevelopmentProject> {
  const apiKey = "ac_" + randomBytes(32).toString("base64url");
  const { workspace, project, issued } = await store.provision({
    verifier: verifier(apiKey),
    permissions: ["content:read", "content:write", "schema:publish"],
    key: options.key ?? "reuse",
    workspaceName: "Development workspace",
    projectName: "Development project",
  });
  return issued
    ? { workspace, project, issued: true, apiKey }
    : { workspace, project, issued: false };
}
