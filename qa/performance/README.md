# Catalog performance and regression verification

This change optimizes the current `commerce` checkout. It does not deploy to the public store or synchronize other checkouts such as `phone-store`.

## Behavior

- Product metadata and page rendering share one request-scoped product fetch. No customer session or personalized response is shared between requests.
- Redis caches static product data, descriptions, categories, definitions, installation profile and model candidates for five minutes. Native entity events invalidate entries. Successful Admin mutation responses advance a shared cache generation before sending JSON. Reads begun before a save cannot repopulate the new generation.
- Calculated prices are explicitly uncached. Inventory availability and sales-channel authorization are checked on each product request. Category publication checks still run against the current reference generation.
- A private `catalog_variant_search` projection stores canonical public facet rows for products with multiple variants. One parameterized query finds impossible combinations, including three or more axes, before native search pagination. Product/status/channel scoping, sorting and facet processing remain in Medusa's Store search route.
- The first catalog result is rendered on the server using the same query/response helpers as browser navigation. Hydration reuses that result. A failed initial search falls back to the existing retry/error flow. Next.js retains its normal route-prefetch behavior.
- Search requests select card fields and request zero hits for facet-only queries.
- The pinned `@medusajs/search-postgres@2.22.3` patch merges positive equality conjuncts into one JSONB containment predicate. OR/NOT, absence/null, ranges, alternatives and conflicting scalar equalities retain their original semantics. This reduces repeated TOAST decompression while retaining the existing GIN index.

## Installation and migration

Use the pinned pnpm 10.11.1 and supported Node version, and install with `pnpm install --frozen-lockfile`. Installed packages must receive the version-pinned patch through pnpm; copying application source alone does not apply it.

Apply the generated catalog module migration before starting the new search middleware. Fill the projection before accepting traffic. The backfill is idempotent and does not change products, prices or stock.

For an existing populated installation, from `apps/backend`:

```sh
pnpm exec medusa db:migrate --skip-scripts
pnpm exec medusa exec src/migration-scripts/catalog-variant-search.ts
```

For a compiled production runtime whose working directory is `.medusa/server`, the backfill filename is `src/migration-scripts/catalog-variant-search.js`.

The legacy `initial-data-seed` in this checkout attempts to create starter regions again. A full migration command on the restored performance database reached that existing script and failed. The catalog schema migration and its backfill succeeded separately. Do not rerun the legacy seed against a populated store as part of this release. Other installation-specific migration scripts must be reviewed separately before deployment.

## Repeatable checks

The benchmark is a separate local Compose stack, using production builds and its own copy of the merchant database. Test writes are guarded by both `CATALOG_PERFORMANCE_TEST=1` and the database setting `catalog_performance.guard=catalog-performance-20261110`. Never set that guard on a live database.

Files:

- `scripts/benchmark-catalog.cjs`: the same seven HTTP cases before/after; three warmups, 20 measured requests, median and p95, response sizes and hashes.
- `scripts/test-search-containment.cjs`: executes the installed patched SQL and the pristine compiler reconstructed from the patch against PostgreSQL, checking 424 filter cases. No merchant rows are written.
- `scripts/diagnose-catalog-database.cjs`: read-only EXPLAIN/BUFFERS comparisons, connection counts, settings, table sizes and indexes for the guarded database.
- `src/lib/__tests__/catalog-performance.unit.spec.ts`: generation races, error handling, projection rules, shared browser/server queries, serialization and arbitrary attribute names, alongside the existing backend unit suite.
- `qa/performance/check.cjs`: actual Redis/module/workflow/handler tests for CMS create/update/delete/restore, product publication, channel isolation, price freshness, inventory freshness, category invalidation and SQL variant matching. Fixtures and changed values are restored in `finally` blocks.
- `qa/performance/browser-run.cjs before|after`: Playwright CLI checks and five reload measurements. Measures real product headings, excluding skeleton cards. External images are blocked equally in both runs; image loading is outside this performance change.

Browser checks cover server HTML, duplicate searches during hydration, search/empty results, pagination/history, opening a product and mobile overflow. `PLAYWRIGHT_CLI` can override the local CLI path.

## Measurement limits

Local production-build measurements are not production-server measurements. They do not include internet latency, real customer sessions, external image download time or sustained-load behavior. HTTP medians are sequential warm requests, not a concurrency/load test. The first request recorded in each case is not a guaranteed fully cold cache.

Server rendering moves search work into the catalog HTML response, so a longer catalog TTFB can accompany an earlier visible product list. Compare first real product appearance, not only HTML latency. Keep this tradeoff visible in the result report.

Redis and PostgreSQL should remain installation-specific. When upgrading Medusa, rebase or remove the search-provider patch only after rerunning SQL equivalence, CMS/inventory regression and browser checks.
