import type postgres from "postgres";

const quoted = (part: string) => '"' + part.replaceAll('"', '""') + '"';

/**
 * Builds a dot-joined identifier fragment for tagged queries. Each part stays one literal
 * identifier, so a namespace such as `one.two` is not split the way `sql(name)` splits it.
 * This is the adapter's only raw SQL outside `test-support/database.ts`, which quotes fixture
 * names the same way. Values belong in tagged-template parameters.
 */
export const identifier = (sql: Pick<postgres.Sql, "unsafe">, ...parts: [string, ...string[]]) =>
  sql.unsafe(parts.map(quoted).join("."));
