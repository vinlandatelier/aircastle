import type { CompositesRead } from "../../inference.ts";
type Section = NonNullable<CompositesRead["sections"]>[number];
type Hero = Extract<Section["body"][number], { type: "hero" }>;
export const rejected: Hero["cards"][number] = { title: "Card" };
