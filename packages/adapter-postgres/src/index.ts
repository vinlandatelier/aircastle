import type { ContentStore } from "@aircastle/core";

export interface PostgresOptions {
  url: string;
  namespace?: string;
}
export function postgresAdapter(_options: PostgresOptions): ContentStore {
  throw new Error("Not implemented");
}
