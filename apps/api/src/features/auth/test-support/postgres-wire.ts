import { once } from "node:events";
import net from "node:net";
import type postgres from "postgres";

function latch<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

export async function deadline<Value>(promise: Promise<Value>, message: string): Promise<Value> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), 5_000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function frames(consume: (frame: Buffer, type: string) => void, startup = false) {
  let buffer = Buffer.alloc(0);
  return (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= (startup ? 4 : 5)) {
      const size = buffer.readUInt32BE(startup ? 0 : 1) + (startup ? 0 : 1);
      if (buffer.length < size) break;
      const frame = buffer.subarray(0, size);
      buffer = buffer.subarray(size);
      consume(frame, startup ? "startup" : String.fromCharCode(frame[0] ?? 0));
      startup = false;
    }
  };
}

export async function postgresWire(url: string, observe?: (frame: Buffer, type: string) => void) {
  const target = new URL(url);
  const sockets = new Set<net.Socket>();
  let armed: "before-commit" | "after-commit" | undefined;
  let held = latch<number>();
  let release: (() => void) | undefined;
  let serverCommitted = false;
  const server = net.createServer((front) => {
    const back = net.connect({
      host: target.hostname,
      port: Number(target.port) || 5432,
      noDelay: true,
    });
    front.setNoDelay(true);
    sockets.add(front);
    sockets.add(back);
    const statements = new Map<string, string>();
    let backendPid = 0;
    let holding = false;
    let suppressing = false;
    const pending: Buffer[] = [];
    const stop = () => {
      front.destroy();
      back.destroy();
    };
    front.on("error", stop);
    back.on("error", stop);
    front.on("close", () => {
      sockets.delete(front);
      back.destroy();
    });
    back.on("close", () => {
      sockets.delete(back);
      front.destroy();
    });
    front.on(
      "data",
      frames((frame, type) => {
        observe?.(frame, type);
        const body = frame.subarray(5);
        let query: string | undefined;
        if (type === "Q") {
          statements.delete("");
          query = body.subarray(0, body.indexOf(0)).toString("utf8");
        } else if (type === "P") {
          const nameEnd = body.indexOf(0);
          const name = body.subarray(0, nameEnd).toString("utf8");
          query = body.subarray(nameEnd + 1, body.indexOf(0, nameEnd + 1)).toString("utf8");
          statements.set(name, query);
        } else if (type === "B") {
          const nameStart = body.indexOf(0) + 1;
          const name = body.subarray(nameStart, body.indexOf(0, nameStart)).toString("utf8");
          query = statements.get(name);
        } else if (type === "C" && body[0] === 83) {
          statements.delete(body.subarray(1, body.indexOf(0, 1)).toString("utf8"));
        }
        if (armed && query?.trim().toLowerCase() === "commit") {
          const mode = armed;
          armed = undefined;
          holding = true;
          release = () => {
            suppressing = true;
            if (mode === "before-commit") {
              stop();
              return;
            }
            for (const buffered of pending) back.write(buffered);
            pending.length = 0;
            holding = false;
          };
        }
        if (holding) {
          pending.push(frame);
          held.resolve(backendPid);
        } else back.write(frame);
      }, true),
    );
    back.on(
      "data",
      frames((frame, type) => {
        if (type === "K") backendPid = frame.readInt32BE(5);
        if (!suppressing) {
          front.write(frame);
          return;
        }
        if (type === "C" && frame.subarray(5).toString("utf8") === "COMMIT\0") {
          serverCommitted = true;
          stop();
        }
      }),
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected TCP fixture address");
  const proxied = new URL(url);
  proxied.hostname = "127.0.0.1";
  proxied.port = String(address.port);
  proxied.searchParams.set("sslmode", "disable");
  return {
    url: proxied.toString(),
    arm(mode: "before-commit" | "after-commit") {
      if (armed || release) throw new Error("A wire fault is already armed");
      serverCommitted = false;
      armed = mode;
    },
    held: () => deadline(held.promise, "Application never reached COMMIT at the wire gate"),
    release() {
      if (!release) throw new Error("No held COMMIT");
      const resume = release;
      release = undefined;
      held = latch<number>();
      resume();
    },
    committed: () => serverCommitted,
    async close() {
      for (const socket of sockets) socket.destroy();
      const closed = once(server, "close");
      server.close();
      await closed;
    },
  };
}

export async function waitForBlock(sql: ReturnType<typeof postgres>, blocker: number) {
  const until = Date.now() + 5_000;
  while (Date.now() < until) {
    const rows = await sql<{ pid: number }[]>`
      SELECT pid FROM pg_stat_activity WHERE ${blocker} = ANY(pg_blocking_pids(pid))`;
    if (rows[0]) return rows[0].pid;
    await new Promise((done) => setTimeout(done, 10));
  }
  throw new Error("No database backend demonstrably waited for the held transaction");
}
