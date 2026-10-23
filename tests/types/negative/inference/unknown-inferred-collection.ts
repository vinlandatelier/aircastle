import { collection, compileSchema, text } from "../../../../src/index.ts";
const schema = compileSchema({ articles: collection({ title: text() }) });
schema.pages;
