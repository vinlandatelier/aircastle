import { expect, test } from "vite-plus/test";
import { AuthStorageError } from "./index.ts";

test.each(["57P01", "40001", "CONNECTION_CLOSED", "ECONNREFUSED"])(
  "a storage failure keeps the driver code %s for diagnostics",
  (code) => {
    expect(new AuthStorageError("unavailable", { code }).code).toBe(code);
  },
);

test.each([
  "password authentication failed for user secret",
  "relation auth_users does not exist",
  "",
  "x".repeat(65),
])("a storage failure drops a code that could carry a message: %j", (code) => {
  expect(new AuthStorageError("unavailable", { code }).code).toBeUndefined();
});

test("a storage failure keeps its cause for the error summary", () => {
  const cause = new Error("driver detail");
  expect(new AuthStorageError("commit-unknown", { cause }).cause).toBe(cause);
});
