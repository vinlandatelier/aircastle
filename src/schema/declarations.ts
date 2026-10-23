import type { CodeLanguage } from "./contract.ts";
import { snapshotChoices, snapshotRecord, type RecordSnapshot } from "./records.ts";

const fieldTypes: unique symbol = Symbol("aircastle.field.types");
const collectionFields: unique symbol = Symbol("aircastle.collection.fields");

export type Modifier =
  | { readonly kind: "min" | "max" | "default" | "choices"; readonly value: unknown }
  | { readonly kind: "optional" | "nullable" | "unique" }
  | { readonly kind: "format"; readonly value: "email" | "url" }
  | {
      readonly kind: "editor";
      readonly name: unknown;
      readonly options: RecordSnapshot | undefined;
    };

const fields = new WeakMap<object, readonly Modifier[]>();
const collections = new WeakMap<object, RecordSnapshot>();

interface FieldIdentity {
  readonly [fieldTypes]: {
    readonly value: string;
    readonly optional: boolean;
    readonly nullable: boolean;
    readonly defaulted: boolean;
  };
}

interface CollectionIdentity {
  readonly [collectionFields]: Readonly<Record<string, FieldIdentity>>;
}

class TextField<
  Value extends string = string,
  Optional extends boolean = false,
  Nullable extends boolean = false,
  Defaulted extends boolean = false,
> implements FieldIdentity {
  declare readonly [fieldTypes]: {
    readonly value: Value;
    readonly optional: Optional;
    readonly nullable: Nullable;
    readonly defaulted: Defaulted;
  };

  constructor(modifiers: readonly Modifier[] = []) {
    fields.set(this, Object.freeze([...modifiers]));
    Object.freeze(this);
  }

  #append<
    NextValue extends string = Value,
    NextOptional extends boolean = Optional,
    NextNullable extends boolean = Nullable,
    NextDefaulted extends boolean = Defaulted,
  >(modifier: Modifier): TextField<NextValue, NextOptional, NextNullable, NextDefaulted> {
    return new TextField([...fields.get(this)!, Object.freeze(modifier)]);
  }

  min(value: number): TextField<Value, Optional, Nullable, Defaulted> {
    return this.#append({ kind: "min", value });
  }
  max(value: number): TextField<Value, Optional, Nullable, Defaulted> {
    return this.#append({ kind: "max", value });
  }
  optional(): TextField<Value, true, Nullable, Defaulted> {
    return this.#append<Value, true>({ kind: "optional" });
  }
  nullable(): TextField<Value, Optional, true, Defaulted> {
    return this.#append<Value, Optional, true>({ kind: "nullable" });
  }
  default(
    value: Value | (Nullable extends true ? null : never),
  ): TextField<Value, Optional, Nullable, true> {
    return this.#append<Value, Optional, Nullable, true>({ kind: "default", value });
  }
  oneOf<const Choices extends readonly string[]>(
    values: Choices,
  ): TextField<Choices[number], Optional, Nullable, Defaulted> {
    return this.#append<Choices[number]>({ kind: "choices", value: snapshotChoices(values) });
  }
  email(): TextField<Value, Optional, Nullable, Defaulted> {
    return this.#append({ kind: "format", value: "email" });
  }
  url(): TextField<Value, Optional, Nullable, Defaulted> {
    return this.#append({ kind: "format", value: "url" });
  }
  unique(): TextField<Value, Optional, Nullable, Defaulted> {
    return this.#append({ kind: "unique" });
  }
  editor(
    name: "textarea",
    options?: { rows?: number },
  ): TextField<Value, Optional, Nullable, Defaulted>;
  editor(
    name: "code",
    options?: { language?: CodeLanguage },
  ): TextField<Value, Optional, Nullable, Defaulted>;
  editor(
    name: "radio",
    options?: Readonly<Record<string, never>>,
  ): TextField<Value, Optional, Nullable, Defaulted>;
  editor(name: unknown, options?: unknown): TextField<Value, Optional, Nullable, Defaulted> {
    return this.#append({
      kind: "editor",
      name,
      options: options === undefined ? undefined : snapshotRecord(options),
    });
  }
}

class Collection<
  Fields extends Readonly<Record<string, FieldIdentity>>,
> implements CollectionIdentity {
  declare readonly [collectionFields]: Fields;
  constructor(definition: Fields) {
    collections.set(this, snapshotRecord(definition));
    Object.freeze(this);
  }
}

export function text(): TextField {
  return new TextField();
}

export function collection<const Fields extends Readonly<Record<string, FieldIdentity>>>(
  definition: Fields,
): Collection<Fields> {
  return new Collection(definition);
}

export function fieldDefinition(value: unknown): readonly Modifier[] | undefined {
  return value !== null && typeof value === "object" ? fields.get(value) : undefined;
}

export function collectionDefinition(value: unknown): RecordSnapshot | undefined {
  return value !== null && typeof value === "object" ? collections.get(value) : undefined;
}

type FieldValue<Field extends FieldIdentity> =
  | Field[typeof fieldTypes]["value"]
  | (Field[typeof fieldTypes]["nullable"] extends true ? null : never);
type InputOptionalKeys<Fields extends Readonly<Record<string, FieldIdentity>>> = {
  [Key in keyof Fields]-?: Fields[Key][typeof fieldTypes]["optional"] extends true
    ? Key
    : Fields[Key][typeof fieldTypes]["defaulted"] extends true
      ? Key
      : never;
}[keyof Fields];
type OutputOptionalKeys<Fields extends Readonly<Record<string, FieldIdentity>>> = {
  [Key in keyof Fields]-?: Fields[Key][typeof fieldTypes]["defaulted"] extends true
    ? never
    : Fields[Key][typeof fieldTypes]["optional"] extends true
      ? Key
      : never;
}[keyof Fields];
type Expand<Value> = { [Key in keyof Value]: Value[Key] };

export type InferInput<Declaration extends CollectionIdentity> = Expand<
  {
    -readonly [
      Key in Exclude<
        keyof Declaration[typeof collectionFields],
        InputOptionalKeys<Declaration[typeof collectionFields]>
      >
    ]: FieldValue<Declaration[typeof collectionFields][Key]>;
  } & {
    -readonly [Key in InputOptionalKeys<Declaration[typeof collectionFields]>]?:
      | FieldValue<Declaration[typeof collectionFields][Key]>
      | undefined;
  }
>;
export type InferOutput<Declaration extends CollectionIdentity> = Expand<
  {
    -readonly [
      Key in Exclude<
        keyof Declaration[typeof collectionFields],
        OutputOptionalKeys<Declaration[typeof collectionFields]>
      >
    ]: FieldValue<Declaration[typeof collectionFields][Key]>;
  } & {
    -readonly [Key in OutputOptionalKeys<Declaration[typeof collectionFields]>]?: FieldValue<
      Declaration[typeof collectionFields][Key]
    >;
  }
>;
export type CollectionDefinitions = Readonly<Record<string, CollectionIdentity>>;
