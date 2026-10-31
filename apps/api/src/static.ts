import { realpath, stat } from "node:fs/promises";
import { extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export function createStaticHandler({
  root,
  localAuthEnabled,
}: {
  root: URL;
  localAuthEnabled: boolean;
}): (request: Request) => Promise<Response> {
  const directory = fileURLToPath(root);
  return async (request: Request): Promise<Response> => {
    const headers = { "Referrer-Policy": "no-referrer" };
    const respond = (status: number) => new Response(null, { status, headers });
    if (request.method !== "GET" && request.method !== "HEAD")
      return new Response(null, { status: 405, headers: { ...headers, Allow: "GET, HEAD" } });
    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(request.url).pathname);
    } catch (error) {
      if (!(error instanceof URIError)) throw error;
      return respond(400);
    }
    if (
      pathname.includes("\0") ||
      pathname.includes("\\") ||
      pathname.split("/").includes("..") ||
      /^\/api(?:\/|$)/.test(pathname) ||
      (!localAuthEnabled && /^\/development-inbox(?:\/|$)/.test(pathname))
    )
      return respond(404);
    try {
      const canonicalRoot = await realpath(directory);
      const fileResponse = async (filename: string): Promise<Response | undefined> => {
        let canonicalFile: string;
        try {
          canonicalFile = await realpath(filename);
        } catch (error) {
          if (missingFile(error)) return;
          throw error;
        }
        const inside = relative(canonicalRoot, canonicalFile);
        if (inside === ".." || inside.startsWith(`..${sep}`)) return respond(404);
        if (!(await stat(canonicalFile)).isFile()) return;
        const file = Bun.file(canonicalFile);
        return new Response(request.method === "HEAD" ? null : file, {
          headers: { ...headers, "Content-Type": file.type, "Content-Length": String(file.size) },
        });
      };
      const file = await fileResponse(resolve(canonicalRoot, `.${pathname}`));
      if (file) return file;
      if (extname(pathname) || pathname.startsWith("/assets/")) return respond(404);
      return (await fileResponse(resolve(canonicalRoot, "index.html"))) ?? respond(404);
    } catch (error) {
      return respond(missingFile(error) ? 404 : 500);
    }
  };
}

function missingFile(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error.code === "ENOENT" || error.code === "ENOTDIR")
  );
}
