# TEXNO STORE storefront direction

Homepage extension: four exact popular products from the source homepage, an unfiltered preview catalog, three accessory shortcuts, the complete merchant story and a separate full-width review section. Original product photographs are optimized locally as WebP; no generated image substitutes for a SKU. One H1 belongs to the merchant story and carousel titles are H2. Cards use large isolated photos, restrained typography and compact Buy actions. The Buy action opens an explicitly labeled preview until real Medusa products are imported. Category previews share the same listing template. All new sections use texno-container. Reviews preserve source authors, dates, ratings and full text; three appear on the homepage and All reviews links to /page/reviews, which displays all nine reviews. Horizontal liquid slide selectors sit at the lower-left content edge instead of the old tagline. The currently approved hero, fonts and blue palette are preserved; no page-wide redesign or stock imagery is introduced.

Approved reference: full-bleed blue Lumixio hero, supplied by the user, with electronics replacing the portrait. Preserve the original TEXNO STORE SVG identity. Existing system sans-serif typography; Tailwind 3 remains in the project. Scoped storefront tokens live in src/styles/texno.css.

Blue photographic surface, white navigation and large, quiet left-aligned headline. Dark CTA and floating contact button. Product composition occupies the right on desktop and lower portion on mobile. No invented review counts, promotions or guarantees. The generated hero is illustrative, not a product SKU image.

Navigation comes from the custom Medusa navigation module. The catalog has an editable accordion tree seeded from the source site's navigation: Apple iPhone, Samsung, Xiaomi, Huawei Honor, accessories and sales. The source URLs are stored for later routing, while selecting a leaf currently shows a prepared-section state without navigating. Price, color, storage, diagonal, CPU core count and fingerprint filters are explicitly disabled previews. Product/category pages and actual filtering remain outside this stage.

Opening the catalog allocates space on the left: the main canvas width becomes the remaining viewport width and its left margin matches the catalog width, with 650ms exponential ease-out. The main canvas is not translated or clipped offscreen. Named inline-size container queries adapt the header, typography, hero and footer to their available width. Below 1200px viewport width, navigation uses a full-screen menu and full-screen catalog rather than narrowing the canvas. At 1200px and above, the existing desktop sidebar and resizing canvas remain. Reduced motion disables animation. Contact controls stay fixed to the viewport. Information routes are explicit noindex placeholders until content is implemented.

Admin uses native Medusa UI components and semantic theme tokens. Edit in drawers, create in a focus modal. Storefront visual style must not leak into the admin.

## Homepage carousel motion

Four generated category photographs: iPhone, Galaxy, Redmi, accessories. No stock discounts or sale claims. Existing header, footer and contact controls remain.

Focal moment: a 180ms anticipation followed by a 760ms liquid wave revealing the next photographic slide over the previous slide. Text follows with a short stagger. Right-side vertical bars have a single white indicator that stretches between selections. Bars are 56px high with 12px gaps, with no hover captions. No arrow buttons or bottom slide captions. Autoplay requests the next slide every seven seconds and resets after manual selection. The user requested no visible play/pause button. Keyboard focus, reduced motion, hidden tabs and an offscreen hero suspend autoplay. Mouse hover and pointer focus do not pause it. Manual clicks or swipes restart the seven-second countdown, including a click on the current slide. Direct selection, keyboard and mobile swipe work; rapid input cancels old timers and settles on the most recent selection.

Desktop navigation has no hamburger or plus controls. Below 1200px, a hamburger opens the primary navigation full-screen. Choosing Catalog closes that menu and opens the catalog full-screen. Back returns to the primary menu; close, Escape and selecting a leaf close the active view. Ordinary links close the menu before navigating. Focus stays inside the active dialog, background scrolling is locked, and focus returns to the hamburger on closing. Contact controls and background slideshow activity are suspended while a full-screen view is open.

Slide CTA labels match the supplied banners: В каталог, Подробнее, Купить, Подобрать. No arrow icons. The dark button fills with a white circular wave from the pointer entry point and changes to dark text on hover or keyboard focus. All CTA buttons currently open the catalog tree until destination pages are implemented.

Contact actions are icon-only circles (40px desktop, 38px mobile) above the main contact button (48px desktop, 44px mobile). The nearest phone action rises first, followed by Telegram, with 85ms stagger. Accessible labels retain the purpose and phone number. Closed actions are inert. Reduced motion removes the chain animation.

Budget: one normalized SVG clipping path updated during the reveal, transform/opacity on the active text, no WebGL or whole-page blur. Height stays fixed. All four text blocks render in the initial HTML. Reduced motion removes the anticipation and transition. The first image gets priority; later images use normal loading.

Catalog groups and filter sections expand and collapse over 380ms with a grid-height transition, a short content reveal and rotating chevrons. Closed content is inert. The panel has no bottom brand caption or preparation-status notices. Hero CTA padding is halved, with a compact 44px height.

The phone/tablet menu uses a compact photographic catalog entry, 16px informational links, a two-column link layout on tablets and real phone/Telegram links at the bottom. Avoid oversized standalone link typography and unused empty space.

Final mobile menu refinement: borderless two-column tiles (three on tablets), small semantic icons and a pointer-origin blue liquid fill with a diagonal arrow reveal. Informational labels are 14–15px. The cart has no visible text label and its count overlays the bag icon.

Desktop catalog closing: keep the primary navigation hidden until the canvas width transition finishes, then fade it in over 200ms. The desktop header remains a fixed-height, single-row layout throughout; container breakpoints must never move navigation below the logo during the transition. Keyboard focus returns only after the navigation becomes visible.

Catalog scrollbar: a light-gray 1px rail and a blue circular 10px thumb, synchronized with native scrolling. Dragging, rail clicks and keyboard scrolling work; ResizeObserver follows accordion height changes. Desktop header logo is fixed at 150px, with 40px horizontal header padding, independent of canvas width.

Header account icon sits immediately to the right of the cart and links to the existing account route. Hero CTA labels use an explicit line-height with a one-pixel upward optical adjustment; their symmetric button padding is unchanged.

Header scroll treatment: transparent over the homepage at the top; after 24px of document scrolling, a translucent navy surface with restrained backdrop blur appears. Sticky positioning and an unchanged header box avoid layout jumps. Returning to the top removes the surface.

Scrolled header becomes compact: desktop 96→76px, phones/tablets 80→64px over 280ms. Header margins compensate for the height change so page content keeps its position; logo and icon sizes remain fixed. Returning to the top restores the original height and transparent homepage surface.

Header alignment: logo, primary navigation and actions share a 44px center-aligned box. Menu labels have an explicit line-height and a one-pixel optical adjustment. Bag/account SVG silhouettes are centered around the same viewBox axis, and the smaller cart badge sits closer to the bag corner.

Desktop hover uses one shared 6px circular indicator under the center of the hovered menu item, including Catalog. It glides between items and fades out on leaving navigation; underline hovers are removed. Hero CTA horizontal padding is 18px desktop / 16px mobile, preserving compact height and optical text alignment.

Desktop navigation labels rise 3px over 280ms on hover or keyboard focus, then return to their optical baseline. This affects label transforms only; header layout and shared hover-dot geometry remain unchanged.

Homepage benefits strip sits directly after the hero and before the footer. Copy comes from the user-provided reference: delivery today from 299 rubles, payment after inspection, 12-month quality guarantee and pickup five minutes from the metro. The visual treatment follows the new storefront: blue outline icons, plain text, light separators, four columns on desktop, two on tablets and stacked rows on phones.

All main homepage content shares .texno-container: a 1440px maximum outer width, centered with 40px desktop / 24px tablet / 20px phone inner gutters. Header, hero copy, benefits and footer use this same wrapper; hero photography and section backgrounds remain full bleed. Slider controls align to the same right edge. New homepage sections must reuse this container rather than set independent horizontal padding.

Store story simplified at the user's request: a single ordinary rich-text article with sequential headings, paragraphs and images. No two-column composition or dark warranty panel. The current source data is rendered as standard HTML, so later the same typography can style a sanitized HTML field from the admin. CMS storage and editing are not implemented yet. Two new built-in ImageGen editorial photographs replace the old story images; paths and prompts are recorded in story-artwork-prompts.json. The source snapshot remains unchanged for migration traceability. Homepage reviews use a one-card-wide native horizontal scroll-snap carousel below 700px available content width, swiped by touch; desktop remains a three-card grid. All reviews still navigates to the separate reviews page.

Current store-story layout supersedes the single-column draft: one article contains repeated standard HTML sections. On desktop, each image section has a full-width heading followed by two equal columns; text/image positions alternate. Paragraphs fill their column. The text-only warranty section has its heading beside the paragraphs, on white. At 900px available width and below, sections stack in reading order. Image figures stretch to exactly the adjacent text height via CSS Grid, and absolutely positioned images cover their cells without distortion. On stacked layouts, images return to their natural aspect ratio. A future single HTML field can retain this composition by using the same section/copy classes; arbitrary unstructured HTML retains basic typography but does not automatically gain the grid. No CMS connection is implemented.

Product preview dialog actions: below the existing preview notice, Go to cart links to the localized /cart route with a blue filled button. Continue shopping is a background-free action that closes the dialog and preserves the current page. The card Buy button is unchanged. Fixture products still are not added to Medusa carts; the existing preview notice remains visible.

Latest preview action styling supersedes the blue-button draft: both actions sit in one horizontal flex row. Go to cart reuses texno-primary-button, including the hero dark background, white pointer-origin circular hover fill and optical label alignment. Continue shopping remains background-free and closes the dialog. Secondary text may wrap on narrow phones to keep both actions inside the same row without overflow.

Latest shared button behavior: hero and cart CTA use the StoreButton component. The cart CTA has a cobalt circular fill and white text, while the hero retains its light fill. The circle diameter is calculated to reach every corner from the pointer entry point; the underlying hover background takes the fill color after the reveal to avoid dark edge remnants. Popup actions remain in one row above 400px viewport width, and stack at full width at 400px and below. Browser checks at 401, 400, 375 and 320px confirmed the breakpoint and no action-row overflow; blue hover background, fill and white label were verified.


## Released hero implementation (6 November 2026)

The current hero supersedes the earlier full-frame backgrounds: transparent WebP device-and-podium cutouts sit over CSS backgrounds. Desktop art stays below the fixed header and beside the copy; responsive mobile cutouts use separate 800px assets. A CSS ellipse reveal replaces the old per-frame SVG mask. Seven-second autoplay waits until scroll/touch activity settles and does not update React state on scroll. The sticky header uses an intersection observer and an opaque/translucent color without backdrop blur.
