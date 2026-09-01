FROM oven/bun:1.4.0-slim AS build
WORKDIR /workspace
COPY . .
RUN bun install --frozen-lockfile
RUN bun run --filter @app/backend build

FROM node:24-bookworm-slim AS node-runtime
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg libreoffice-impress fonts-noto-cjk \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /workspace
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/apps/backend/node_modules ./apps/backend/node_modules
COPY --from=build /workspace/apps/backend/dist ./apps/backend/dist
COPY --from=build /workspace/apps/backend/package.json ./apps/backend/package.json
WORKDIR /workspace/apps/backend
EXPOSE 8787
CMD ["node", "dist/main.js"]

FROM oven/bun:1.4.0-slim AS bun-runtime
USER root
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg libreoffice-impress fonts-noto-cjk \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /workspace
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/apps/backend/node_modules ./apps/backend/node_modules
COPY --from=build /workspace/apps/backend/dist ./apps/backend/dist
COPY --from=build /workspace/apps/backend/package.json ./apps/backend/package.json
WORKDIR /workspace/apps/backend
USER bun
EXPOSE 8787
CMD ["bun", "dist/main.js"]
