FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ── Image de production ──
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npx prisma generate

COPY --from=builder /app/dist ./dist

EXPOSE 4000
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && node dist/src/seed.js && node dist/src/index.js"]
