# Aircastle

A standalone headless CMS with code-defined collections.

The repository currently contains a TypeScript/Bun scaffold and schema type contracts. Runtime collection builders, schema compilation, and document validation will be developed through tests.

## Development

Use Bun 1.3.4, pinned in `.bun-version` and `package.json`.

```sh
bun install --frozen-lockfile
bun run typecheck
bun run build
```

`build` emits type declarations into `dist/`. It does not build a running CMS. `bun run test` is configured for the upcoming behavior suite; no tests exist yet.

## Schema module

The agreed caller interface is:

```ts
const articles = collection({
  title: text().min(3).max(200),
  status: text().oneOf(["draft", "published"]).default("draft"),
});

const schema = compileSchema({ articles });
const result = schema.articles.validate(input);
const description = schema.articles.describe();
```

The functions in this example are planned runtime exports, not implemented exports. The current type-only entry point is `src/index.ts`; result, issue, description, and compiled-collection contracts live together in `src/schema/contract.ts`.

Compilation rejects invalid collection definitions with an aggregated `SchemaError`. Document validation accepts unknown input and returns `{ ok: true, data }` or `{ ok: false, issues }`. Descriptions expose serializable field rules and editor metadata. The module owns no HTTP routing or persistence.

Type inference for collection builders and runtime behavior must be verified through the public interface before implementation. ArkType is the selected internal runtime-validation library; its behavior does not replace Aircastle's contract.
