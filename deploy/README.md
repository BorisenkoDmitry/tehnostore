# Production phone-store deployment

Repository: https://github.com/BorisenkoDmitry/tehnostore.git
Domain: https://tehnostore.dmitriy-borisenko.ru

The server release uses Compose project phone-store-production and a separate PostgreSQL database phone_store_production_20261109. Its named volumes are independent of the former tehnostore-production stack. The gateway joins the existing external coolify network under the unique alias phone-store-production-gateway. Only deploy/traefik.yaml's one-domain route is switched; the shared reverse proxy and other projects are not restarted.

Keep real secrets in a protected server-only env file outside the checkout. Use .env.production.template as a variable-name reference; never commit secrets, dumps, uploaded media or private files. Set PUBLIC_URL to the domain above, BACKEND_BOOTSTRAP_PORT=9012, GATEWAY_DEBUG_PORT=3118, IMAGE_TAG to the Git revision and NEXT_PUBLIC_DEFAULT_REGION=ru.

Deploy sequentially: back up the old stack; build backend; start only new PostgreSQL/Redis; restore the reviewed local phone-store dump into the new empty DB as medusa_app; restore static/private media; compare all table counts and row digests with the source; run required migrations; start backend; build storefront against that backend; start storefront/gateway; validate HTTP and API behavior; switch only this domain; stop the five exact old store containers. Preserve old volumes and the old route for rollback. Never use down -v or any global Docker prune/stop command.

On Linux, the storefront build needs host networking to reach the loopback bootstrap backend at http://127.0.0.1:9012. Use a temporary Compose build override with network: host and entitlement network.host, then buildx bake --allow=network.host. This address is build-only; runtime server calls use http://backend:9000. Backend and storefront both run compiled production code as the node user, with no source mounts. Persist PostgreSQL, public static media, uploads and private_files together.
