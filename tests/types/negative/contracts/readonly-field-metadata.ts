import type { CollectionDescription } from "aircastle-under-test";
declare const description: CollectionDescription;
if (description.fields.title) description.fields.title.required = false;
