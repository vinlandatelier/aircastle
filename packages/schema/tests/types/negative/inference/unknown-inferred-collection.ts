import { collection, compileSchema, text } from "aircastle-under-test";
const schema = compileSchema({ articles: collection({ title: text() }) });
schema.pages;
