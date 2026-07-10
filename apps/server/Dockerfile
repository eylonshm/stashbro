FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache python3 make g++
RUN npm install -g pnpm
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
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
RUN npm install -g pnpm
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/server/package.json ./apps/server/
RUN pnpm install --frozen-lockfile --prod
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/server/dist ./apps/server/dist
VOLUME /data
ENV DB_PATH=/data/stashbro.db
ENV PORT=3000
EXPOSE 3000
CMD ["node", "apps/server/dist/index.js"]
