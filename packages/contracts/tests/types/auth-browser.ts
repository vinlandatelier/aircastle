import { authEmail, authSetupInput, authSignInInput } from "@aircastle/contracts";
import { type } from "arktype";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

export type Email = Expect<Equal<typeof authEmail.infer, string>>;
export type Setup = Expect<Equal<typeof authSetupInput.infer, { name: string; email: string }>>;
export type SignIn = Expect<Equal<typeof authSignInInput.infer, { email: string }>>;

export const assertedEmail: string = authEmail.assert(" Person@Example.com ");

export function validateEmail(value: unknown): string {
  const result = authEmail(value);
  if (result instanceof type.errors) return result.summary;
  return result.toLowerCase();
}

export function validateSetup(value: unknown): { name: string; email: string } | string[] {
  const result = authSetupInput(value);
  if (result instanceof type.errors) return result.map((issue) => issue.path.join("."));
  return result;
}

export function validateSignIn(value: unknown): { email: string } | string {
  const result = authSignInInput(value);
  if (result instanceof type.errors) return result.summary;
  return result;
}
