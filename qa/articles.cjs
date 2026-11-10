// Focused, repeatable regression against the explicitly authorized local store.
// Credentials stay in .local; only synthetic articles created by this run are removed.
const fs = require("node:fs")
const path = require("node:path")
const assert = require("node:assert/strict")
const { randomUUID, createHash } = require("node:crypto")
const base = "http://localhost:9001"
const root = path.resolve(__dirname, "..")
const cases = []
const tracked = new Map()
let token, key
async function request(route, method = "GET", data, auth = "admin") {
  const response = await fetch(base + route, { method, redirect: "error", signal: AbortSignal.timeout(60000), headers: {
    ...(auth === "admin" && token ? { authorization: `Bearer ${token}` } : {}),
    ...(auth === "store" && key ? { "x-publishable-api-key": key } : {}),
    ...(data ? { "content-type": "application/json" } : {}),
  }, ...(data ? { body: JSON.stringify(data) } : {}) })
  const text = await response.text()
  let body
  try { body = JSON.parse(text) } catch { body = {} }
  return { status: response.status, body, headers: response.headers }
}
const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex")
async function check(name, fn) { await fn(); cases.push({ name, status: "PASS" }) }
async function main() {
  const deadline = Date.now() + 45000
  let healthy = false
  while (!healthy && Date.now() < deadline) {
    try { healthy = (await request("/health", "GET", undefined, "none")).status === 200 } catch { /* Allow the local development watcher to finish a restart. */ }
    if (!healthy) await new Promise((resolve) => setTimeout(resolve, 500))
  }
  assert.ok(healthy, "Local backend did not become healthy")
  const credentials = JSON.parse(fs.readFileSync(path.join(root, ".local/admin-credentials.json"), "utf8").replace(/^\uFEFF/, ""))
  const login = await request("/auth/user/emailpass", "POST", credentials, "none")
  assert.equal(login.status, 200, "Local administrator login failed")
  token = login.body.token
  const keys = await request("/admin/api-keys?type=publishable")
  key = keys.body.api_keys.find((item) => item.type === "publishable")?.token
  assert.ok(key, "Missing local publishable key")
  const publicBefore = await request("/store/content/pages", "GET", undefined, "store")
  const pagesBefore = await request("/admin/content/pages?limit=100")
  const settingsBefore = await request("/admin/content/settings")
  const storeSettingsBefore = await request("/store/content/settings", "GET", undefined, "store")
  const suffix = randomUUID().replaceAll("-", "")
  const slug = `qa-article-${suffix}`
  const draft = { title: "QA: статья для проверки", slug, body: [{ type: "paragraph", text: `Текст ${suffix} <script>alert(1)</script>` }], metadata: { title: "SEO заголовок", description: "SEO описание", noindex: true } }
  let article
  await check("anonymous and publishable-key requests cannot read or mutate admin articles", async () => {
    for (const auth of ["none", "store"]) for (const [route, method, data] of [["/admin/content/articles", "GET"], ["/admin/content/articles", "POST", draft], ["/admin/content/articles/unknown", "GET"], ["/admin/content/articles/unknown?expected_revision=1", "DELETE"]]) {
      assert.equal((await request(route, method, data, auth)).status, 401)
    }
  })
  await check("create persists structured content and SEO privately", async () => {
    const created = await request("/admin/content/articles", "POST", draft)
    assert.equal(created.status, 201)
    article = created.body.article
    tracked.set(article.id, article.revision)
    assert.equal(article.revision, 1)
    const loaded = await request(`/admin/content/articles/${article.id}`)
    assert.deepEqual(loaded.body.article.body, draft.body)
    assert.deepEqual(loaded.body.article.metadata, draft.metadata)
    assert.match(loaded.headers.get("cache-control"), /private.*no-store/)
  })
  await check("list is paginated and excludes full draft content", async () => {
    const list = await request("/admin/content/articles?limit=1&offset=0&order=-created_at")
    assert.equal(list.status, 200)
    assert.equal(list.body.articles.length, 1)
    assert.equal(list.body.articles[0].id, article.id)
    assert.equal(list.body.articles[0].body, undefined)
    assert.match(list.headers.get("cache-control"), /private.*no-store/)
  })
  await check("malformed queries, unsafe media and mass-assigned publication fields are rejected", async () => {
    for (const query of ["limit=Infinity", "offset=-1", "order=secret", "fields=*"]) assert.equal((await request(`/admin/content/articles?${query}`)).status, 400)
    for (const data of [{ ...draft, slug: "../../secret" }, { ...draft, title: "  " }, { ...draft, status: "published" }, { ...draft, body: [{ type: "image", url: "javascript:alert(1)", alt: "" }] }, { ...draft, metadata: { canonical: "data:text/html,x" } }]) assert.equal((await request("/admin/content/articles", "POST", data)).status, 400)
    assert.equal((await request(`/admin/content/articles/${article.id}`, "DELETE")).status, 400)
  })
  await check("duplicate slugs and stale updates/deletions return conflict", async () => {
    assert.equal((await request("/admin/content/articles", "POST", draft)).status, 409)
    const edited = await request(`/admin/content/articles/${article.id}`, "POST", { ...draft, title: "QA: отредактированная статья", expected_revision: 1 })
    assert.equal(edited.status, 200)
    article = edited.body.article
    tracked.set(article.id, article.revision)
    assert.equal(article.revision, 2)
    assert.equal((await request(`/admin/content/articles/${article.id}`, "POST", { ...draft, expected_revision: 1 })).status, 409)
    assert.equal((await request(`/admin/content/articles/${article.id}`, "POST", draft)).status, 409)
    assert.equal((await request(`/admin/content/articles/${article.id}?expected_revision=1`, "DELETE")).status, 409)
    assert.equal((await request(`/admin/content/articles/${article.id}`)).body.article.title, "QA: отредактированная статья")
  })
  await check("articles have no store endpoint, public page or page-preview access", async () => {
    for (const route of ["/store/content/articles", `/store/content/articles/${article.id}`, `/store/content/pages/${slug}`]) assert.equal((await request(route, "GET", undefined, "store")).status, 404)
    for (const route of [`/admin/content/pages/${article.id}`, `/admin/content/pages/${article.id}/preview`]) assert.equal((await request(route)).status, 404)
    assert.equal((await fetch(`http://localhost:8001/ru/page/${slug}`, { signal: AbortSignal.timeout(120000) })).status, 404)
    const sitemap = await fetch("http://localhost:8001/sitemap.xml", { signal: AbortSignal.timeout(120000) })
    assert.equal(sitemap.status, 200)
    assert.ok(!(await sitemap.text()).includes(slug))
  })
  await check("article and page namespaces remain independent", async () => {
    const pageSlug = pagesBefore.body.pages[0].slug
    const created = await request("/admin/content/articles", "POST", { ...draft, slug: pageSlug })
    assert.equal(created.status, 201)
    tracked.set(created.body.article.id, created.body.article.revision)
    const pageId = pagesBefore.body.pages[0].id
    assert.equal((await request(`/admin/content/articles/${pageId}`)).status, 404)
  })
  await check("CMS pages, public snapshots and settings remain unchanged", async () => {
    assert.equal(digest((await request("/admin/content/pages?limit=100")).body), digest(pagesBefore.body))
    assert.equal(digest((await request("/admin/content/settings")).body), digest(settingsBefore.body))
    assert.equal(digest((await request("/store/content/pages", "GET", undefined, "store")).body), digest(publicBefore.body))
  })
  await check("card fields and formatted BlockNote content persist as one article", async () => {
    const body = { version: 1, blocks: [
      { id: "heading", type: "heading", props: { level: 2 }, content: [{ type: "text", text: "Раздел", styles: {} }], children: [] },
      { id: "paragraph", type: "paragraph", props: {}, content: [{ type: "text", text: "Полужирный текст", styles: { bold: true } }, { type: "link", href: "https://example.test", content: [{ type: "text", text: "Ссылка", styles: {} }] }], children: [] },
      { id: "list", type: "bulletListItem", props: {}, content: [{ type: "text", text: "Пункт списка", styles: {} }], children: [] },
      { id: "image", type: "image", props: { url: "/static/qa-image.webp", caption: "Описание изображения", previewWidth: 480 }, children: [] },
    ] }
    const updated = await request(`/admin/content/articles/${article.id}`, "POST", { ...draft, body, excerpt: "Краткое описание карточки", cover_image: "/static/qa-cover.webp", cover_alt: "Обложка", expected_revision: article.revision })
    assert.equal(updated.status, 200)
    article = updated.body.article
    tracked.set(article.id, article.revision)
    const loaded = (await request(`/admin/content/articles/${article.id}`)).body.article
    assert.deepEqual(loaded.body, body)
    assert.equal(loaded.excerpt, "Краткое описание карточки")
    assert.equal(loaded.cover_image, "/static/qa-cover.webp")
    const invalid = { ...draft, expected_revision: article.revision, body: { version: 1, blocks: [{ ...body.blocks[1], content: [{ type: "link", href: "javascript:x", content: [] }] }] } }
    assert.equal((await request(`/admin/content/articles/${article.id}`, "POST", invalid)).status, 400)
    assert.deepEqual((await request(`/admin/content/articles/${article.id}`)).body.article.body, body)
  })
  await check("index page SEO is admin-only, revision protected and separate from site settings", async () => {
    for (const auth of ["none", "store"]) {
      assert.equal((await request("/admin/content/article-settings", "GET", undefined, auth)).status, 401)
      assert.equal((await request("/admin/content/article-settings", "POST", { expected_revision: 0 }, auth)).status, 401)
    }
    const original = (await request("/admin/content/article-settings")).body.settings
    const { revision, ...settings } = original
    let currentRevision = revision
    try {
      const saved = await request("/admin/content/article-settings", "POST", { ...settings, title: "QA: статьи", intro: "Вступление", meta_title: "QA SEO", meta_description: "Описание раздела", social_image: "/static/qa-social.webp", noindex: false, expected_revision: revision })
      assert.equal(saved.status, 200)
      currentRevision = saved.body.settings.revision
      assert.equal((await request("/admin/content/article-settings")).body.settings.meta_title, "QA SEO")
      assert.equal((await request("/admin/content/article-settings", "POST", { ...settings, expected_revision: revision })).status, 409)
      for (const invalid of [{ canonical: "javascript:x" }, { canonical: "https://" }, { canonical: "https://[bad" }, { social_image: "//evil.test" }, { published_data: {} }, { key: "site" }]) assert.equal((await request("/admin/content/article-settings", "POST", { ...settings, ...invalid, expected_revision: currentRevision })).status, 400)
      assert.equal((await request("/store/content/article-settings", "GET", undefined, "store")).status, 404)
      assert.equal(digest((await request("/admin/content/settings")).body), digest(settingsBefore.body))
      assert.equal(digest((await request("/store/content/settings", "GET", undefined, "store")).body), digest(storeSettingsBefore.body))
    } finally {
      if (currentRevision !== revision) assert.equal((await request("/admin/content/article-settings", "POST", { ...settings, expected_revision: currentRevision })).status, 200)
    }
  })
  await check("soft deletion removes only the synthetic article and returns 404 afterwards", async () => {
    assert.equal((await request(`/admin/content/articles/${article.id}?expected_revision=${article.revision}`, "DELETE")).status, 200)
    tracked.delete(article.id)
    assert.equal((await request(`/admin/content/articles/${article.id}`)).status, 404)
  })
}
main().catch((error) => { cases.push({ name: "failure", status: "FAIL", message: error.message }); process.exitCode = 1 }).finally(async () => {
  for (const [id, revision] of tracked) {
    try { assert.equal((await request(`/admin/content/articles/${id}?expected_revision=${revision}`, "DELETE")).status, 200) }
    catch { cases.push({ name: "synthetic fixture cleanup", status: "FAIL", id }); process.exitCode = 1 }
  }
  fs.mkdirSync(path.join(root, "output/playwright"), { recursive: true })
  fs.writeFileSync(path.join(root, "output/playwright/articles-api.json"), JSON.stringify({ cases }, null, 2))
  console.log(JSON.stringify({ cases }, null, 2))
})
