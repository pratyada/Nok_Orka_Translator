FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/

RUN npm install --workspace=packages/shared --workspace=packages/server

COPY packages/shared/ packages/shared/
COPY packages/server/ packages/server/
COPY tsconfig.base.json ./

RUN npm run build -w packages/shared && npm run build -w packages/server

FROM node:20-alpine

WORKDIR /app
COPY --from=builder /app/packages/shared/dist packages/shared/dist
COPY --from=builder /app/packages/shared/package.json packages/shared/
COPY --from=builder /app/packages/server/dist packages/server/dist
COPY --from=builder /app/packages/server/package.json packages/server/
COPY --from=builder /app/package.json ./

RUN npm install --workspace=packages/shared --workspace=packages/server --omit=dev

EXPOSE 3001

CMD ["node", "packages/server/dist/server.js"]
