import { blocks, object, text } from "aircastle-under-test";
blocks({ hero: object({ heading: text() }) }).default([{ type: "banner", heading: "Hi" }]);
