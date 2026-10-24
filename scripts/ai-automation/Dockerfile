FROM node:24.11.0-bookworm@sha256:e5bbac0e9b8a6e3b96a86a82bbbcf4c533a879694fd613ed616bae5116f6f243
RUN npm install --global bun@1.3.4
RUN npm install --global vite-plus@1.4.0 --ignore-scripts
RUN node -e 'const value = require("node:child_process").execFileSync("bun", ["-e", "console.log(Bun.version)"], { encoding: "utf8" }); if (value.trim() !== "1.3.4") throw new Error("Bun runtime unavailable")'
USER node
WORKDIR /tmp
ENTRYPOINT ["node", "/control/sandbox.ts"]
