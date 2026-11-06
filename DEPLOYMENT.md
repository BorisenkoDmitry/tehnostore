# Deployment handoff

User-provided destination, saved on 6 November 2026:

- Git repository: https://github.com/BorisenkoDmitry/tehnostore.git
- Public storefront: https://tehnostore.dmitriy-borisenko.ru
- The user reports that DNS points to their server and SSH access is already configured globally.

Deployment is deferred until the user's explicit command. Do not push, change remotes, restart services, or deploy merely because this document exists. The local origin still points to the official Medusa DTC starter. On deployment, preserve that source as an upstream remote and use the user's repository as the destination after inspecting its contents.

Before publishing, inspect the existing SSH configuration and server layout without printing credentials. Confirm the target directory, ports, reverse proxy, TLS certificate and database/storage volumes. Build and validate the production backend/admin and storefront. The current Compose setup is for local development, with polling and source mounts; prepare a production configuration with persistent storage and server-only secrets. Do not publish local environment files or admin credential files.

## Current homepage preview

Homepage sections use the approved shared container: hero, benefits, four popular source products, three accessory collections, the complete merchant story and a separate section showing three of nine source reviews, with All reviews linking to /page/reviews. The single H1 is in the merchant story. Horizontal liquid slide selectors replace the lower-left caption. Autoplay remains seven seconds.

The snapshot in `apps/storefront/src/modules/home/data/source-preview.json` is explicitly a visual preview, captured from texno.store on 6 November 2026. Local WebP assets live in `public/images/home`. The extraction script is `../tools/build_home_preview.py`. The source product URLs and category URLs are retained in the snapshot for later mapping.

`/catalog` shows the small unfiltered preview dataset. The three accessory shortcuts use a category query parameter to demonstrate the same listing template. Preview catalog routes are noindex. Buy buttons open an honest preview dialog; they do not create Medusa carts or orders. Replace the preview data with Medusa products, variants, live prices and availability after the InSales CSV is provided and mapped. Do not publish snapshot discounts or purchase availability as live inventory.

All merchant story wording and source review dates, ratings and text are retained. No aggregate rating or invented testimonials were added. The commercial claims are supplied merchant copy and need the owner's final approval before production publication.

## Local checks completed

The user reauthorized browser inspection after noticing an oversized image. Added positioned, dimensioned media wrappers and checked the rendered layout at 390px, 768px and 1440px, including a narrowed desktop canvas with the catalog open. No horizontal page overflow or images wider than the canvas were detected. Verified the Buy preview dialog, the review preview (subsequently changed to a link to the separate nine-review page), the six-item unfiltered catalog and the charging-category shortcut. Changed TypeScript/TSX files passed ESLint. No Docker images were rebuilt, no containers restarted, no Git remotes changed and no server deployment performed.

Latest presentation changes: the merchant story now uses a single ordinary HTML flow rather than special split layouts. Its two images are newly generated editorial illustrations stored locally as optimized WebP, not source SKU photos. Homepage reviews show one card per swipe on mobile; the All reviews link continues to the separate page.

The second story illustration was revised to a wide shot showing the whole phone with generous margins, replacing the rejected macro composition. Both current images use their natural wide aspect ratio. Mobile browser checks at 390px confirmed a one-card-wide review viewport, successful horizontal touch movement and snap to the next card, and continued vertical page scrolling on a vertical touch gesture. No page-wide horizontal overflow was detected. Changed story files passed ESLint without warnings.

Latest store-story layout: alternating desktop text/image pairs with equal-height image cells; phone/tablet stacks below 900px available width. Browser measurement confirmed both image cells equal their 316px text columns; temporarily increasing text grew the first image cell to the same 484px, then the temporary content was removed. The full copy and original article order are retained. No Docker restart or rebuild was performed.

Product preview dialog actions: below the existing preview notice, Go to cart links to the localized /cart route with a blue filled button. Continue shopping is a background-free action that closes the dialog and preserves the current page. The card Buy button is unchanged. Fixture products still are not added to Medusa carts; the existing preview notice remains visible.

Latest preview action styling supersedes the blue-button draft: both actions sit in one horizontal flex row. Go to cart reuses texno-primary-button, including the hero dark background, white pointer-origin circular hover fill and optical label alignment. Continue shopping remains background-free and closes the dialog. Secondary text may wrap on narrow phones to keep both actions inside the same row without overflow.

Latest shared button behavior: hero and cart CTA use the StoreButton component. The cart CTA has a cobalt circular fill and white text, while the hero retains its light fill. The circle diameter is calculated to reach every corner from the pointer entry point; the underlying hover background takes the fill color after the reveal to avoid dark edge remnants. Popup actions remain in one row above 400px viewport width, and stack at full width at 400px and below. Browser checks at 401, 400, 375 and 320px confirmed the breakpoint and no action-row overflow; blue hover background, fill and white label were verified.

Popup close control: the dialog shell is non-scrolling; a padded inner scroll area contains the product details. The close button sits outside that area at the shell top-right. Browser check at 375×600 confirmed 142px internal scrolling without any change to the close button position, and the button still closed the modal. This fixes the previously unimplemented mobile close-button request; the action-button breakpoint had already been applied successfully.
