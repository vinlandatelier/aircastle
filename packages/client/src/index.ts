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
export function defineConfig<const Collections extends CollectionDefinitions>(_config: {
  url: string | undefined;
  project: string | undefined;
  collections: Collections;
}): AircastleConfig<Collections> {
  throw new Error("Not implemented");
}
export function createClient<const Collections extends CollectionDefinitions>(
  _options: AircastleConfig<Collections> & {
    apiKey: string | undefined;
    fetch?: Fetch;
  },
): AircastleClient<Collections> {
  const unavailable = async () => ({ ok: false as const, error: { code: "unavailable" as const } });
  const client: Partial<AircastleClient<Collections>> = {};
  for (const name in _options.collections) {
    client[name] = { create: unavailable, findById: unavailable };
  }
  return client as AircastleClient<Collections>;
}
export function validateResponse(_description: CollectionDescription, _response: unknown): boolean {
  return false;
}
