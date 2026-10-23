import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  compatibleForCreate,
  compileDescription,
  contractId,
  parseCollections,
  projectDocument,
  sameSchema,
  validateStored,
} from "@aircastle/contracts";
import type {
  ContentError,
  CollectionDescription,
  ContentDocument,
  DocumentData,
  Permission,
  ProjectState,
  Publication,
  PublishedCollection,
  Result,
} from "@aircastle/contracts";

export interface ProjectTransaction {
  state(): Promise<ProjectState>;
  contract(id: string): Promise<CollectionDescription | undefined>;
  documents(collection: string): Promise<ContentDocument[]>;
  activate(collections: readonly PublishedCollection[], publication: Publication): Promise<void>;
  insert(
    collection: string,
    data: DocumentData,
    uniqueFields: readonly string[],
  ): Promise<Result<ContentDocument>>;
  read(collection: string, id: string): Promise<ContentDocument | undefined>;
}
export interface ProvisionedProject {
  workspace: string;
  project: string;
  issued: boolean;
}
export interface ContentStore {
  initialize(): Promise<void>;
  provision(options: {
    verifier: string;
    permissions: readonly Permission[];
    newKey: boolean;
    workspaceName?: string;
    projectName?: string;
  }): Promise<ProvisionedProject>;
  authorize(
    project: string,
    verifier: string,
    permission: Permission,
  ): Promise<"authorized" | "unauthorized" | "forbidden">;
  transaction<Value>(
    project: string,
    operation: (transaction: ProjectTransaction) => Promise<Value>,
  ): Promise<Value>;
  close(): Promise<void>;
}
export interface Access {
  project: string;
  apiKey: string;
}
export interface ContentService {
  authorize(access: Access, permission: Permission): Promise<Result<null>>;
  schema(access: Access): Promise<Result<ProjectState>>;
  publish(
    access: Access,
    request: { baseline: string | null; collections: unknown },
  ): Promise<Result<Publication>>;
  create(
    access: Access,
    collection: string,
    contract: string,
    input: unknown,
  ): Promise<Result<ContentDocument>>;
  findById(
    access: Access,
    collection: string,
    contract: string,
    id: string,
  ): Promise<Result<ContentDocument>>;
}
export interface AircastleRuntime extends ContentService {
  close(): Promise<void>;
}
type SimpleCode = Exclude<ContentError["code"], "validation_failed" | "unique_conflict">;
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

async function attempt<Value>(operation: () => Promise<Result<Value>>): Promise<Result<Value>> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof RejectedOperation) return { ok: false, error: error.failure };
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "unavailable"
    )
      return failure("unavailable");
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

export function createService(store: ContentStore): ContentService {
  const authorize = (access: Access, permission: Permission): Promise<Result<null>> =>
    attempt(async () => {
      if (!access.apiKey) return failure("unauthorized");
      const decision = await store.authorize(access.project, verifier(access.apiKey), permission);
      return decision === "authorized" ? { ok: true, data: null } : failure(decision);
    });
  const permitted = <Value>(
    access: Access,
    permission: Permission,
    operation: () => Promise<Result<Value>>,
  ): Promise<Result<Value>> =>
    attempt(async () => {
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
            const unique = new Map(
              Object.entries(next.fields)
                .filter(([, field]) => field.unique)
                .map(([name]) => [name, new Set<string>()]),
            );
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
          const uniqueFields = Object.entries(collection.description.fields)
            .filter(([, field]) => field.unique)
            .map(([name]) => name);
          const inserted = await transaction.insert(collectionName, validated.data, uniqueFields);
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
          if (!validateStored(collection.description, storedData(document)))
            return failure("internal_error");
          return projectDocument(client, collection.description, document);
        });
      }),
  };
}

export async function createAircastle(config: {
  database: ContentStore;
}): Promise<AircastleRuntime> {
  try {
    await config.database.initialize();
  } catch (error) {
    const [cleanup] = await Promise.allSettled([config.database.close()]);
    if (cleanup?.status === "rejected")
      throw new AggregateError([error, cleanup.reason], "Aircastle startup and cleanup failed");
    throw error;
  }
  const service = createService(config.database);
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
  options: { newKey?: boolean } = {},
): Promise<ProvisionedProject & { apiKey?: string }> {
  const apiKey = "ac_" + randomBytes(32).toString("base64url");
  const project = await store.provision({
    verifier: verifier(apiKey),
    permissions: ["content:read", "content:write", "schema:publish"],
    newKey: options.newKey ?? false,
  });
  return project.issued ? { ...project, apiKey } : project;
}
