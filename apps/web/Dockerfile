FROM node:22-bookworm-slim AS builder

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY apps/desktop/package.json apps/desktop/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/db/package.json packages/db/package.json

RUN pnpm install --frozen-lockfile --ignore-scripts

COPY apps/web apps/web
COPY apps/desktop apps/desktop
COPY packages/shared packages/shared
COPY packages/db packages/db

# Extract version from root package.json and inject into client build via Vite's define
RUN VITE_APP_VERSION=$(node -p "require('./package.json').version") \
    pnpm rebuild esbuild && \
    VITE_APP_VERSION=$VITE_APP_VERSION pnpm --filter @prompthub/web build

FROM node:22-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV DATA_DIR=/app/data

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/db/package.json packages/db/package.json

RUN pnpm install --prod --frozen-lockfile

COPY --from=builder /app/packages/shared/types packages/shared/types
COPY --from=builder /app/packages/shared/constants packages/shared/constants
COPY --from=builder /app/packages/db/src packages/db/src
COPY --from=builder /app/apps/web/dist apps/web/dist

WORKDIR /app/apps/web

EXPOSE 3000
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"]

# Read version from package.json at startup and expose as APP_VERSION
CMD ["node", "-e", "process.env.APP_VERSION=require('/app/package.json').version; require('./dist/server/index.js')"]
