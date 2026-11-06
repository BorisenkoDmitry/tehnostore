# Production deployment

Deployed on 6 November 2026 under the user-authorized release.

- Repository: https://github.com/BorisenkoDmitry/tehnostore.git (origin/main). Official starter history retained as upstream.
- Storefront: https://tehnostore.dmitriy-borisenko.ru (localized homepage /se).
- Admin: https://tehnostore.dmitriy-borisenko.ru/app. Existing administrator login and password are unchanged.
- Release directory: /opt/tehnostore/releases/4942a92. Image tag 4942a92 contains the application merge. Later commits update deployment tools and documentation only.
- Compose project: tehnostore-production. Backend, storefront, gateway, PostgreSQL and Redis have health checks.
- TLS: existing Coolify Traefik file-provider route, Let's Encrypt resolver. Valid certificate issued; initial expiry 4 February 2027. Resolver manages renewal.

## Runtime and data

Production runs compiled Medusa/Admin and Next, without development servers or source mounts. Fresh production secrets are stored only on the server in the protected shared env file. The database was restored into a separate new PostgreSQL database, preserving the admin password hash, seven main navigation entries, 107 catalog nodes, regions and four native demo products. Database migrations and search-index checks completed successfully. The private initial database backup is retained separately under /opt/tehnostore/backups.

Only the gateway joins the external coolify network. PostgreSQL/Redis have no public ports. Bootstrap backend and debug gateway ports are bound to loopback. The existing reverse proxy and unrelated services were not restarted. Instructions and rollback precautions: [deploy/README.md](deploy/README.md).

## Release validation

- Backend/Admin production builds, backend lint and admin TypeScript check passed.
- Next production build and strict TypeScript check passed; type errors are not ignored.
- All five production containers reported healthy.
- Trusted HTTPS verified with hostname and chain validation; homepage, catalog, reviews, cart, account and admin paths return HTTP 200.
- Store API returns navigation and products. Unauthenticated Admin API returns 401. Administrator login, cookie session and saving the unchanged navigation payload passed.
- Public-browser regression passed: all four slide compositions avoid header/text overlap; one H1; no trailing slide-title periods; mobile preview buttons stack at 400px and below; close control remains outside the scrolling content; Continue shopping closes the dialog; mobile reviews show one card; All reviews links to the separate page.
- Autoplay regression: continuous scrolling beyond the seven-second interval postpones a change; it resumes after scrolling settles. Phone/tablet fullscreen menu transitions into fullscreen catalog; desktop catalog narrows the page without horizontal overflow.
- Desktop and mobile screenshots were inspected. Lazy story images load when scrolled into view. No JavaScript exceptions in the acceptance run.
- Adjacent running services with Docker health checks remained healthy. Store backend/storefront logs had no fatal/error/5xx entries during the release audit.

The reproducible browser scenario is [deploy/verify-storefront.js](deploy/verify-storefront.js). The starter contains no original unit/integration test specifications, so this release uses build/type/lint checks plus API and browser acceptance tests. These checks do not establish real-device frame-rate guarantees or validate live payments.

## Current product scope

Homepage/catalog products use a small source snapshot for visual preview. Buy opens a preview dialog; fixture products are not added to a real Medusa cart. Live import from InSales CSV, actual stock/prices, payments, navigation-to-category links and story-content editing in Admin remain future work. Only navigation currently comes from the custom admin editor.

The hero uses transparent responsive WebP artwork over CSS blue backgrounds. The desktop composition is constrained below the header; the first mobile artwork is about 41 KB. The wave reveal uses CSS instead of a per-frame JavaScript SVG mask. The sticky header uses an intersection observer without rerendering the navigation tree on every scroll. Autoplay pauses its scheduling during active scrolling, overlays and hidden-page conditions.

Server storage figures are a timestamped read-only inventory, not an additive billing total: image sizes include shared layers; data directories, bind mounts and named volumes can overlap. No global Docker prune was performed.
