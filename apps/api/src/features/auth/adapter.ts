import { AuthStorageError } from "@aircastle/core";
import type {
  AuthStore,
  AuthTransaction,
  AuthUserRecord,
  AuthSessionRecord,
} from "@aircastle/core";
import type { BetterAuthOptions, DBAdapter, DBTransactionAdapter } from "better-auth";
import { createAdapterFactory } from "better-auth/adapters";
import type { CustomAdapter } from "better-auth/adapters";
import { type } from "arktype";

const libraryUser = type({
  id: "string",
  name: "string",
  email: "string",
  emailVerified: "boolean",
  "image?": "string | null",
  createdAt: "Date",
  updatedAt: "Date",
});
const librarySession = type({
  id: "string",
  userId: "string",
  token: "string",
  expiresAt: "Date",
  createdAt: "Date",
  updatedAt: "Date",
  "ipAddress?": "string | null",
  "userAgent?": "string | null",
});

function unavailable(): never {
  throw new AuthStorageError("unavailable");
}

export function libraryUserRecord(user: AuthUserRecord) {
  return { ...user, createdAt: new Date(user.createdAt), updatedAt: new Date(user.updatedAt) };
}

export function librarySessionRecord(session: AuthSessionRecord) {
  return {
    ...session,
    createdAt: new Date(session.createdAt),
    updatedAt: new Date(session.updatedAt),
    expiresAt: new Date(session.expiresAt),
  };
}

export function createLibraryAdapter(storage: AuthStore) {
  const bindings = new WeakMap<object, AuthTransaction>();
  function database(options: BetterAuthOptions, transaction?: AuthTransaction): DBAdapter {
    const adapter = createAdapterFactory({
      config: {
        adapterId: "aircastle-auth",
        supportsDates: true,
        supportsBooleans: true,
        supportsJSON: false,
        transaction: transaction
          ? false
          : (operation) =>
              storage.transaction(async (transaction) => {
                const bound = database(options, transaction);
                bindings.set(bound, transaction);
                try {
                  return await operation(bound);
                } finally {
                  bindings.delete(bound);
                }
              }),
      },
      adapter: () =>
        ({
          create: async ({ model, data, select }) => {
            if (!transaction || select?.length) return unavailable();
            if (model === "user") {
              const user = libraryUser(data);
              if (user instanceof type.errors) return unavailable();
              const saved = await transaction.insertUser({
                ...user,
                image: user.image ?? null,
                createdAt: user.createdAt.getTime(),
                updatedAt: user.updatedAt.getTime(),
              });
              return { ...data, ...libraryUserRecord(saved) };
            }
            if (model === "session") {
              const session = librarySession(data);
              if (session instanceof type.errors) return unavailable();
              const saved = await transaction.insertSession({
                ...session,
                ipAddress: session.ipAddress ?? null,
                userAgent: session.userAgent ?? null,
                createdAt: session.createdAt.getTime(),
                updatedAt: session.updatedAt.getTime(),
                expiresAt: session.expiresAt.getTime(),
              });
              return { ...data, ...librarySessionRecord(saved) };
            }
            return unavailable();
          },
          findOne: unavailable,
          findMany: unavailable,
          count: unavailable,
          update: unavailable,
          updateMany: unavailable,
          delete: unavailable,
          deleteMany: unavailable,
          consumeOne: unavailable,
          incrementOne: unavailable,
        }) satisfies CustomAdapter,
    })(options);
    return adapter;
  }
  return {
    database: (options: BetterAuthOptions) => database(options),
    transaction: (adapter: DBTransactionAdapter) => bindings.get(adapter) ?? unavailable(),
  };
}
