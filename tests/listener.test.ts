import { randomUUID } from "node:crypto";
import { connect } from "node:net";
import { networkInterfaces } from "node:os";
import { expect, test } from "vite-plus/test";
import { processDeadlines, standaloneServer } from "./support/content-processes.ts";

const budget = processDeadlines.start + processDeadlines.stop + processDeadlines.kill + 30_000;

function externalAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .flatMap((address) =>
      address && address.family === "IPv4" && !address.internal ? [address.address] : [],
    );
}

function accepts(host: string, port: number) {
  return new Promise<boolean>((resolve) => {
    const socket = connect({ host, port });
    const finish = (accepted: boolean) => {
      socket.destroy();
      resolve(accepted);
    };
    socket.setTimeout(2_000, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

for (const [label, env, reachable] of [
  ["listens on loopback only by default", {}, false],
  [
    "listens on every interface when AIRCASTLE_HOST is 0.0.0.0",
    { AIRCASTLE_HOST: "0.0.0.0" },
    true,
  ],
] as const) {
  test(
    `the checkout API entry point ${label}`,
    async () => {
      const external = externalAddresses();
      expect(external, "the runner needs a non-loopback IPv4 address").not.toEqual([]);
      const server = await standaloneServer(`listener_${randomUUID().replaceAll("-", "")}`, env);
      try {
        const port = Number(new URL(server.url).port);
        expect(await accepts("127.0.0.1", port)).toBe(true);
        for (const address of external)
          expect(await accepts(address, port), address).toBe(reachable);
      } finally {
        await server.close();
      }
    },
    budget,
  );
}
