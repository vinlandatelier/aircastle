import type {
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
export function createService(_store: ContentStore): ContentService {
  const unavailable = async () => ({ ok: false as const, error: { code: "unavailable" as const } });
  return {
    authorize: unavailable,
    schema: unavailable,
    publish: unavailable,
    create: unavailable,
    findById: unavailable,
  };
}
export async function createAircastle(_config: {
  database: ContentStore;
}): Promise<AircastleRuntime> {
  return { ...createService(_config.database), close: async () => {} };
}
export async function provisionDevelopment(
  _store: ContentStore,
  _options: { newKey?: boolean } = {},
): Promise<ProvisionedProject & { apiKey?: string }> {
  throw new Error("Not implemented");
}
