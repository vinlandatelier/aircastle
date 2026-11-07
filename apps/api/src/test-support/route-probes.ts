import type { routeAccess } from "../app.ts";

/** One request to a mounted API route, with a JSON body when the route reads one. */
export interface RouteProbe {
  method: string;
  path: string;
  body?: string;
}

type ProjectKeyRoute = {
  [Route in keyof typeof routeAccess]: (typeof routeAccess)[Route] extends "project-key"
    ? Route
    : never;
}[keyof typeof routeAccess];

/**
 * One request to each `project-key` route in `routeAccess`, aimed at the given project,
 * collection and document. Each body passes the route's own input checks, and the schema
 * request republishes `collections` at baseline `null`.
 */
export function projectKeyProbes(target: {
  project: string;
  collection: string;
  document: string;
  collections: unknown;
}): Record<ProjectKeyRoute, RouteProbe> {
  const schema = `/api/projects/${target.project}/schema`;
  const documents = `/api/projects/${target.project}/collections/${target.collection}/documents`;
  const document = `${documents}/${target.document}`;
  return {
    "GET /api/projects/:project/schema": { method: "GET", path: schema },
    "POST /api/projects/:project/schema": {
      method: "POST",
      path: schema,
      body: JSON.stringify({ baseline: null, collections: target.collections }),
    },
    "POST /api/projects/:project/collections/:collection/documents": {
      method: "POST",
      path: documents,
      body: JSON.stringify({ title: "Draft" }),
    },
    "GET /api/projects/:project/collections/:collection/documents/:id": {
      method: "GET",
      path: document,
    },
    "PATCH /api/projects/:project/collections/:collection/documents/:id": {
      method: "PATCH",
      path: document,
      body: JSON.stringify({ changes: { title: "Edited" } }),
    },
    "DELETE /api/projects/:project/collections/:collection/documents/:id": {
      method: "DELETE",
      path: document,
    },
    "GET /api/projects/:project/collections/:collection/documents": {
      method: "GET",
      path: `${documents}?limit=1`,
    },
    "POST /api/projects/:project/collections/:collection/documents/query": {
      method: "POST",
      path: `${documents}/query`,
      body: JSON.stringify({ limit: 1 }),
    },
  };
}
