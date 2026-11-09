# Store split verification — 2026-11-09

Created independent projects in `G:\WorkSpace\магазины\template` and `G:\WorkSpace\магазины\phone-store`.

The source code was the verified release15k snapshot, not a reconstruction from the old phone-store image. All 786 source-manifest entries match in the original project and the new phone project. The template retains all 18 custom module migration files byte for byte.

## Phone store

- Compose: `phone-store`; PostgreSQL: `phone_store`; application image: `phone-store:release15k`.
- Storefront: http://localhost:8000/ru. Admin: http://localhost:9000/app. The restored administrator accounts/passwords remain the same; runtime JWT/cookie/database secrets are new.
- The database came from the original `texno-medusa-postgres-1 / texno_medusa`, not a clothing/remediation test database.
- All 165 tables matched by row count and content digest before migrations. After migrations, the only changed table is `script_migrations` (8 → 10 records). Products, variants, prices, stock, customers, orders, authentication, content, navigation and settings retain their original digests.
- Counts include archived records: 1,188 products; 1,281 variants; 1,973 prices; 1,277 inventory items; 1,273 inventory levels; 4 customers; 5 orders. The public API exposes 1,172 published products and 107 categories in RUB.
- Zero foreign-key violations and zero active logical-link orphans. The historical soft-deleted links already present in the source were preserved without cleanup.
- All three local media files match their backup SHA-256 values. Existing remote product-image URLs remain unchanged. The historical private CSV returns HTTP 404 publicly.
- Only the four exact old phone-store containers listed in delivery-summary.json were stopped. Original containers, PostgreSQL/Redis volumes and the source directory are retained. Other projects were not stopped.

## Regression

Tests ran on an independent restore clone, `cms-remediation-restored-20261109 / cms_remediation_restored_20261109`. The delivered phone database has no synthetic test writes. The clone received synthetic catalog axes/category and native pickup configuration to meet the suite's explicit fixture prerequisites. A private QA adapter expands category lookup from 100 to 1,000; it does not modify application code or the source manifest.

- Backend: 270 unit tests; 11 module integration tests — PASS.
- Smoke: 4; inventory/security/catalog/access API checks: 147 — PASS.
- The API runner's single F6 BLOCKED entry is retained. Independent F6 log verification passed: 7/7 proxy requests, zero secret-marker matches in backend or proxy.
- Durable checkout/compensation/retry: 22 — PASS on release15k in this clone.
- Production browser checks: 41; browser plus independent SQL/interface checks: 50 — PASS.
- Actual phone storefront checked at 1440×1000 and 390×844: one H1, no mobile horizontal overflow.

Earlier diagnostic attempts are retained in the original project's output directory. The first browser run used a dev server and stopped on two hydration-timing waits; the final browser run uses a dedicated production QA build, as did the original verified setup. No failed draft was manually deleted to obtain a passing result.

## Clean template

No database dump, .env secrets, .local directory, imported products, customers, orders, branded artwork, merchant navigation/content payloads or business seed commands are included. Merchant delivery/service presets are empty; the previous test inputs were moved into a synthetic test-only fixture. Existing API names and CSS identifiers are retained for compatibility.

Fresh-image backend/admin build, Next.js production build, 270 unit tests, and blank-database migrations/startup passed. Blank database counts are zero for products, variants, prices, customers, orders, CMS pages/settings/navigation, catalog profiles and definitions. The backend build retains 99 existing lint warnings and no lint errors.

The storefront requires the new merchant to configure regions, a sales channel/publishable API key and published home content. It intentionally inserts no demo merchant data. See the template README. Production infrastructure was syntax-validated; no public-domain deployment was performed.

## Backups and rollback

The immutable original dump, source/target audits and media hashes are under `.local/backups/20261109-original`; regression evidence is under `.local/verification-results`. Keep these private and out of Git. Original source volumes `texno-medusa_postgres_data` and `texno-medusa_redis_data` were never deleted or reused.

To roll back locally, stop only `phone-store`, then start the original four `texno-medusa-*-1` containers. Their original database and original .env remain available. Do not run both applications on the same host ports.

## Follow-up: stale customer sessions

The first post-migration browser issue exposed an uncovered stale-cookie case: the new backend rejected the old customer JWT, and the authenticated cart lookup propagated HTTP 401 into the public storefront. This is now fixed in both phone-store and template. Public requests without a customer cookie perform no customer-session lookup. Invalid customer cookies are removed from both the current request and browser response; independent guest-cart capabilities are retained. Authenticated cart reads also treat 401/403 as signed out. Unexpected server failures remain distinguishable.

Verification: 9 focused component/middleware tests passed; production storefront compilation passed; real-browser requests as a new visitor and with an invalid old session both returned 200. The browser removed the invalid auth cookie while preserving a guest-cart capability. No business database mutation was made. The storefront image is phone-store:release15k-sessionfix1. The initial 786-file equality above describes the delivered migration baseline; this follow-up changes the two existing files and adds the helper/test recorded in SESSION-RECOVERY-PROVENANCE.json. The original verified project remains untouched.

## Follow-up: production storefront runtime

At the user's request, only the storefront was switched to a compiled Next.js production image, phone-store-storefront:production-sessionfix1. It runs next start with NODE_ENV=production as the node user, has no source mounts, and passes the robots.txt HTTP healthcheck. Backend, PostgreSQL and Redis container IDs/start times were checked and remain unchanged. The Dockerfile reuses the verified dependency cache and builds with the frozen lockfile and existing patches. No public-domain deployment or database migration was performed. See README for repeatable rebuild/start commands.
