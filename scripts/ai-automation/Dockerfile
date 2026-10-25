FROM node@sha256:e5bbac0e9b8a6e3b96a86a82bbbcf4c533a879694fd613ed616bae5116f6f243
ARG NODE_VERSION
ARG BUN_VERSION
ARG VITE_PLUS_VERSION
RUN test "$(node --version)" = "v${NODE_VERSION}"
RUN npm install --global "bun@${BUN_VERSION}"
RUN npm install --global "vite-plus@${VITE_PLUS_VERSION}" --ignore-scripts
RUN test "$(bun --version)" = "${BUN_VERSION}"
USER node
WORKDIR /tmp
ENTRYPOINT ["node", "/control/sandbox.ts"]
