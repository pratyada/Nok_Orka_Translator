FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/app/package.json packages/app/

# Install deps for shared, server, and the web frontend
RUN npm install \
  --workspace=packages/shared \
  --workspace=packages/server \
  --workspace=packages/app

COPY packages/shared/ packages/shared/
COPY packages/server/ packages/server/
COPY packages/app/ packages/app/
COPY tsconfig.base.json ./

# Build shared lib, server, and the Vite web frontend
RUN npm run build -w packages/shared \
  && npm run build -w packages/server \
  && npm run build -w packages/app

FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/packages/shared/dist packages/shared/dist
COPY --from=builder /app/packages/shared/package.json packages/shared/
COPY --from=builder /app/packages/server/dist packages/server/dist
COPY --from=builder /app/packages/server/package.json packages/server/
# Ship the built web UI where the server looks for it (packages/server/webapp)
COPY --from=builder /app/packages/app/dist packages/server/webapp
COPY --from=builder /app/package.json ./

RUN npm install --workspace=packages/shared --workspace=packages/server --omit=dev

EXPOSE 3001

CMD ["node", "packages/server/dist/server.js"]
