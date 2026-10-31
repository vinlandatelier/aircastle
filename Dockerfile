FROM oven/bun:1.4.4-slim AS bun
FROM node:24.11.0-bookworm-slim AS build
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
ENV PATH="/app/node_modules/.bin:${PATH}"
COPY . .
RUN VP_GIT_HOOKS=0 bun install --frozen-lockfile
RUN vp run build

FROM bun AS runtime
WORKDIR /app/apps/api
ENV NODE_ENV=production AIRCASTLE_PORT=8080
COPY --from=build --chown=bun:bun /app/apps/api/dist ./dist
COPY --from=build --chown=bun:bun /app/apps/web/dist /app/apps/web/dist
USER bun
EXPOSE 8080
CMD ["bun", "--no-install", "dist/index.js"]
