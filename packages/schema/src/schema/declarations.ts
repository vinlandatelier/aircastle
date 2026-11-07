import type { CodeLanguage, JsonValue, PointValue } from "./contract.ts";
import {
  snapshotArray,
  snapshotChoices,
  snapshotDefault,
  snapshotRecord,
  type RecordSnapshot,
} from "./records.ts";

const fieldTypes: unique symbol = Symbol("aircastle.field.types");
const collectionFields: unique symbol = Symbol("aircastle.collection.fields");

export type Modifier =
  | { readonly kind: "min" | "max" | "default" | "choices"; readonly value: unknown }
  | { readonly kind: "optional" | "nullable" | "unique" | "int" }
  | { readonly kind: "format"; readonly value: "email" | "url" }
  | {
      readonly kind: "editor";
      readonly name: unknown;
      readonly options: RecordSnapshot | undefined;
    };

export type FieldKind =
  | "text"
  | "number"
  | "boolean"
  | "date"
  | "datetime"
  | "list"
  | "object"
  | "blocks"
  | "json"
  | "point"
  | "reference";

interface Arguments {
  text: undefined;
  number: undefined;
  boolean: undefined;
  date: undefined;
  datetime: undefined;
  list: unknown;
  object: RecordSnapshot;
  blocks: RecordSnapshot;
  json: undefined;
  point: undefined;
  reference: string | readonly unknown[];
}

/**
 * A declared field as captured by its builder. `argument` holds the kind's constructor input:
 * the item builder for lists, a field snapshot for objects, a variant snapshot for blocks, and the
 * target name or names for references.
 */
export type FieldDefinition<Kind extends FieldKind = FieldKind> = {
  [Name in Kind]: {
    readonly kind: Name;
    readonly argument: Arguments[Name];
    readonly modifiers: readonly Modifier[];
  };
}[Kind];

const fields = new WeakMap<object, FieldDefinition>();
const collections = new WeakMap<object, RecordSnapshot>();

interface FieldTypes {
  readonly kind: FieldKind;
  readonly input: unknown;
  readonly output: unknown;
  readonly read: unknown;
  readonly optional: boolean;
  readonly nullable: boolean;
  readonly defaulted: boolean;
}

interface FieldIdentity {
  readonly [fieldTypes]: FieldTypes;
}

interface CollectionIdentity {
  readonly [collectionFields]: Readonly<Record<string, FieldIdentity>>;
}

type Fields = Readonly<Record<string, FieldIdentity>>;

function register(target: object, definition: FieldDefinition) {
  fields.set(
    target,
    Object.freeze({ ...definition, modifiers: Object.freeze([...definition.modifiers]) }),
  );
  Object.freeze(target);
}

function appended(source: object, modifier: Modifier): FieldDefinition {
  const definition = fields.get(source)!;
  return { ...definition, modifiers: [...definition.modifiers, Object.freeze(modifier)] };
}

type NullableValue<Value, Nullable extends boolean> =
  | Value
  | (Nullable extends true ? null : never);

class TextField<
  Value extends string = string,
  Optional extends boolean = false,
  Nullable extends boolean = false,
  Defaulted extends boolean = false,
> implements FieldIdentity {
  declare readonly [fieldTypes]: {
    readonly kind: "text";
    readonly input: Value;
    readonly output: Value;
    readonly read: Value;
    readonly optional: Optional;
    readonly nullable: Nullable;
    readonly defaulted: Defaulted;
  };

  constructor(definition: FieldDefinition) {
    register(this, definition);
  }

  #append<
    NextValue extends string = Value,
    NextOptional extends boolean = Optional,
    NextNullable extends boolean = Nullable,
    NextDefaulted extends boolean = Defaulted,
  >(modifier: Modifier): TextField<NextValue, NextOptional, NextNullable, NextDefaulted> {
    return new TextField(appended(this, modifier));
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
  default(value: NullableValue<Value, Nullable>): TextField<Value, Optional, Nullable, true> {
    return this.#append<Value, Optional, Nullable, true>({
      kind: "default",
      value: snapshotDefault(value),
    });
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

class NumberField<
  Optional extends boolean = false,
  Nullable extends boolean = false,
  Defaulted extends boolean = false,
> implements FieldIdentity {
  declare readonly [fieldTypes]: {
    readonly kind: "number";
    readonly input: number;
    readonly output: number;
    readonly read: number;
    readonly optional: Optional;
    readonly nullable: Nullable;
    readonly defaulted: Defaulted;
  };

  constructor(definition: FieldDefinition) {
    register(this, definition);
  }

  #append<
    NextOptional extends boolean = Optional,
    NextNullable extends boolean = Nullable,
    NextDefaulted extends boolean = Defaulted,
  >(modifier: Modifier): NumberField<NextOptional, NextNullable, NextDefaulted> {
    return new NumberField(appended(this, modifier));
  }

  int(): NumberField<Optional, Nullable, Defaulted> {
    return this.#append({ kind: "int" });
  }
  min(value: number): NumberField<Optional, Nullable, Defaulted> {
    return this.#append({ kind: "min", value });
  }
  max(value: number): NumberField<Optional, Nullable, Defaulted> {
    return this.#append({ kind: "max", value });
  }
  optional(): NumberField<true, Nullable, Defaulted> {
    return this.#append<true>({ kind: "optional" });
  }
  nullable(): NumberField<Optional, true, Defaulted> {
    return this.#append<Optional, true>({ kind: "nullable" });
  }
  default(value: NullableValue<number, Nullable>): NumberField<Optional, Nullable, true> {
    return this.#append<Optional, Nullable, true>({
      kind: "default",
      value: snapshotDefault(value),
    });
  }
}

class BooleanField<
  Optional extends boolean = false,
  Nullable extends boolean = false,
  Defaulted extends boolean = false,
> implements FieldIdentity {
  declare readonly [fieldTypes]: {
    readonly kind: "boolean";
    readonly input: boolean;
    readonly output: boolean;
    readonly read: boolean;
    readonly optional: Optional;
    readonly nullable: Nullable;
    readonly defaulted: Defaulted;
  };

  constructor(definition: FieldDefinition) {
    register(this, definition);
  }

  #append<
    NextOptional extends boolean = Optional,
    NextNullable extends boolean = Nullable,
    NextDefaulted extends boolean = Defaulted,
  >(modifier: Modifier): BooleanField<NextOptional, NextNullable, NextDefaulted> {
    return new BooleanField(appended(this, modifier));
  }

  optional(): BooleanField<true, Nullable, Defaulted> {
    return this.#append<true>({ kind: "optional" });
  }
  nullable(): BooleanField<Optional, true, Defaulted> {
    return this.#append<Optional, true>({ kind: "nullable" });
  }
  default(value: NullableValue<boolean, Nullable>): BooleanField<Optional, Nullable, true> {
    return this.#append<Optional, Nullable, true>({
      kind: "default",
      value: snapshotDefault(value),
    });
  }
  editor(name: "checkbox" | "switch"): BooleanField<Optional, Nullable, Defaulted> {
    return this.#append({ kind: "editor", name, options: undefined });
  }
}

class DateField<
  Kind extends "date" | "datetime" = "date",
  Optional extends boolean = false,
  Nullable extends boolean = false,
  Defaulted extends boolean = false,
> implements FieldIdentity {
  declare readonly [fieldTypes]: {
    readonly kind: Kind;
    readonly input: string;
    readonly output: string;
    readonly read: string;
    readonly optional: Optional;
    readonly nullable: Nullable;
    readonly defaulted: Defaulted;
  };

  constructor(definition: FieldDefinition) {
    register(this, definition);
  }

  #append<
    NextOptional extends boolean = Optional,
    NextNullable extends boolean = Nullable,
    NextDefaulted extends boolean = Defaulted,
  >(modifier: Modifier): DateField<Kind, NextOptional, NextNullable, NextDefaulted> {
    return new DateField(appended(this, modifier));
  }

  min(value: string): DateField<Kind, Optional, Nullable, Defaulted> {
    return this.#append({ kind: "min", value });
  }
  max(value: string): DateField<Kind, Optional, Nullable, Defaulted> {
    return this.#append({ kind: "max", value });
  }
  optional(): DateField<Kind, true, Nullable, Defaulted> {
    return this.#append<true>({ kind: "optional" });
  }
  nullable(): DateField<Kind, Optional, true, Defaulted> {
    return this.#append<Optional, true>({ kind: "nullable" });
  }
  default(value: NullableValue<string, Nullable>): DateField<Kind, Optional, Nullable, true> {
    return this.#append<Optional, Nullable, true>({
      kind: "default",
      value: snapshotDefault(value),
    });
  }
}

type ItemValue<
  Item extends FieldIdentity,
  Side extends "input" | "output" | "read",
> = NullableValue<
  Item[typeof fieldTypes]["kind"] extends "object"
    ? Expand<
        Item[typeof fieldTypes][Side] &
          (Side extends "input"
            ? { id?: string | undefined }
            : Side extends "output"
              ? { id?: string }
              : { id: string })
      >
    : Item[typeof fieldTypes][Side],
  Item[typeof fieldTypes]["nullable"]
>;

class ListField<
  Item extends FieldIdentity,
  Optional extends boolean = false,
  Nullable extends boolean = false,
  Defaulted extends boolean = false,
> implements FieldIdentity {
  declare readonly [fieldTypes]: {
    readonly kind: "list";
    readonly input: ItemValue<Item, "input">[];
    readonly output: ItemValue<Item, "output">[];
    readonly read: ItemValue<Item, "read">[];
    readonly optional: Optional;
    readonly nullable: Nullable;
    readonly defaulted: Defaulted;
  };

  constructor(definition: FieldDefinition) {
    register(this, definition);
  }

  #append<
    NextOptional extends boolean = Optional,
    NextNullable extends boolean = Nullable,
    NextDefaulted extends boolean = Defaulted,
  >(modifier: Modifier): ListField<Item, NextOptional, NextNullable, NextDefaulted> {
    return new ListField(appended(this, modifier));
  }

  min(value: number): ListField<Item, Optional, Nullable, Defaulted> {
    return this.#append({ kind: "min", value });
  }
  max(value: number): ListField<Item, Optional, Nullable, Defaulted> {
    return this.#append({ kind: "max", value });
  }
  optional(): ListField<Item, true, Nullable, Defaulted> {
    return this.#append<true>({ kind: "optional" });
  }
  nullable(): ListField<Item, Optional, true, Defaulted> {
    return this.#append<Optional, true>({ kind: "nullable" });
  }
  default(
    value: NullableValue<ItemValue<Item, "input">[], Nullable>,
  ): ListField<Item, Optional, Nullable, true> {
    return this.#append<Optional, Nullable, true>({
      kind: "default",
      value: snapshotDefault(value),
    });
  }
}

class ObjectField<
  Shape extends Fields,
  Optional extends boolean = false,
  Nullable extends boolean = false,
  Defaulted extends boolean = false,
> implements FieldIdentity {
  declare readonly [fieldTypes]: {
    readonly kind: "object";
    readonly input: InputShape<Shape>;
    readonly output: OutputShape<Shape, "output">;
    readonly read: OutputShape<Shape, "read">;
    readonly optional: Optional;
    readonly nullable: Nullable;
    readonly defaulted: Defaulted;
  };

  constructor(definition: FieldDefinition) {
    register(this, definition);
  }

  #append<
    NextOptional extends boolean = Optional,
    NextNullable extends boolean = Nullable,
    NextDefaulted extends boolean = Defaulted,
  >(modifier: Modifier): ObjectField<Shape, NextOptional, NextNullable, NextDefaulted> {
    return new ObjectField(appended(this, modifier));
  }

  optional(): ObjectField<Shape, true, Nullable, Defaulted> {
    return this.#append<true>({ kind: "optional" });
  }
  nullable(): ObjectField<Shape, Optional, true, Defaulted> {
    return this.#append<Optional, true>({ kind: "nullable" });
  }
  default(
    value: NullableValue<InputShape<Shape>, Nullable>,
  ): ObjectField<Shape, Optional, Nullable, true> {
    return this.#append<Optional, Nullable, true>({
      kind: "default",
      value: snapshotDefault(value),
    });
  }
}

type Variants = Readonly<Record<string, ObjectField<Fields, boolean, boolean, boolean>>>;
type BlockValue<Shape extends Variants, Side extends "input" | "output" | "read"> = {
  [Type in keyof Shape & string]: Expand<
    { type: Type } & (Side extends "input"
      ? { id?: string | undefined }
      : Side extends "output"
        ? { id?: string }
        : { id: string }) &
      Shape[Type][typeof fieldTypes][Side]
  >;
}[keyof Shape & string];

class BlocksField<
  Shape extends Variants,
  Optional extends boolean = false,
  Nullable extends boolean = false,
  Defaulted extends boolean = false,
> implements FieldIdentity {
  declare readonly [fieldTypes]: {
    readonly kind: "blocks";
    readonly input: BlockValue<Shape, "input">[];
    readonly output: BlockValue<Shape, "output">[];
    readonly read: BlockValue<Shape, "read">[];
    readonly optional: Optional;
    readonly nullable: Nullable;
    readonly defaulted: Defaulted;
  };

  constructor(definition: FieldDefinition) {
    register(this, definition);
  }

  #append<
    NextOptional extends boolean = Optional,
    NextNullable extends boolean = Nullable,
    NextDefaulted extends boolean = Defaulted,
  >(modifier: Modifier): BlocksField<Shape, NextOptional, NextNullable, NextDefaulted> {
    return new BlocksField(appended(this, modifier));
  }

  min(value: number): BlocksField<Shape, Optional, Nullable, Defaulted> {
    return this.#append({ kind: "min", value });
  }
  max(value: number): BlocksField<Shape, Optional, Nullable, Defaulted> {
    return this.#append({ kind: "max", value });
  }
  optional(): BlocksField<Shape, true, Nullable, Defaulted> {
    return this.#append<true>({ kind: "optional" });
  }
  nullable(): BlocksField<Shape, Optional, true, Defaulted> {
    return this.#append<Optional, true>({ kind: "nullable" });
  }
  default(
    value: NullableValue<BlockValue<Shape, "input">[], Nullable>,
  ): BlocksField<Shape, Optional, Nullable, true> {
    return this.#append<Optional, Nullable, true>({
      kind: "default",
      value: snapshotDefault(value),
    });
  }
}

class JsonField<
  Optional extends boolean = false,
  Nullable extends boolean = false,
  Defaulted extends boolean = false,
> implements FieldIdentity {
  declare readonly [fieldTypes]: {
    readonly kind: "json";
    readonly input: JsonValue;
    readonly output: JsonValue;
    readonly read: JsonValue;
    readonly optional: Optional;
    readonly nullable: Nullable;
    readonly defaulted: Defaulted;
  };

  constructor(definition: FieldDefinition) {
    register(this, definition);
  }

  #append<
    NextOptional extends boolean = Optional,
    NextNullable extends boolean = Nullable,
    NextDefaulted extends boolean = Defaulted,
  >(modifier: Modifier): JsonField<NextOptional, NextNullable, NextDefaulted> {
    return new JsonField(appended(this, modifier));
  }

  optional(): JsonField<true, Nullable, Defaulted> {
    return this.#append<true>({ kind: "optional" });
  }
  nullable(): JsonField<Optional, true, Defaulted> {
    return this.#append<Optional, true>({ kind: "nullable" });
  }
  default(
    value: NullableValue<Exclude<JsonValue, null>, Nullable>,
  ): JsonField<Optional, Nullable, true> {
    return this.#append<Optional, Nullable, true>({
      kind: "default",
      value: snapshotDefault(value),
    });
  }
}

type Point = { lat: number; lng: number };

class PointField<
  Optional extends boolean = false,
  Nullable extends boolean = false,
  Defaulted extends boolean = false,
> implements FieldIdentity {
  declare readonly [fieldTypes]: {
    readonly kind: "point";
    readonly input: Point;
    readonly output: Point;
    readonly read: Point;
    readonly optional: Optional;
    readonly nullable: Nullable;
    readonly defaulted: Defaulted;
  };

  constructor(definition: FieldDefinition) {
    register(this, definition);
  }

  #append<
    NextOptional extends boolean = Optional,
    NextNullable extends boolean = Nullable,
    NextDefaulted extends boolean = Defaulted,
  >(modifier: Modifier): PointField<NextOptional, NextNullable, NextDefaulted> {
    return new PointField(appended(this, modifier));
  }

  optional(): PointField<true, Nullable, Defaulted> {
    return this.#append<true>({ kind: "optional" });
  }
  nullable(): PointField<Optional, true, Defaulted> {
    return this.#append<Optional, true>({ kind: "nullable" });
  }
  default(value: NullableValue<PointValue, Nullable>): PointField<Optional, Nullable, true> {
    return this.#append<Optional, Nullable, true>({
      kind: "default",
      value: snapshotDefault(value),
    });
  }
}

class ReferenceField<
  Value,
  Optional extends boolean = false,
  Nullable extends boolean = false,
> implements FieldIdentity {
  declare readonly [fieldTypes]: {
    readonly kind: "reference";
    readonly input: Value;
    readonly output: Value;
    readonly read: Value;
    readonly optional: Optional;
    readonly nullable: Nullable;
    readonly defaulted: false;
  };

  constructor(definition: FieldDefinition) {
    register(this, definition);
  }

  #append<NextOptional extends boolean = Optional, NextNullable extends boolean = Nullable>(
    modifier: Modifier,
  ): ReferenceField<Value, NextOptional, NextNullable> {
    return new ReferenceField(appended(this, modifier));
  }

  optional(): ReferenceField<Value, true, Nullable> {
    return this.#append<true>({ kind: "optional" });
  }
  nullable(): ReferenceField<Value, Optional, true> {
    return this.#append<Optional, true>({ kind: "nullable" });
  }
}

class Collection<Shape extends Fields> implements CollectionIdentity {
  declare readonly [collectionFields]: Shape;
  constructor(definition: Shape) {
    collections.set(this, snapshotRecord(definition));
    Object.freeze(this);
  }
}

export function text(): TextField {
  return new TextField({ kind: "text", argument: undefined, modifiers: [] });
}

export function number(): NumberField {
  return new NumberField({ kind: "number", argument: undefined, modifiers: [] });
}

export function boolean(): BooleanField {
  return new BooleanField({ kind: "boolean", argument: undefined, modifiers: [] });
}

export function date(): DateField<"date"> {
  return new DateField<"date">({ kind: "date", argument: undefined, modifiers: [] });
}

export function datetime(): DateField<"datetime"> {
  return new DateField<"datetime">({ kind: "datetime", argument: undefined, modifiers: [] });
}

export function list<Item extends FieldIdentity>(item: Item): ListField<Item> {
  return new ListField<Item>({ kind: "list", argument: item, modifiers: [] });
}

export function object<const Shape extends Fields>(shape: Shape): ObjectField<Shape> {
  return new ObjectField<Shape>({ kind: "object", argument: snapshotRecord(shape), modifiers: [] });
}

export function blocks<const Shape extends Variants>(variants: Shape): BlocksField<Shape> {
  return new BlocksField<Shape>({
    kind: "blocks",
    argument: snapshotRecord(variants),
    modifiers: [],
  });
}

export function json(): JsonField {
  return new JsonField({ kind: "json", argument: undefined, modifiers: [] });
}

export function point(): PointField {
  return new PointField({ kind: "point", argument: undefined, modifiers: [] });
}

export function reference<const Name extends string>(collection: Name): ReferenceField<string>;
export function reference<const Names extends readonly [string, ...string[]]>(
  collections: Names,
): ReferenceField<{ collection: Names[number]; id: string }>;
export function reference(target: unknown): ReferenceField<unknown> {
  return new ReferenceField({
    kind: "reference",
    argument: Array.isArray(target)
      ? snapshotArray(target)
      : typeof target === "string"
        ? target
        : "",
    modifiers: [],
  });
}

export function collection<const Shape extends Fields>(definition: Shape): Collection<Shape> {
  return new Collection(definition);
}

/** `WeakMap.get` returns `undefined` for primitives, so any value can be looked up. */
export function fieldDefinition(value: unknown): FieldDefinition | undefined {
  return fields.get(value as object);
}

/** `WeakMap.get` returns `undefined` for primitives, so any value can be looked up. */
export function collectionDefinition(value: unknown): RecordSnapshot | undefined {
  return collections.get(value as object);
}

type Expand<Value> = { [Key in keyof Value]: Value[Key] };
type FieldValue<
  Field extends FieldIdentity,
  Side extends "input" | "output" | "read",
> = NullableValue<Field[typeof fieldTypes][Side], Field[typeof fieldTypes]["nullable"]>;
type InputOptionalKeys<Shape extends Fields> = {
  [Key in keyof Shape]-?: Shape[Key][typeof fieldTypes]["optional"] extends true
    ? Key
    : Shape[Key][typeof fieldTypes]["defaulted"] extends true
      ? Key
      : never;
}[keyof Shape];
type OutputOptionalKeys<Shape extends Fields> = {
  [Key in keyof Shape]-?: Shape[Key][typeof fieldTypes]["defaulted"] extends true
    ? never
    : Shape[Key][typeof fieldTypes]["optional"] extends true
      ? Key
      : never;
}[keyof Shape];

type InputShape<Shape extends Fields> = Expand<
  {
    -readonly [Key in Exclude<keyof Shape, InputOptionalKeys<Shape>>]: FieldValue<
      Shape[Key],
      "input"
    >;
  } & {
    -readonly [Key in InputOptionalKeys<Shape>]?: FieldValue<Shape[Key], "input"> | undefined;
  }
>;
type OutputShape<Shape extends Fields, Side extends "output" | "read"> = Expand<
  {
    -readonly [Key in Exclude<keyof Shape, OutputOptionalKeys<Shape>>]: FieldValue<
      Shape[Key],
      Side
    >;
  } & {
    -readonly [Key in OutputOptionalKeys<Shape>]?: FieldValue<Shape[Key], Side>;
  }
>;

/** The document a caller may submit for a collection: defaulted and optional fields may be omitted. */
export type InferInput<Declaration extends CollectionIdentity> = InputShape<
  Declaration[typeof collectionFields]
>;
/** The document `validate()` returns: block and row ids stay optional because validation never assigns them. */
export type InferOutput<Declaration extends CollectionIdentity> = OutputShape<
  Declaration[typeof collectionFields],
  "output"
>;
/** A stored document's fields as read back: every block and list row carries its assigned id. */
export type InferRead<Declaration extends CollectionIdentity> = OutputShape<
  Declaration[typeof collectionFields],
  "read"
>;
export type CollectionDefinitions = Readonly<Record<string, CollectionIdentity>>;
