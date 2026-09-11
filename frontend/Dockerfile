FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .

# URL de l'API backend — passée au build Vite via --build-arg
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# ── Carte interactive (Next.js, export statique servi sous /carte) ──
FROM node:22-alpine AS carte
WORKDIR /carte

COPY carte/package*.json ./
RUN npm ci --no-audit --no-fund

COPY carte/ ./

# URL publique de la carte (métadonnées, sitemap, liens de partage)
ARG CARTE_SITE_URL=https://protect.mysimassurances.com/carte
ENV NEXT_PUBLIC_SITE_URL=$CARTE_SITE_URL
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ── Image de production avec nginx ──
FROM nginx:stable-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY --from=carte /carte/out /usr/share/nginx/html/carte
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
