# FOVE API (NestJS). Contexte de build : racine du monorepo.
FROM node:22-alpine AS build
RUN corepack enable && apk add --no-cache openssl
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile \
 && pnpm --filter @fove/api... build

FROM node:22-alpine AS runtime
RUN corepack enable && apk add --no-cache openssl tini
ENV NODE_ENV=production
WORKDIR /app
# Les dépendances de l'espace de travail restent liées : on conserve l'arbre
# installé (CLI Prisma comprise, nécessaire au pre-deploy `migrate deploy`).
COPY --from=build /app /app
RUN addgroup -S fove && adduser -S fove -G fove && chown -R fove:fove /app
USER fove
EXPOSE 5291
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:${PORT:-5291}/api/health || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/api/dist/main.js"]
