import { expect, test } from "vite-plus/test";
import { canonicalContract, contractId, sameSchema } from "./index.ts";
import { description, field } from "./support/fixtures.ts";

const bytes = `{"fields":{"alpha":{"nullable":false,"required":true,"type":"text","unique":false},"beta":{"nullable":false,"required":true,"type":"text","unique":false},"zeta":{"nullable":false,"required":true,"type":"text","unique":false}}}`;
const permutations = [
  ["alpha", "beta", "zeta"],
  ["alpha", "zeta", "beta"],
  ["beta", "alpha", "zeta"],
  ["beta", "zeta", "alpha"],
  ["zeta", "alpha", "beta"],
  ["zeta", "beta", "alpha"],
];

test.each(permutations.map((order) => [order.join(","), order] as const))(
  "canonical bytes and independently pinned SHA-256 for %s",
  async (_label, order) => {
    const input = description(Object.fromEntries(order.map((name) => [name, field()])));
    expect(canonicalContract(input)).toBe(bytes);
    expect(await contractId(input)).toBe(
      "v1:d6c105afbea0cd67bb2760d6f2ed9741ce47f344a93de7fd7882662e605784c8",
    );
  },
);

test("publication equality rejects an added collection in either direction", () => {
  const one = [{ name: "articles", description: description({ title: field() }) }];
  const two = [...one, { name: "pages", description: description({ title: field() }) }];
  expect(sameSchema(one, two)).toBe(false);
  expect(sameSchema(two, one)).toBe(false);
});

test("publication equality includes collection names even with identical fields", () => {
  expect(
    sameSchema(
      [{ name: "articles", description: description({ title: field() }) }],
      [{ name: "pages", description: description({ title: field() }) }],
    ),
  ).toBe(false);
});
