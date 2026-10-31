import { betterAuth } from "better-auth";
import type { BetterAuthOptions, BetterAuthPlugin } from "better-auth";

export function localAuthLibrary(options: {
  origin: string;
  secret: string;
  database?: BetterAuthOptions["database"];
  plugin?: BetterAuthPlugin;
}) {
  return betterAuth({
    appName: "Aircastle",
    baseURL: options.origin,
    basePath: "/api/auth",
    secret: options.secret,
    trustedOrigins: [options.origin],
    database: options.database,
    plugins: options.plugin ? [options.plugin] : [],
    emailAndPassword: { enabled: false },
    rateLimit: { enabled: false },
    logger: { disabled: true },
    session: {
      expiresIn: 14 * 86400,
      disableSessionRefresh: true,
      cookieCache: { enabled: false },
    },
    advanced: {
      useSecureCookies: false,
      database: { joins: false },
      crossSubDomainCookies: { enabled: false },
    },
  });
}
