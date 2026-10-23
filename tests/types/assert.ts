export type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2) ? true : false;
export type IsAny<Value> = 0 extends (1 & Value) ? true : false;
export type Assert<Value extends true> = Value;

export type EqualControl = Assert<Equal<string, string>>;
export type AnyControl = Assert<IsAny<any>>;
// @ts-expect-error The equality assertion must reject a different domain.
export type WrongEqualityControl = Assert<Equal<string, number>>;
// @ts-expect-error An any domain must not count as a precise inference result.
export type WrongAnyControl = Assert<Equal<IsAny<any>, false>>;
