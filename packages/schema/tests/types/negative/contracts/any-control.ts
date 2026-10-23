import type { Assert, Equal, IsAny } from "../../assert.ts";
export type Rejected = Assert<Equal<IsAny<any>, false>>;
