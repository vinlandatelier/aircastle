import { describeCollections } from "@aircastle/contracts";
import { SchemaError } from "@aircastle/schema";
import type {
  CollectionDefinitions,
  CollectionDescription,
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

export function createClient<const Collections extends CollectionDefinitions>(
  _options: AircastleConfig<Collections> & {
    apiKey: string | undefined;
    fetch?: Fetch;
  },
): AircastleClient<Collections> {
  const config = defineConfig(_options);
  if (
    typeof _options.apiKey !== "string" ||
    _options.apiKey.length === 0 ||
    /[\r\n]/.test(_options.apiKey)
  ) {
    throw new ConfigurationError("apiKey", "Provide a project API key in the server environment.");
  }
  const unavailable = async () => ({ ok: false as const, error: { code: "unavailable" as const } });
  const client: Partial<AircastleClient<Collections>> = {};
  for (const name in config.collections) {
    client[name] = { create: unavailable, findById: unavailable };
  }
  return client as AircastleClient<Collections>;
}
export function validateResponse(_description: CollectionDescription, _response: unknown): boolean {
  return false;
}
