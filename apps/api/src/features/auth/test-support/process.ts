import { fork } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { request as httpRequest } from "node:http";
import type { IncomingMessage } from "node:http";
import { Readable } from "node:stream";
import type { DevelopmentInboxEntry } from "../../development-inbox/index.ts";
import { browserOrigin, start } from "./fixture.ts";
import { deadline } from "./postgres-wire.ts";

export async function authProcess(url: string, namespace: string) {
  const child = fork(fileURLToPath(new URL("./server.ts", import.meta.url)), [], {
    execPath: "bun",
    execArgv: ["--conditions=development"],
    env: {
      ...process.env,
      AIRCASTLE_DATABASE_URL: url,
      AIRCASTLE_DATABASE_NAMESPACE: namespace,
      AIRCASTLE_ENV: "development",
      AIRCASTLE_URL: browserOrigin,
      AUTH_TEST_NOW: String(start),
    },
    stdio: ["ignore", "ignore", "pipe", "ipc"],
  });
  let stderr = "";
  child.stderr?.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  const message = <Value>(kind: string, id?: string) =>
    new Promise<Value>((resolve, reject) => {
      const listener = (value: unknown) => {
        if (
          typeof value !== "object" ||
          value === null ||
          !("kind" in value) ||
          value.kind !== kind
        )
          return;
        if (id !== undefined && (!("id" in value) || value.id !== id)) return;
        cleanup();
        resolve(value as Value);
      };
      const exited = () => {
        cleanup();
        reject(new Error(`Auth child exited before ${kind}: ${stderr}`));
      };
      const cleanup = () => {
        child.off("message", listener);
        child.off("exit", exited);
      };
      child.on("message", listener);
      child.once("exit", exited);
    });
  const close = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, "exit");
    child.kill("SIGTERM");
    try {
      await deadline(exited, "Auth child did not shut down");
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    }
  };
  try {
    const ready = await deadline(
      message<{ kind: "ready"; origin: string }>("ready"),
      "Auth child never became ready",
    );
    return {
      close,
      async request(path: string, body?: unknown, cookie?: string) {
        const serializedBody = body === undefined ? undefined : JSON.stringify(body);
        const response = await new Promise<IncomingMessage>((resolve, reject) => {
          const request = httpRequest(
            `${ready.origin}/api${path}`,
            {
              method: body === undefined ? "GET" : "POST",
              headers: {
                host: new URL(browserOrigin).host,
                origin: browserOrigin,
                ...(cookie ? { cookie } : {}),
                ...(body === undefined ? {} : { "content-type": "application/json" }),
              },
            },
            resolve,
          );
          request.once("error", reject);
          request.end(serializedBody);
        });
        const headers = new Headers();
        for (let index = 0; index < response.rawHeaders.length; index += 2) {
          headers.append(response.rawHeaders[index]!, response.rawHeaders[index + 1]!);
        }
        const emptyBody = [204, 205, 304].includes(response.statusCode!);
        if (emptyBody) response.resume();
        return new Response(emptyBody ? null : Readable.toWeb(response), {
          status: response.statusCode!,
          statusText: response.statusMessage!,
          headers,
        });
      },
      async inbox() {
        const id = randomUUID();
        const received = message<{ entries: DevelopmentInboxEntry[] }>("inbox", id);
        child.send({ kind: "inbox", id });
        return (await deadline(received, "Auth child inbox was not returned")).entries;
      },
    };
  } catch (error) {
    await close();
    throw error;
  }
}
