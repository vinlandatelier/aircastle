import { describe, test } from "vite-plus/test";
import { text } from "../../src/index.ts";
import { compileCollection } from "../support/collections.ts";
import { expectFailure, expectSuccess } from "../support/assertions.ts";

describe("Aircastle format policy", () => {
  const validEmail = [
    "a@example.com",
    "ada@b.com",
    "ada@example.c",
    "ada@example.c0m",
    "ada@example.3com",
    "ada@example.com3",
    "ada@123.example.com",
    "ada@example.123.com",
    "ada@example.com",
    "ada+news@example.com",
    "first.last@example.co.uk",
    "Ada@Example.COM",
    "ada@my-company.com",
    "!#$%&'*+-/=?^_`{|}~@example.com",
    "ada@xn--fsqu00a.xn--0zwm56d",
    `${"a".repeat(64)}@example.com`,
    `ada@${"a".repeat(63)}.com`,

    `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(61)}`,
  ];
  const invalidEmail = [
    "",
    "example.com",
    " ada@example.com",
    "ada@example.com ",
    "a..b@example.com",
    ".ada@example.com",
    "ada.@example.com",
    "ada@localhost",
    "ada@-example.com",
    "ada@my_company.com",
    "ada@example-.com",
    "ada@example.com.",
    '"ada smith"@example.com',
    "ada@[127.0.0.1]",
    "用户@example.com",
    "ada@例子.com",
    "Ada <ada@example.com>",
    "ada@example.123",
    "ada@ex..com",
    "ada@example.com\n",
    "ada\t@example.com",
    "ada@@example.com",
    "@example.com",
    `${"a".repeat(65)}@example.com`,
    `ada@${"a".repeat(64)}.com`,

    `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(62)}`,
  ];
  for (const title of validEmail) {
    test(`accepts email unchanged ${JSON.stringify(title)}`, () => {
      expectSuccess(compileCollection({ title: text().email() }).validate({ title }), {
        title,
      });
    });
  }
  for (const title of invalidEmail) {
    test(`rejects email ${JSON.stringify(title)}`, () => {
      expectFailure(compileCollection({ title: text().email() }).validate({ title }), [
        { code: "invalid_email", path: ["title"] },
      ]);
    });
  }

  const validUrls = [
    "https://example.com",
    "http://example.com/path?q=1#part",
    "http://localhost:3000",
    "http://127.0.0.1:8080",
    "http://[::1]:8080",
    "https://example.com/a%20b",
    "https://example.com?token=abc",
    "https://例子.com",
    "https://example.com.",
    "http://example.com:80",
    "https://example.com:443",
    "HTTPS://EXAMPLE.COM/Hello",
    "https://example.com/你好?q=café#章节",
    "https://example.com/a/../b",
    "https://example.com/%61",
    "HTTPS://EXAMPLE.COM:443/a/../b?token=abc",
    "https://example.com:65535",
    "https://example.com:1",
    "https://example.com/-1:foo",
    "http://example.com:0",
    "http://example.com:080",
    "https://under_score.example",
    `https://${"a".repeat(64)}.example`,
    "https://example.com/%00",
    "https://example.com/%0A",
    "http://123.example",
    "http://[::1]",
    "https://127.0.0.1.Example",
  ];
  const invalidUrls = [
    "",
    "/articles/hello",
    "example.com",
    "//example.com",
    "mailto:ada@example.com",
    "javascript:alert(1)",
    " https://example.com",
    "https://example.com ",
    "https://example.com/a b",
    "https://alice:secret@example.com",
    "https:example.com",
    "https://example.com/%ZZ",
    "https://example.com:99999",
    "https://",
    "https:///example.com",
    "https://example.com:",
    "https://@example.com",
    "http://127.1",
    "http://0x7f000001",
    "http://2130706433",
    "https://example.com:65536",
    "https://alice@example.com",
    "https://:secret@example.com",
    "https://example.com/%",
    "https://example.com/%2",
    "https://example.com/a\\b",
    "https://example.com/a\nb",
    "https://example.com/a\tb",
    "https://example.com/a\u00A0b",
    "http://example.123",
    "http://0127.0.0.1",
    "\u0001https://example.com",
    "http://[::1",
    "http://[::1]oops",
    "http://[::1]:",
    "http://127.42.1",
    "http://127.2570",
    "http://0x7f002a2a",
  ];
  for (const title of validUrls) {
    test(`accepts URL unchanged ${JSON.stringify(title)}`, () => {
      expectSuccess(compileCollection({ title: text().url() }).validate({ title }), {
        title,
      });
    });
  }
  for (const title of invalidUrls) {
    test(`rejects URL ${JSON.stringify(title)}`, () => {
      expectFailure(compileCollection({ title: text().url() }).validate({ title }), [
        { code: "invalid_url", path: ["title"] },
      ]);
    });
  }

  test("format fields permit optional omission but reject supplied empty text", () => {
    for (const field of [text().email().optional(), text().url().optional()]) {
      expectSuccess(compileCollection({ title: field }).validate({}), {});
    }
  });
});
