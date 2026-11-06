# Production deployment

Run commands from `commerce/`. This stack is separate from `compose.yaml` and uses its own named data volumes. It requires Docker Compose/BuildKit and an existing external Docker network named `coolify`.

1. Copy `.env.production.template` to `.env.production.local` on the server. Fill independent random hex database/session secrets and the restored store's publishable key. Restrict the env file to the deployment account. Do not print or commit its contents.
2. Validate with `docker compose --env-file .env.production.local -f compose.production.yaml config --quiet`. Build sequentially to limit memory: `COMPOSE_PARALLEL_LIMIT=1 docker compose --env-file .env.production.local -f compose.production.yaml build backend`.
3. Start only infrastructure: `docker compose --env-file .env.production.local -f compose.production.yaml up -d postgres redis`. Restore the reviewed database backup **before starting the application**, retaining application ownership (`medusa_app`), admin password hashes, navigation, catalog, regions and publishable-key links. Copy any local uploaded files into the corresponding persistent volumes. The existing initialization script creates `medusa_app` only when PostgreSQL's volume is empty; changing env passwords does not rotate an existing database role.
4. Run required migrations once against the restored database: `docker compose --env-file .env.production.local -f compose.production.yaml run --rm --no-deps backend node /server/apps/backend/node_modules/@medusajs/cli/cli.js db:migrate --skip-scripts`. Review any new data migrations separately; skipping scripts avoids replaying demo seeds. Start the backend with `docker compose --env-file .env.production.local -f compose.production.yaml up -d --no-build backend`. Check `http://127.0.0.1:9002/health`.
5. Build the storefront against this running backend, then start storefront/gateway. A Next build performs real region/product requests and must use the matching publishable key. On Docker Desktop, `MEDUSA_BUILD_BACKEND_URL=http://host.docker.internal:9000` reaches the existing local dev backend. **On Linux, a host-gateway alias cannot reach a port bound only to 127.0.0.1.** Either route the public domain's backend paths to the bootstrap backend first, or use the temporary host-network build override below with `MEDUSA_BUILD_BACKEND_URL=http://127.0.0.1:9002`.

```yaml
# Temporary file outside Git, e.g. /tmp/tehnostore-build.override.yaml
services:
  storefront:
    build:
      network: host
```

```sh
COMPOSE_PARALLEL_LIMIT=1 docker compose --env-file .env.production.local \
  -f compose.production.yaml -f /tmp/tehnostore-build.override.yaml build storefront
docker compose --env-file .env.production.local -f compose.production.yaml up -d --no-build
```

The build URL is used only as `MEDUSA_INTERNAL_BACKEND_URL` during compilation. Runtime server requests use `http://backend:9000`; browser requests and canonical URLs use `PUBLIC_URL`. Public Next variables are compiled into browser bundles: rebuild when the domain, publishable key or default region changes. Next production builds validate TypeScript and use two page-generation workers. Run heavy builds sequentially; the 4 GiB Node heap cap is not a limit on total container memory.

Coolify's existing Traefik terminates TLS. Its dynamic router for `tehnostore.dmitriy-borisenko.ru` should use the `https` entrypoint, `letsencrypt` certificate resolver and service `http://tehnostore-gateway:80`; redirect its `http` router to HTTPS. Only the gateway joins `coolify`. Nginx forwards backend paths `/store`, `/admin`, `/auth`, `/app`, `/static`, `/uploads`, `/health`, and sends other paths to Next. Local ports `3108` (gateway) and `9002` (backend bootstrap) bind only to loopback; PostgreSQL and Redis have no published ports.

`DATABASE_URL` explicitly includes `?sslmode=disable` for private Docker PostgreSQL. Installed Medusa 2.22.3 recognizes this flag and disables its otherwise automatic remote-host SSL default, so no production-only source edit is needed. Keep PostgreSQL private. App processes run as the unprivileged `node` user; persistent asset volumes inherit that ownership on first creation.

Before switching traffic, verify Compose health, HTTPS certificate/domain, homepage, nested catalog navigation, product page, `/app` login, Store API responses with the publishable key, and a 401 from unauthenticated `/admin/navigation`. Back up PostgreSQL and uploaded files before upgrades. Retain the previous image tag for rollback. Never use `down -v` on this stack.
