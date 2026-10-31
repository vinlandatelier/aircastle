import { aircastle } from "../config.ts";
aircastle.articles.list({ where: { status: { not: "archived" } } });
