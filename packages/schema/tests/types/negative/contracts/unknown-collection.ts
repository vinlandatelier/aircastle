import type { CompiledSchema } from "aircastle-under-test";
declare const schema: CompiledSchema<{ articles: { title: string } }>;
schema.pages;
