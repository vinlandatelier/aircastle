import { createClient } from "../index.ts";
import { collection, text } from "@aircastle/schema";
const project = "11111111-1111-4111-8111-111111111111";
const id = "33333333-3333-4333-8333-333333333333";

async function scenario(nativeReference: boolean) {
  let writes = 0;
  const buffers = new Map<object, string>();
  const body = JSON.stringify({ ok: true, data: { id, title: "Hello" } });
  const listener = Bun.listen({
    hostname: "127.0.0.1",
    port: 0,
    socket: {
      data(socket, data) {
        const buffer = (buffers.get(socket) ?? "") + new TextDecoder().decode(data);
        buffers.set(socket, buffer);
        const boundary = buffer.indexOf("\r\n\r\n");
        if (boundary < 0) return;
        const headers = buffer.slice(0, boundary);
        const length = Number(headers.match(/content-length:\s*(\d+)/i)?.[1] ?? 0);
        if (buffer.length < boundary + 4 + length) return;
        buffers.set(socket, buffer.slice(boundary + 4 + length));
        if (headers.startsWith("GET ")) {
          socket.write(
            `HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ${body.length}\r\nConnection: keep-alive\r\n\r\n${body}`,
          );
        } else if (headers.startsWith("POST ")) {
          writes += 1;
          socket.end();
        }
      },
      close(socket) {
        buffers.delete(socket);
      },
      error() {},
    },
  });
  try {
    const url = `http://127.0.0.1:${listener.port}`;
    if (nativeReference) {
      const read = await fetch(`${url}/warmup`);
      await read.json();
      let failed = false;
      try {
        await fetch(`${url}/write`, { method: "POST", body: JSON.stringify({ title: "Hello" }) });
      } catch {
        failed = true;
      }
      return { writes, failed };
    }
    const client = createClient({
      url,
      project,
      apiKey: "probe-secret",
      collections: { articles: collection({ title: text() }) },
    });
    const read = await client.articles.findById(id);
    if (!read.ok) throw new Error("Warmup read failed: " + JSON.stringify(read));
    const result = await client.articles.create({ title: "Hello" });
    return { writes, result };
  } finally {
    listener.stop(true);
  }
}

const healthy = await scenario(false);
const faulted = await scenario(true);
console.log(JSON.stringify({ healthy, faulted }));
