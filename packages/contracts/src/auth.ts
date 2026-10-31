import { type } from "arktype";

export const authEmail = type("string")
  .pipe((value) => value.trim())
  .narrow((email, context) => {
    const parts = email.split("@");
    const local = parts[0];
    const domain = parts[1];
    if (
      email.length > 254 ||
      parts.length !== 2 ||
      !local ||
      local.length > 64 ||
      !/^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+$/.test(local) ||
      local.startsWith(".") ||
      local.endsWith(".") ||
      local.includes("..") ||
      !domain
    )
      return context.mustBe("a valid ASCII email address");
    const labels = domain.split(".");
    return (
      (labels.length >= 2 &&
        labels.every((label) => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label))) ||
      context.mustBe("a valid ASCII email address")
    );
  })
  .pipe((email) => email.toLowerCase());

const authName = type("string")
  .pipe((value) => value.trim())
  .narrow((name, context) => {
    const length = Array.from(name).length;
    return (length >= 1 && length <= 120) || context.mustBe("1 through 120 Unicode code points");
  });

export const authSetupInput = type({ name: authName, email: authEmail }).onUndeclaredKey("reject");

export const authSignInInput = type({ email: authEmail }).onUndeclaredKey("reject");
