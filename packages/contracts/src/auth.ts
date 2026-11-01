import { isEmail } from "@aircastle/schema";
import { type } from "arktype";

/** Auth identities follow the schema package's email format, so stored content and sign-in agree. */
export const authEmail = type("string")
  .pipe((value) => value.trim())
  .narrow((email, context) => isEmail(email) || context.mustBe("a valid ASCII email address"))
  .pipe((email) => email.toLowerCase());

/** Postgres text cannot hold NUL, and drivers replace unpaired surrogates, so neither may reach storage. */
const authName = type("string")
  .pipe((value) => value.trim())
  .narrow((name, context) => {
    const length = Array.from(name).length;
    return (
      (length >= 1 && length <= 120 && !name.includes("\0") && !/\p{Cs}/u.test(name)) ||
      context.mustBe("1 through 120 Unicode code points without NUL or unpaired surrogates")
    );
  });

export const authSetupInput = type({ name: authName, email: authEmail }).onUndeclaredKey("reject");

export const authSignInInput = type({ email: authEmail }).onUndeclaredKey("reject");
