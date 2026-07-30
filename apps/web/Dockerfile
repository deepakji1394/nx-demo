# ---- deps ----
FROM node:22-slim AS deps
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@10.18.1 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile

# ---- build ----
FROM node:22-slim AS build
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@10.18.1 --activate
COPY --from=deps /repo/node_modules ./node_modules
COPY . .
# next.config.js's rewrites() reads process.env.API_URL; for standalone output
# Next.js resolves rewrites at build time and freezes them into the build, so
# API_URL must be present here too (not just at container runtime) or the
# /api/py/* proxy destination will be baked in as the localhost fallback.
ARG API_URL=http://api:8000
ENV API_URL=$API_URL
RUN pnpm exec nx build web

# ---- runner ----
FROM node:22-slim AS runner
WORKDIR /repo
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
