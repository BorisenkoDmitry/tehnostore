# Phone Store

Independent installation of the verified release15k code, with a full copy of the original texno_medusa database and local media.

Start: docker compose up -d
Storefront: http://localhost:8000/ru
Admin: http://localhost:9000/app

Secrets, backups and verification evidence live in ignored .local/ and .env. The original installation and volumes are preserved. SOURCE-PROVENANCE.json records the verified source.

## Storefront production runtime

The storefront service runs a compiled Next.js production build with NODE_ENV=production, as the node user, without source bind mounts or dev/HMR. Backend and database keep their previous runtime configuration.

To rebuild after source changes:

```powershell
docker compose build storefront
docker compose up -d --no-deps storefront
```

Open http://localhost:8000/ru. Runtime verification is stored privately in .local/storefront-production/runtime-verification.json.
