import { aircastle } from "../config.ts";
aircastle.articles.list({ where: { status: { is: "archived" } } });
