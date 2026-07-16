FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache python3 make g++
RUN npm install -g pnpm@9.15.0
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
# patchedDependencies in root package.json references patches/ - pnpm hashes these
# files during install, so they must exist in the build context or the install fails.
COPY patches ./patches/
COPY packages/shared/package.json ./packages/shared/
COPY apps/server/package.json ./apps/server/
RUN pnpm install --frozen-lockfile
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared/
COPY apps/server ./apps/server/
RUN pnpm --filter @stashbro/shared build
RUN pnpm --filter @stashbro/server build

FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache python3 make g++
RUN npm install -g pnpm@9.15.0
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
# patchedDependencies in root package.json references patches/ - pnpm hashes these
# files during install, so they must exist in the build context or the install fails.
COPY patches ./patches/
COPY packages/shared/package.json ./packages/shared/
COPY apps/server/package.json ./apps/server/
RUN pnpm install --frozen-lockfile --prod
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/server/dist ./apps/server/dist
RUN addgroup -S app && adduser -S app -G app && mkdir -p /data && chown app:app /data
VOLUME /data
ENV DB_PATH=/data/stashbro.db
ENV PORT=3000
EXPOSE 3000
USER app
CMD ["node", "apps/server/dist/index.js"]
