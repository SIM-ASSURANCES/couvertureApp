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

# Chromium système pour puppeteer-core (génération PDF des contrats, texte
# réel plutôt qu'une image) — puppeteer-core n'embarque pas son propre binaire.
RUN apk add --no-cache chromium nss freetype freetype-dev harfbuzz ca-certificates ttf-freefont
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npx prisma generate

COPY --from=builder /app/dist ./dist

EXPOSE 4000
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && node dist/src/seed.js && node dist/src/index.js"]
