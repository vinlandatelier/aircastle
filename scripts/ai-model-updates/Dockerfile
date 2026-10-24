FROM node:24.11.0-alpine@sha256:f36fed0b2129a8492535e2853c64fbdbd2d29dc1219ee3217023ca48aebd3787
WORKDIR /tmp
COPY worker.mjs /worker.mjs
USER 65534:65534
ENTRYPOINT ["node", "--max-old-space-size=64", "/worker.mjs"]
