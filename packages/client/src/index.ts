import {
  contractId,
  describeCollections,
  parseContentError,
  validateStored,
} from "@aircastle/contracts";
import { compileSchema, SchemaError } from "@aircastle/schema";
import type {
  CollectionDefinitions,
  CollectionDescription,
  ContentDocument,
  DocumentData,
  Fetch,
  Result,
} from "@aircastle/contracts";
import type { InferInput, InferOutput } from "@aircastle/schema";

export interface AircastleConfig<Collections extends CollectionDefinitions> {
  url: string;
  project: string;
  collections: Collections;
}
export type AircastleClient<Collections extends CollectionDefinitions> = {
  [Name in keyof Collections]: {
    create(
      input: InferInput<Collections[Name]>,
    ): Promise<Result<{ id: string } & InferOutput<Collections[Name]>>>;
    findById(id: string): Promise<Result<{ id: string } & InferOutput<Collections[Name]>>>;
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

export function defineConfig<const Collections extends CollectionDefinitions>(config: {
  url: string | undefined;
  project: string | undefined;
  collections: Collections;
}): AircastleConfig<Collections> {
  let url: URL;
  try {
    if (typeof config.url !== "string" || config.url.length === 0) throw new Error();
    url = new URL(config.url);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.href.includes("?") ||
      url.href.includes("#")
    )
      throw new Error();
  } catch {
    throw new ConfigurationError(
      "url",
      "Use an HTTP(S) CMS URL without credentials, query or fragment.",
    );
  }
  if (typeof config.project !== "string" || !uuid.test(config.project)) {
    throw new ConfigurationError("project", "Use a valid project UUID.");
  }
  try {
    describeCollections(config.collections);
  } catch (error) {
    if (error instanceof SchemaError) throw error;
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

function record(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Reflect.ownKeys(value).every((key) => {
    const property = Object.getOwnPropertyDescriptor(value, key);
    return (
      typeof key === "string" && property?.enumerable === true && Object.hasOwn(property, "value")
    );
  });
}

function responseResult(
  description: CollectionDescription,
  response: unknown,
): Result<ContentDocument> | undefined {
  if (!record(response)) return undefined;
  if (response.ok === false) {
    if (Object.keys(response).some((key) => key !== "ok" && key !== "error")) return undefined;
    const error = parseContentError(response.error);
    return error ? { ok: false, error } : undefined;
  }
  if (
    response.ok !== true ||
    Object.keys(response).some((key) => key !== "ok" && key !== "data") ||
    !record(response.data)
  )
    return undefined;
  const document = response.data;
  if (typeof document.id !== "string" || !uuid.test(document.id)) return undefined;
  const fields = Object.fromEntries(Object.entries(document).filter(([key]) => key !== "id"));
  if (!validateStored(description, fields)) return undefined;
  return { ok: true, data: { id: document.id, ...(fields as DocumentData) } };
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

  async function send<Output extends object>(
    method: "GET" | "POST",
    endpoint: string,
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
    try {
      const response = await fetch(endpoint, init);
      const parsed = responseResult(description, await response.json());
      if (!parsed || response.ok !== parsed.ok) return failed;
      if (
        parsed.ok &&
        (response.status !== (method === "POST" ? 201 : 200) ||
          (expectedId !== undefined && parsed.data.id.toLowerCase() !== expectedId))
      )
        return failed;
      return parsed as Result<{ id: string } & Output>;
    } catch {
      return failed;
    }
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
        return send<InferOutput<Collections[typeof name]>>(
          "POST",
          endpoint,
          description,
          validated.data,
        );
      },
      async findById(id) {
        if (typeof id !== "string" || !uuid.test(id))
          return { ok: false, error: { code: "invalid_request" } };
        const normalized = id.toLowerCase();
        return send<InferOutput<Collections[typeof name]>>(
          "GET",
          `${endpoint}/${encodeURIComponent(normalized)}`,
          description,
          undefined,
          normalized,
        );
      },
    };
  }
  return client as AircastleClient<Collections>;
}

export function validateResponse(description: CollectionDescription, response: unknown): boolean {
  return responseResult(description, response) !== undefined;
}
