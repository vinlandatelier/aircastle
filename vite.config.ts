import { defineConfig } from "vite-plus";

const rawSql = {
  property: "unsafe",
  message:
    "Write SQL with tagged templates. Quote identifiers with identifier() from identifier.ts.",
};
const processRunner =
  "Run browser servers through webServer in apps/web/playwright.config.ts and checks through package scripts, not hand-built runners.";
const processRunnerProperties = ["Bun", "getBuiltinModule"].map((property) => ({
  property,
  message: processRunner,
}));
const bunEnv = {
  object: "Bun",
  property: "env",
  message: "Read environment variables in the entry point's config module.",
};

export default defineConfig({
  resolve: { conditions: ["development"] },
  test: {
    include: ["tests/**/*.test.ts", "scripts/dev-setup.test.ts", "scripts/ai-*/**/*.test.ts"],
    environment: "node",
    maxWorkers: 2,
  },
  defaultPackage: {
    build: "./apps/web",
    preview: "./apps/web",
    pack: "./packages/schema",
  },
  staged: {
    "*": "vp check --fix",
  },
  fmt: {
    ignorePatterns: ["**/*.md", ".agents/skills/**", ".claude/skills/**"],
    overrides: [
      {
        files: ["apps/web/**"],
        options: {
          singleQuote: true,
          semi: false,
        },
      },
    ],
  },
  lint: {
    jsPlugins: [
      {
        name: "vite-plus",
        specifier: "vite-plus/oxlint-plugin",
      },
    ],
    plugins: ["typescript", "unicorn", "oxc", "import"],
    categories: {
      correctness: "error",
    },
    rules: {
      "vite-plus/prefer-vite-plus-imports": "error",
      "import/no-cycle": "error",
      "no-case-declarations": "error",
      "no-empty": "error",
      "no-fallthrough": "error",
      "no-prototype-builtins": "error",
      "no-redeclare": "error",
      "no-regex-spaces": "error",
      "no-unexpected-multiline": "error",
      "no-useless-assignment": "error",
      "preserve-caught-error": "error",
      "no-array-constructor": "error",
      "typescript/ban-ts-comment": "error",
      "typescript/method-signature-style": "error",
      "typescript/no-empty-object-type": "error",
      "typescript/no-explicit-any": "error",
      "typescript/no-namespace": "error",
      "typescript/no-require-imports": "error",
      "typescript/no-unnecessary-type-constraint": "error",
      "typescript/no-unsafe-function-type": "error",
      "typescript/only-throw-error": [
        "error",
        { allow: [{ from: "package", package: "@tanstack/router-core", name: "Redirect" }] },
      ],
      "typescript/switch-exhaustiveness-check": "error",
      "no-restricted-properties": ["error", rawSql],
    },
    ignorePatterns: [
      ".agents/skills/**",
      ".claude/skills/**",
      "**/dist/**",
      "packages/schema/tests/types/inference.ts",
      "packages/schema/tests/types/negative/**",
      "packages/client/tests/types/**",
    ],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    overrides: [
      {
        files: ["apps/web/**"],
        rules: {
          "no-restricted-imports": [
            "error",
            {
              paths: [
                ...["bun"].map((name) => ({
                  name,
                  importNames: ["$", "spawn", "spawnSync"],
                  message: processRunner,
                })),
                ...["module", "node:module"].map((name) => ({
                  name,
                  importNames: ["createRequire"],
                  message: processRunner,
                })),
                ...["vite", "vite-plus"].map((name) => ({
                  name,
                  importNames: ["build", "createServer", "preview"],
                  message: processRunner,
                })),
              ],
              patterns: [
                {
                  regex:
                    "^(node:)?(child_process|cluster|worker_threads)$|^(execa|zx|cross-spawn|tinyexec|nano-spawn)(/|$)",
                  message: processRunner,
                },
              ],
            },
          ],
          "no-restricted-properties": ["error", rawSql, ...processRunnerProperties],
          "no-restricted-globals": ["error", { name: "Bun", message: processRunner }],
          "import/no-dynamic-require": ["error", { esmodule: true }],
        },
      },
      {
        files: ["apps/web/e2e/**"],
        rules: {
          "no-restricted-properties": [
            "error",
            rawSql,
            ...processRunnerProperties,
            ...["skip", "fixme"].map((property) => ({
              property,
              message: "A skipped journey passes without running. Fix or delete it.",
            })),
          ],
        },
      },
      {
        files: ["apps/*/src/**", "packages/*/src/**"],
        excludeFiles: ["**/*.test.{ts,tsx}", "**/test-support/**"],
        plugins: ["node"],
        rules: {
          "node/no-process-env": "error",
          "no-restricted-properties": ["error", bunEnv, rawSql],
          "no-restricted-imports": [
            "error",
            {
              paths: ["node:process", "process"].map((name) => ({
                name,
                importNames: ["env"],
                message: "Read environment variables in the entry point's config module.",
              })),
            },
          ],
        },
      },
      {
        files: ["apps/api/src/config.ts"],
        plugins: ["node"],
        rules: {
          "node/no-process-env": "off",
          "no-restricted-properties": ["error", rawSql],
          "no-restricted-imports": "off",
        },
      },
      {
        files: ["packages/adapter-postgres/src/identifier.ts"],
        rules: { "no-restricted-properties": ["error", bunEnv] },
      },
      {
        files: ["packages/adapter-postgres/src/test-support/database.ts"],
        rules: { "no-restricted-properties": "off" },
      },
      {
        files: ["packages/cli/src/index.ts"],
        plugins: ["node"],
        rules: { "node/no-process-env": ["error", { allowedVariables: ["AIRCASTLE_API_KEY"] }] },
      },
      {
        files: ["packages/schema/tests/types/assert.ts"],
        rules: { "typescript/no-explicit-any": "off" },
      },
      {
        files: ["apps/web/**/*.{ts,tsx}"],
        rules: {
          "no-undef": "error",
          "react/rules-of-hooks": "error",
          "react/exhaustive-deps": "error",
          "react/static-components": "error",
          "react/use-memo": "error",
          "react/preserve-manual-memoization": "error",
          "react/incompatible-library": "error",
          "react/immutability": "error",
          "react/globals": "error",
          "react/refs": "error",
          "react/set-state-in-effect": "error",
          "react/error-boundaries": "error",
          "react/purity": "error",
          "react/set-state-in-render": "error",
          "react/unsupported-syntax": "error",
          "react/only-export-components": [
            "error",
            {
              allowConstantExport: true,
              allowCompoundComponents: true,
            },
          ],
        },
        plugins: ["typescript", "react"],
        env: {
          browser: true,
        },
      },
      {
        files: ["packages/core/src/**"],
        excludeFiles: ["**/*.test.{ts,tsx}", "**/test-support/**"],
        rules: {
          "no-restricted-imports": [
            "error",
            {
              paths: ["node:process", "process"].map((name) => ({
                name,
                importNames: ["env"],
                message: "Read environment variables in the entry point's config module.",
              })),
              patterns: [
                {
                  regex:
                    "^(better-auth|@better-auth|hono|postgres|@aircastle/adapter-postgres)(/|$)",
                  message:
                    "Core defines operations and storage contracts; it cannot import HTTP, auth libraries or database drivers.",
                },
              ],
            },
          ],
        },
      },
      {
        files: [
          "apps/web/src/**",
          "packages/contracts/src/**",
          "packages/schema/src/**",
          "packages/client/src/**",
        ],
        excludeFiles: ["**/*.test.{ts,tsx}", "**/test-support/**"],
        plugins: ["import"],
        rules: {
          "import/no-nodejs-modules": "error",
          "no-restricted-imports": [
            "error",
            {
              patterns: [
                {
                  regex: "^(bun|postgres|pino|better-auth|@better-auth|hono)(:|/|$)",
                  message:
                    "Browser-safe code cannot import server runtimes, drivers or server libraries.",
                },
                {
                  group: [
                    "@aircastle/**",
                    "!@aircastle/contracts",
                    "!@aircastle/schema",
                    "!@aircastle/client",
                  ],
                  message:
                    "Browser-safe code can import only the entry points of @aircastle/contracts, schema and client.",
                },
              ],
            },
          ],
        },
      },
    ],
  },
});
