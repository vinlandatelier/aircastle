import {
  compileDescription,
  contractId,
  describeCollections,
  parseContentError,
  storedDocument,
} from "@aircastle/contracts";
import { compileSchema, isPlainRecord } from "@aircastle/schema";
import type {
  CollectionDefinitions,
  CollectionDescription,
  Fetch,
  Result,
} from "@aircastle/contracts";
import type { CompiledCollection, InferInput, InferOutput } from "@aircastle/schema";

export interface AircastleConfig<Collections extends CollectionDefinitions> {
  url: string;
  project: string;
  collections: Collections;
}
export type AircastleClient<Collections extends CollectionDefinitions> = {
  [Name in keyof Collections]: {
    create: (
      input: InferInput<Collections[Name]>,
    ) => Promise<Result<{ id: string } & InferOutput<Collections[Name]>>>;
    findById: (id: string) => Promise<Result<{ id: string } & InferOutput<Collections[Name]>>>;
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
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  if (typeof config.project !== "string" || !uuid.test(config.project)) {
    throw new ConfigurationError("project", "Use a valid project UUID.");
  }
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
    project: config.project.toLowerCase(),
    collections: { ...config.collections },
  };
}

function responseResult<Output extends object>(
  collection: CompiledCollection<Output>,
  response: unknown,
): Result<{ id: string } & Output> | undefined {
  if (!isPlainRecord(response)) return undefined;
  if (response.ok === false) {
    if (Object.keys(response).some((key) => key !== "ok" && key !== "error")) return undefined;
    const error = parseContentError(response.error);
    return error ? { ok: false, error } : undefined;
  }
  if (
    response.ok !== true ||
    Object.keys(response).some((key) => key !== "ok" && key !== "data") ||
    !isPlainRecord(response.data)
  )
    return undefined;
  const document = response.data;
  if (typeof document.id !== "string" || !uuid.test(document.id)) return undefined;
  const fields = Object.fromEntries(Object.entries(document).filter(([key]) => key !== "id"));
  const data = storedDocument(collection, fields);
  return data === undefined ? undefined : { ok: true, data: { id: document.id, ...data } };
}

type ClientOptions<Collections extends CollectionDefinitions> = AircastleConfig<Collections> & {
  apiKey: string | undefined;
  fetch?: Fetch;
};

/** The returned object is built key by key from `config.collections`, so the declarations carry its collection names and output types. */
export function createClient<const Collections extends CollectionDefinitions>(
  options: ClientOptions<Collections>,
): AircastleClient<Collections>;
export function createClient<const Collections extends CollectionDefinitions>(
  options: ClientOptions<Collections>,
): Partial<AircastleClient<Collections>> {
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

  async function send<Output extends object>(
    method: "GET" | "POST",
    endpoint: string,
    collection: CompiledCollection<Output>,
    description: CollectionDescription,
    data?: object,
    expectedId?: string,
  ): Promise<Result<{ id: string } & Output>> {
    const failed: Result<{ id: string } & Output> = {
      ok: false,
      error: { code: method === "POST" ? "unknown_write_outcome" : "transport_error" },
    };
    const headers: Record<string, string> = {
      authorization,
      "aircastle-schema": await contractId(description),
    };
    const init: RequestInit = { method, headers, keepalive: false };
    if (data !== undefined) {
      headers["content-type"] = "application/json";
      init.body = JSON.stringify(data);
    }
    let response: Response;
    let body: unknown;
    try {
      response = await fetch(endpoint, init);
      body = await response.json();
    } catch {
      return failed;
    }
    const parsed = responseResult(collection, body);
    if (!parsed || response.ok !== parsed.ok) return failed;
    if (
      parsed.ok &&
      (response.status !== (method === "POST" ? 201 : 200) ||
        (expectedId !== undefined && parsed.data.id.toLowerCase() !== expectedId))
    )
      return failed;
    return parsed;
  }

  for (const name of Object.keys(config.collections) as (keyof Collections & string)[]) {
    const definition = compiled[name]!;
    const description = definition.describe();
    const endpoint = `${config.url}/api/projects/${encodeURIComponent(config.project)}/collections/${encodeURIComponent(name)}/documents`;
    client[name] = {
      async create(input) {
        const validated = definition.validate(input);
        if (!validated.ok)
          return { ok: false, error: { code: "validation_failed", issues: validated.issues } };
        return send("POST", endpoint, definition, description, validated.data);
      },
      async findById(id) {
        if (typeof id !== "string" || !uuid.test(id))
          return { ok: false, error: { code: "invalid_request" } };
        const normalized = id.toLowerCase();
        return send(
          "GET",
          `${endpoint}/${encodeURIComponent(normalized)}`,
          definition,
          description,
          undefined,
          normalized,
        );
      },
    };
  }
  return client;
}

export function validateResponse(description: CollectionDescription, response: unknown): boolean {
  return responseResult(compileDescription(description), response) !== undefined;
}
