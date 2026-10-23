import type { CollectionDescription } from "../../../../src/index.ts";
declare const description: CollectionDescription;
description.fields.title = { type: "text", required: true, nullable: false, unique: false };
