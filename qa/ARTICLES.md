# Admin articles

Open `http://localhost:9001/app/content-articles`, **Витрина → Статьи**. This stage implements administration only; the storefront remains a future step.

## Interface

An article has two tabs saved together with one revision:

- **Карточка**: title, unique article slug, excerpt, cover upload/URL, cover description, live card preview, and expandable article SEO (title, description, social image, canonical URL, noindex).
- **Статья**: BlockNote 0.57.0 with Russian menus, headings, paragraphs, nested lists/checklists, quotes, images, tables, text formatting and native block drag-and-drop. Images use the existing authenticated upload API. Saving is disabled during uploads; failed saves retain the entered content.

Creation uses a native FocusModal, editing a Drawer. List rows show the cover and excerpt. The card and body belong to the same article, and the future card link derives from the slug; no separate article-link record is necessary.

**Настройки страницы** opens a separate Drawer for the future page containing all cards: page heading, introductory text, SEO title/description, search-preview text, social image, canonical URL and noindex. Its save/revision is independent of article edits.

## Storage and access

`content_article` is separate from CMS `content_page`. The body stores a single versioned BlockNote JSON document (`version: 1, blocks`) or a legacy node array. Old arrays are converted in memory on opening; saving explicitly writes the new document. No duplicate body or automatic data rewrite is introduced.

`Migration20261110174836` originally added the article table. `Migration20261110192520` adds excerpt, cover_image and cover_alt with empty defaults, without modifying old migrations or deleting data. Both have been applied locally.

Listing-page settings reuse `content_settings` under the dedicated `articles-index` key. The existing public settings endpoint reads only `site`; article settings never enter that response. There are no article publication actions, preview tokens, store article endpoints, storefront routes, menu entries or sitemap entries.

Every endpoint is under `/admin/content/articles` or `/admin/content/article-settings`, retaining native Medusa staff authentication and the current-user guard. Server validators reject unexpected fields, unsupported nodes, unsafe links, dangerous styles, duplicate block IDs and excessive nesting. Workflows repeat validation, lock mutations, check revisions, and supply compensation. Article deletion is soft deletion and requires the current revision. GET responses use private/no-store caching.

Raster uploads retain existing CMS behavior: images are public static assets; article text and SEO are private admin drafts. BlockNote uses only its free core/UI packages, with no XL packages or hosted collaboration service.

Backend TypeScript excludes browser-only `src/admin`, which has its own ESNext/bundler tsconfig. An omitted service type in the existing QA cleanup script was made explicit; its runtime behavior is unchanged. This removes the previous mixed CommonJS/import.meta checking issue.

## Verification — 2026-11-10

| Check | Result |
| --- | --- |
| Unit tests | 50 passed: workflow, document validation, legacy conversion, CMS regression and current-admin guard |
| Live HTTP regression | 11 groups passed: authentication, persistence, invalid input, duplicate slugs, revisions, public isolation, independent page SEO and soft deletion |
| Real Chrome | 13 passed: two tabs, cover/body uploads, headings/lists, persistence across reload, failed-save retention, independent page SEO save/reopen and actual mouse drag-and-drop |
| TypeScript | Backend and admin checked separately |
| Production build | Backend and frontend built in disposable Compose containers, separately from the dev server |
| Lint | Zero errors; 123 existing warnings |
| Independent finishing review | Canonical validation finding resolved; no remaining findings |

The review found malformed HTTPS strings such as `https://` throwing in a URL refinement. The final validator uses the guarded CMS URL helper. Unit tests require safeParse to reject without throwing; live HTTP tests require 400.

Focused unit command from `apps/backend`:

```sh
pnpm run test:unit -- src/workflows/__tests__/content-articles.unit.spec.ts src/lib/__tests__/content-validation.unit.spec.ts src/lib/__tests__/content-preview-country.unit.spec.ts src/api/__tests__/admin-user-guard.unit.spec.ts
pnpm exec tsc --noEmit
pnpm exec tsc -p src/admin/tsconfig.json
```

From `commerce`:

```sh
node qa/articles.cjs
```

The HTTP runner deliberately targets only localhost:9001/localhost:8001 and reads `.local/admin-credentials.json` without printing credentials. It removes its own synthetic articles and restores previous listing-page settings.

For the browser runner, set `PLAYWRIGHT_CLI` to the installed Playwright CLI entry point and use an already signed-in `texno-articles` browser session:

```sh
node qa/ui/run-articles.cjs
```

It runs `articles-blocknote.js` and `article-block-drag.js`, removes its own articles/uploaded files, restores prior settings, and records JSON/screenshots under ignored `output/playwright/articles-*`. Screenshots cover card/editor/settings at desktop and phone sizes. Cleanup and restoration responses are checked.

This verification covers the local development installation, not deployment or a future public article renderer.
