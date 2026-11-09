# Medusa Admin 2.22.3 product modal compatibility patch

`@medusajs__framework@2.22.3.patch` secures the early static/access-log handlers.
It redacts capability paths and removes query/header content before either
Morgan serialization path. Static only serves passive raster extensions,
rejects private prefixes (including historical exports), disables directory
redirects/indexes and sets nosniff/sandbox. Application middleware cannot guard
this earlier mount. `framework-logging-security.cjs` is the canonical helper
source included verbatim in the patch. Revalidate against a clean package when
upgrading. The secure file provider and authenticated private endpoint live in
the application; see `qa/SECURITY.md` for storage and regression requirements.

`@medusajs__dashboard@2.22.3.patch` fixes duplicate nested route mounting in the native product list. Both `ProductListTable` implementations render an `Outlet`. Their enclosing `LayoutComposer` also renders an outlet by default. Opening Create Product therefore mounts two live modals, which hide each other from assistive technology.

The patch passes the documented `hasOutlet: false` option to the product list composer, retaining the table's original outlet. It changes the published ESM and CommonJS entry points only and is applied by pnpm's version-pinned `patchedDependencies`, without editing installed packages. Native Create Product and all other product list nested routes continue to use Medusa's own forms, validation and workflows.

When updating Medusa, verify whether the upstream product list has removed its extra outlet. Remove this patch only after checking that Create Product, import and export mount once and remain keyboard accessible in both development and a production Admin build.

Reference: https://docs.medusajs.com/resources/admin-components/components/layout-composer

The patch groups the permitted Admin menu entries into Sales, Catalog, Pricing and promotions, Storefront, and Settings. Collections appear in Catalog alongside the catalog builder. The builder toolbar links to import and recovery, and the Orders and Customers lists link to their respective advanced search views. Grouping changes sidebar entries while retaining their routes and permissions. The sidebar and workspace palette is scoped to the Admin shell. To restore the original sidebar and the legacy CMS controls in a browser, use **Импорт и служебные разделы → Показать прежние разделы** on `/app/catalog-constructor`. This changes the browser-local key `catalog-constructor:legacy-admin` and reloads Admin. The same control reverses it.

Revalidate both the CommonJS app and the ESM sidebar chunk when upgrading Medusa. The compiled file name is pinned to 2.22.3.

The dashboard patch also passes the TanStack page setter to its shared list and tax pagination components. The matching `@medusajs__ui@4.2.10.patch` exposes that setter in `DataTable` and adds numbered buttons and direct page entry to `Table.Pagination`. Older dashboard tables also expose their supported sort keys in matching column headers, and Inventory offers creation date in the sort menu. When upgrading, check a configurable list and a list using the older dashboard table in both ESM and CommonJS builds.

`@medusajs__medusa@2.22.3.patch` guards the stock-location name preprocessor before calling `trim()`. The published create/update validators call `trim()` on arbitrary input, causing an invalid numeric name to return HTTP 500. The patch leaves non-string values to Zod, which returns the expected HTTP 400, while preserving string trimming and all native workflows. Verified on a disposable stock-location fixture in an isolated restored database.

The dashboard patch also fixes the Edit, Claim and Exchange wizard initialization lifecycle (F12). Each mounted wizard remembers the order IDs it has already initialized or resumed. A preview invalidation after cancel/confirm can no longer initialize a replacement draft before navigation finishes. The patch includes the published source, ESM route chunks and CommonJS bundle. `node apps/backend/scripts/test-dashboard-remediation.cjs` executes all three forms against 20 preview races per wizard in each distribution format; it fails against an unpatched package. Real browser submits and independent database checks are implemented separately in `qa/ui` and `qa/suites/interfaces.cjs`.

Product import (F17) uses TanStack `mutate` for event handlers whose errors are already handled by the mutation callbacks. This retains the form error notification/reset and subsequent upload while preventing `mutateAsync` from leaving a rejected event-handler promise. Confirmation follows the same contract. A clean pnpm install must apply this version-pinned patch; testing a modified temporary package is only a development diagnostic.
