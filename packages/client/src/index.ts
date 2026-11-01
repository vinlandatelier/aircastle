import { contractId, describeCollections } from "@aircastle/contracts";
import { compileSchema } from "@aircastle/schema";
import type {
  CollectionDefinitions,
  CollectionDescription,
  DocumentPage,
  Fetch,
  Result,
} from "@aircastle/contracts";
import type { InferInput, InferOutput } from "@aircastle/schema";
import {
  deletedDocument,
  documentPage,
  envelope,
  listRequest,
  normalizedUuid,
  storedDocument,
  updateRequest,
} from "./wire.ts";

export interface AircastleConfig<Collections extends CollectionDefinitions> {
  url: string;
  project: string;
  collections: Collections;
}
type Definition = CollectionDefinitions[string];
type FieldName<Collection extends Definition> = keyof InferInput<Collection> & string;
type OmittableField<Collection extends Definition> = {
  [Name in FieldName<Collection>]-?: object extends Pick<InferInput<Collection>, Name>
    ? Name
    : never;
}[FieldName<Collection>];
type FilterValue<Collection extends Definition, Name extends FieldName<Collection>> = Exclude<
  InferInput<Collection>[Name],
  null | undefined
>;
/** A document as `findById`, `update` and `list` return it. */
export type StoredDocument<Collection extends Definition> = {
  id: string;
} & InferOutput<Collection>;
/** Fields to replace. A property whose value is `undefined` changes nothing. */
export type DocumentChanges<Collection extends Definition> = {
  [Name in FieldName<Collection>]?: InferInput<Collection>[Name] | undefined;
};
/** `unset` names fields to remove; only fields that may be omitted on input are accepted. */
export interface UpdateOptions<Collection extends Definition> {
  unset?: readonly OmittableField<Collection>[];
}
/** Operators on one field. Several operators combine with AND; a bare value means `is`. */
export interface FieldOperators<Value extends string> {
  is?: Value;
  not?: Value;
  in?: readonly Value[];
  empty?: boolean;
  contains?: string;
}
/** Conditions keyed by field name. All conditions combine with AND. */
export type DocumentWhere<Collection extends Definition> = {
  [Name in FieldName<Collection>]?:
    | FilterValue<Collection, Name>
    | FieldOperators<FilterValue<Collection, Name>>;
};
/** `sort` names a field, ascending, or descending with a `-` prefix. */
export interface ListQuery<Collection extends Definition> {
  where?: DocumentWhere<Collection>;
  sort?: FieldName<Collection> | `-${FieldName<Collection>}`;
  limit?: number;
  cursor?: string;
}
export type AircastleClient<Collections extends CollectionDefinitions> = {
  [Name in keyof Collections]: {
    create: (
      input: InferInput<Collections[Name]>,
    ) => Promise<Result<StoredDocument<Collections[Name]>>>;
    findById: (id: string) => Promise<Result<StoredDocument<Collections[Name]>>>;
    update: (
      id: string,
      changes: DocumentChanges<Collections[Name]>,
      options?: UpdateOptions<Collections[Name]>,
    ) => Promise<Result<StoredDocument<Collections[Name]>>>;
    delete: (id: string) => Promise<Result<{ id: string }>>;
    list: (
      query?: ListQuery<Collections[Name]>,
    ) => Promise<Result<DocumentPage<StoredDocument<Collections[Name]>>>>;
  };
};
export class ConfigurationError extends Error {
  constructor(
    readonly setting: string,
    message: string,
  ) {
    super(message);
    this.name = "ConfigurationError";
  }
}
function invalidRequest(): { ok: false; error: { code: "invalid_request" } } {
  return { ok: false, error: { code: "invalid_request" } };
}

function parsedUrl(value: string | undefined): URL | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  try {
    return new URL(value);
  } catch (error) {
    if (error instanceof TypeError) return undefined;
    throw error;
  }
}

export function defineConfig<const Collections extends CollectionDefinitions>(config: {
  url: string | undefined;
  project: string | undefined;
  collections: Collections;
}): AircastleConfig<Collections> {
  const url = parsedUrl(config.url);
  if (
    url === undefined ||
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.href.includes("?") ||
    url.href.includes("#")
  )
    throw new ConfigurationError(
      "url",
      "Use an HTTP(S) CMS URL without credentials, query or fragment.",
    );
  const project = normalizedUuid(config.project);
  if (project === undefined) throw new ConfigurationError("project", "Use a valid project UUID.");
  try {
    describeCollections(config.collections);
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    throw new ConfigurationError(
      "collections",
      "Collection and field names must be valid and unreserved.",
    );
  }
  return {
    url: url.href.replace(/\/+$/, ""),
    project,
    collections: { ...config.collections },
  };
}

export function createClient<const Collections extends CollectionDefinitions>(
  options: AircastleConfig<Collections> & {
    apiKey: string | undefined;
    fetch?: Fetch;
  },
): AircastleClient<Collections> {
  const config = defineConfig(options);
  if (
    typeof options.apiKey !== "string" ||
    options.apiKey.length === 0 ||
    /[\r\n]/.test(options.apiKey)
  ) {
    throw new ConfigurationError("apiKey", "Provide a project API key in the server environment.");
  }
  const authorization = `Bearer ${options.apiKey}`;
  const fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  const compiled = compileSchema(config.collections);
  const client: Partial<AircastleClient<Collections>> = Object.create(null);

  async function send<Data>(
    description: CollectionDescription,
    request: {
      method: "GET" | "POST" | "PATCH" | "DELETE";
      url: string;
      write: boolean;
      status: 200 | 201;
      body?: object;
    },
    parse: (data: unknown) => Data | undefined,
  ): Promise<Result<Data>> {
    const failed: Result<Data> = {
      ok: false,
      error: { code: request.write ? "unknown_write_outcome" : "transport_error" },
    };
    const headers: Record<string, string> = {
      authorization,
      "aircastle-schema": await contractId(description),
    };
    const init: RequestInit = { method: request.method, headers, keepalive: false };
    if (request.body !== undefined) {
      headers["content-type"] = "application/json";
      init.body = JSON.stringify(request.body);
    }
    let response: Response;
    let body: unknown;
    try {
      response = await fetch(request.url, init);
      body = await response.json();
    } catch {
      return failed;
    }
    const parsed = envelope(body, parse);
    if (!parsed || response.ok !== parsed.ok || (parsed.ok && response.status !== request.status))
      return failed;
    return parsed;
  }

  for (const name of Object.keys(config.collections) as (keyof Collections & string)[]) {
    type Stored = StoredDocument<Collections[typeof name]>;
    const definition = compiled[name]!;
    const description = definition.describe();
    const endpoint = `${config.url}/api/projects/${encodeURIComponent(config.project)}/collections/${encodeURIComponent(name)}/documents`;
    const documentUrl = (id: string) => `${endpoint}/${encodeURIComponent(id)}`;
    const parseStored = (expectedId?: string) => (data: unknown) => {
      const parsed = storedDocument(description, data);
      if (!parsed || (expectedId !== undefined && normalizedUuid(parsed.id) !== expectedId))
        return undefined;
      return parsed as Stored;
    };
    client[name] = {
      async create(input) {
        const validated = definition.validate(input);
        if (!validated.ok)
          return { ok: false, error: { code: "validation_failed", issues: validated.issues } };
        return send(
          description,
          { method: "POST", url: endpoint, write: true, status: 201, body: validated.data },
          parseStored(),
        );
      },
      async findById(id) {
        const normalized = normalizedUuid(id);
        if (normalized === undefined) return invalidRequest();
        return send(
          description,
          { method: "GET", url: documentUrl(normalized), write: false, status: 200 },
          parseStored(normalized),
        );
      },
      async update(id, changes, options) {
        const normalized = normalizedUuid(id);
        const body = updateRequest(changes, options);
        if (normalized === undefined || !body) return invalidRequest();
        const validated = definition.validate(body.changes);
        const issues = validated.ok
          ? []
          : validated.issues.filter(
              (issue) => issue.path.length === 0 || Object.hasOwn(body.changes, issue.path[0]!),
            );
        if (issues[0])
          return {
            ok: false,
            error: { code: "validation_failed", issues: [issues[0], ...issues.slice(1)] },
          };
        return send(
          description,
          { method: "PATCH", url: documentUrl(normalized), write: true, status: 200, body },
          parseStored(normalized),
        );
      },
      async delete(id) {
        const normalized = normalizedUuid(id);
        if (normalized === undefined) return invalidRequest();
        return send(
          description,
          { method: "DELETE", url: documentUrl(normalized), write: true, status: 200 },
          (data) => {
            const deleted = deletedDocument(data);
            return normalizedUuid(deleted?.id) === normalized ? deleted : undefined;
          },
        );
      },
      async list(query) {
        const body = listRequest(query);
        if (!body) return invalidRequest();
        return send(
          description,
          { method: "POST", url: `${endpoint}/query`, write: false, status: 200, body },
          (data) => documentPage(description, data) as DocumentPage<Stored> | undefined,
        );
      },
    };
  }
  return client as AircastleClient<Collections>;
}

export function validateResponse(description: CollectionDescription, response: unknown): boolean {
  return envelope(response, (data) => storedDocument(description, data)) !== undefined;
}
