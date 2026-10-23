import type { CollectionDescription } from "../../../../src/index.ts";
declare const description: CollectionDescription;
if (description.fields.title) description.fields.title.required = false;
