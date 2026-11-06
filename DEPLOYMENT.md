# Production deployment

Deployed on 6 November 2026 under the user-authorized release.

- Repository: https://github.com/BorisenkoDmitry/tehnostore.git (origin/main). Official starter history retained as upstream.
- Storefront: https://tehnostore.dmitriy-borisenko.ru (localized homepage /se).
- Admin: https://tehnostore.dmitriy-borisenko.ru/app. Existing administrator login and password are unchanged.
- Release directory: /opt/tehnostore/releases/4942a92. Frontend image tag 9cff9ea includes the final focus fix. Backend image was built at 4942a92 and reused unchanged under tag 9cff9ea. The current symlink points to this release directory; Git HEAD may include later report/documentation-only updates.
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
- Swiper replacement regression: native autoplay advances, survives manual selection and loops from the last slide to the first; mobile CTA-to-artwork spacing stays within 36px. Phone/tablet fullscreen menu transitions into fullscreen catalog; desktop catalog narrows the page without horizontal overflow.
- Menu focus transfers and Escape return were regression-tested without aria-hidden focus warnings. Desktop and mobile screenshots were inspected. Lazy story images load when scrolled into view. No JavaScript exceptions in the acceptance run.
- Adjacent running services with Docker health checks remained healthy. Store backend/storefront logs had no fatal/error/5xx entries during the release audit.

The reproducible browser scenario is [deploy/verify-storefront.js](deploy/verify-storefront.js). The starter contains no original unit/integration test specifications, so this release uses build/type/lint checks plus API and browser acceptance tests. These checks do not establish real-device frame-rate guarantees or validate live payments.

## Current product scope

Homepage/catalog products use a small source snapshot for visual preview. Buy opens a preview dialog; fixture products are not added to a real Medusa cart. Live import from InSales CSV, actual stock/prices, payments, navigation-to-category links and story-content editing in Admin remain future work. Only navigation currently comes from the custom admin editor.

The hero uses transparent responsive WebP artwork over CSS blue backgrounds. The desktop composition is constrained below the header; the first mobile artwork is about 41 KB. Swiper React now owns the cover transition, gestures, looping and playback; the former custom wave/timer implementation has been removed. The sticky header uses an intersection observer without rerendering the navigation tree on every scroll. Autoplay is configured through Swiper; overlay/keyboard-focus/reduced-motion states stop it. There are no custom page-scroll or touch scheduling handlers in the hero.

Server storage figures are a timestamped read-only inventory, not an additive billing total: image sizes include shared layers; data directories, bind mounts and named volumes can overlap. No global Docker prune was performed.

The server report groups /opt projects by their complete /opt/<name> roots, including older releases and backups, while Coolify paths retain their exact working directories. The image metadata of the adjacent invix MinIO container is unavailable to Docker inspect; its project image subtotal is explicitly a lower bound, not zero.

## Swiper replacement

The user requested replacing the custom slider while preserving the design. Installed swiper 14.4.0 with pnpm 10.11.1, imported React components and only Autoplay/A11y/EffectCreative modules. Custom seven-second timers and swipe handlers were deleted; the interval is now a Swiper option. Branded desktop composition and lower-left selector remain. User-requested visual changes: artwork scale 1.1, static radial blue highlight behind the devices, and mobile flow with 24px CTA-to-picture-box spacing. TypeScript, changed-file lint, SSR panel/H1 checks and the expanded browser acceptance scenario passed locally before release.
