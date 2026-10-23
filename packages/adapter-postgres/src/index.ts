import type { ContentStore } from "@aircastle/core";

export interface PostgresOptions {
  url: string;
  namespace?: string;
}
export function postgresAdapter(_options: PostgresOptions): ContentStore {
  return {
    initialize: async () => {},
    close: async () => {},
    authorize: async () => "unauthorized",
    provision: async () => {
      throw new Error("Not implemented");
    },
    transaction: async () => {
      throw new Error("Not implemented");
    },
  };
}
