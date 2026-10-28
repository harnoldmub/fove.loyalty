# FOVE Web (Next.js, sortie standalone). Contexte de build : racine du monorepo.
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY . .
# Variables lues au build (URL publique du site pour les métadonnées de partage).
ARG NEXT_PUBLIC_SITE_URL=https://fove.digital
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL NEXT_TELEMETRY_DISABLED=1
RUN pnpm install --frozen-lockfile \
 && pnpm --filter @fove/widget build \
 && pnpm --filter @fove/web... build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0
WORKDIR /app
RUN addgroup -S fove && adduser -S fove -G fove
COPY --from=build --chown=fove:fove /app/apps/web/.next/standalone ./
COPY --from=build --chown=fove:fove /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=fove:fove /app/apps/web/public ./apps/web/public
USER fove
EXPOSE 5290
CMD ["node", "apps/web/server.js"]
