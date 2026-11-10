import type { MedusaContainer } from "@medusajs/framework/types"
import { ContentArticleInput, ContentArticleListQuery } from "../../modules/content/article-validation"
import { mutateContentArticle } from "../steps/save-content-article"
import { GET as publicList } from "../../api/store/content/pages/route"
import { GET as publicPage } from "../../api/store/content/pages/[slug]/route"
import { ArticleDocumentSchema } from "../../modules/content/article-document"
import { ArticleIndexSettingsInput } from "../../modules/content/article-validation"
import { articleDocument } from "../../admin/lib/article-document"

const draft = { title: "Как выбрать смартфон", slug: "smartfon", body: [{ type: "paragraph", text: "Кириллица <script>alert(1)</script> остаётся текстом" }] }
function fixture() {
  const rows = new Map<string, Record<string, any>>()
  let queue = Promise.resolve()
  const service = {
    retrieveContentArticle: jest.fn(async (id: string) => { const row = rows.get(id); if (!row || row.deleted_at) throw new Error("not found"); return { ...row } }),
    listContentArticles: jest.fn(async ({ slug }: { slug: string }) => [...rows.values()].filter((row) => row.slug === slug && !row.deleted_at)),
    createContentArticles: jest.fn(async (data) => { const row = { id: `article_${rows.size}`, ...data }; rows.set(row.id, row); return row }),
    updateContentArticles: jest.fn(async (data) => { const row = { ...rows.get(data.id), ...data }; rows.set(row.id, row); return row }),
    softDeleteContentArticles: jest.fn(async (id) => { rows.get(id)!.deleted_at = new Date() }),
    listContentPages: jest.fn(async () => [{ slug: "home", published_snapshot: { slug: "home", title: "Главная", metadata: {}, revision: 1 } }]),
  }
  const locking = { execute: jest.fn((_key, action) => { const pending = queue.then(action); queue = pending.catch(() => {}); return pending }) }
  const container = { resolve: (name: string) => name === "content" ? service : locking } as unknown as MedusaContainer
  return { rows, service, container }
}

describe("admin-only content articles", () => {
  it("preserves structured Unicode prose, images and SEO; strips no content into HTML", () => {
    const input = { ...draft, body: [...draft.body, { type: "image", url: "/static/photo.webp", alt: "Фото" }], metadata: { title: "SEO", noindex: true } }
    expect(ContentArticleInput.parse(input)).toMatchObject(input)
  })
  it.each(["javascript:alert(1)", "data:image/svg+xml,x", "//evil.test/a", "https://user:pass@evil.test", "file:///secret", "\\evil.test"])("rejects unsafe article media and links: %s", (url) => {
    expect(ContentArticleInput.safeParse({ ...draft, body: [{ type: "image", url, alt: "" }] }).success).toBe(false)
    expect(ContentArticleInput.safeParse({ ...draft, metadata: { image: url } }).success).toBe(false)
  })
  it.each([{ status: "published" }, { published_snapshot: draft }, { id: "page_other" }, { blocks: [] }])("rejects mass-assigned fields %j", (extra) => {
    expect(ContentArticleInput.safeParse({ ...draft, ...extra }).success).toBe(false)
  })
  it.each([{ slug: "../../secret" }, { title: "  " }, { body: [{ type: "html", html: "<script>" }] }, { expected_revision: 0 }])("rejects invalid documents %j", (extra) => {
    expect(ContentArticleInput.safeParse({ ...draft, ...extra }).success).toBe(false)
  })
  it.each([{ limit: "Infinity" }, { offset: "-1" }, { order: "title; drop table content_page" }, { fields: "*" }])("rejects malformed list queries %j", (query) => {
    expect(ContentArticleListQuery.safeParse(query).success).toBe(false)
  })
  it("serializes racing creates so the same article slug cannot be created twice", async () => {
    const f = fixture()
    const results = await Promise.allSettled([mutateContentArticle({ operation: "save", data: draft }, f.container), mutateContentArticle({ operation: "save", data: draft }, f.container)])
    expect(results.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"])
    expect(f.service.createContentArticles).toHaveBeenCalledTimes(1)
  })
  it("rejects stale and missing revisions on updates and deletion without losing the winning edit", async () => {
    const f = fixture()
    await mutateContentArticle({ operation: "save", data: draft }, f.container)
    const update = (title: string) => mutateContentArticle({ operation: "save", id: "article_0", data: { ...draft, title, expected_revision: 1 } }, f.container)
    const results = await Promise.allSettled([update("Первое изменение"), update("Второе изменение")])
    expect(results.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"])
    await expect(mutateContentArticle({ operation: "save", id: "article_0", data: draft }, f.container)).rejects.toThrow("изменена")
    await expect(mutateContentArticle({ operation: "delete", id: "article_0", expected_revision: 1 }, f.container)).rejects.toThrow("изменена")
    expect(f.rows.get("article_0")).toMatchObject({ title: "Первое изменение", revision: 2 })
    expect(f.service.softDeleteContentArticles).not.toHaveBeenCalled()
  })
  it("checks validation again in workflows and supports reusing soft-deleted slugs", async () => {
    const f = fixture()
    await expect(mutateContentArticle({ operation: "save", data: { ...draft, status: "published" } }, f.container)).rejects.toThrow()
    expect(f.service.createContentArticles).not.toHaveBeenCalled()
    await mutateContentArticle({ operation: "save", data: draft }, f.container)
    await mutateContentArticle({ operation: "delete", id: "article_0", expected_revision: 1 }, f.container)
    await mutateContentArticle({ operation: "save", data: draft }, f.container)
    expect(f.service.createContentArticles).toHaveBeenCalledTimes(2)
  })
  it("keeps existing public list/detail readers isolated even for an article with the same slug", async () => {
    const f = fixture()
    await mutateContentArticle({ operation: "save", data: { ...draft, slug: "home" } }, f.container)
    const json = jest.fn(), setHeader = jest.fn()
    await publicList({ scope: f.container } as any, { json, setHeader } as any)
    expect(json).toHaveBeenLastCalledWith(expect.objectContaining({ pages: [expect.objectContaining({ title: "Главная" })], count: 1 }))
    await publicPage({ scope: f.container, params: { slug: "home" } } as any, { json, setHeader } as any)
    expect(json).toHaveBeenLastCalledWith({ page: expect.objectContaining({ title: "Главная" }) })
    expect(f.service.listContentPages).toHaveBeenLastCalledWith({ slug: "home", status: "published" }, { take: 1 })
    expect(f.service.listContentArticles).toHaveBeenCalledTimes(1) // Only the admin mutation's uniqueness check.
  })
})

describe("BlockNote documents and article page settings", () => {
  const paragraph = { id: "p1", type: "paragraph", props: { textAlignment: "left", textColor: "default", backgroundColor: "default" }, content: [{ type: "text", text: "Текст <script> остаётся текстом", styles: { bold: true } }], children: [] }
  it("retains text formatting, nested lists, image captions and block order", () => {
    const document = { version: 1, blocks: [paragraph, { id: "list1", type: "bulletListItem", props: {}, content: [], children: [{ ...paragraph, id: "child" }] }, { id: "image1", type: "image", props: { url: "/static/image.webp", caption: "Описание", previewWidth: 600 }, children: [] }] }
    expect(ArticleDocumentSchema.parse(document)).toEqual(document)
    expect(ContentArticleInput.parse({ ...draft, excerpt: "Описание карточки", cover_image: "/static/cover.webp", cover_alt: "Обложка", body: document })).toMatchObject({ body: document, excerpt: "Описание карточки" })
  })
  it.each(["javascript:alert(1)", "data:image/svg+xml,x", "mailto:a@example.test", "//evil.test", "file:///secret"])("rejects unsafe BlockNote images and covers: %s", (url) => {
    expect(ContentArticleInput.safeParse({ ...draft, cover_image: url }).success).toBe(false)
    expect(ArticleDocumentSchema.safeParse({ version: 1, blocks: [{ id: "image", type: "image", props: { url }, children: [] }] }).success).toBe(false)
  })
  it("rejects unsupported embeds, raw HTML, style injection and duplicate block IDs", () => {
    for (const item of [{ ...paragraph, type: "html" }, { ...paragraph, props: { html: "<script>" } }, { ...paragraph, content: [{ type: "text", text: "x", styles: { textColor: "url(javascript:x)" } }] }, { ...paragraph, content: [{ type: "link", href: "javascript:x", content: [] }] }]) expect(ArticleDocumentSchema.safeParse({ version: 1, blocks: [item] }).success).toBe(false)
    expect(ArticleDocumentSchema.safeParse({ version: 1, blocks: [paragraph, { ...paragraph }] }).success).toBe(false)
    expect(ArticleDocumentSchema.safeParse({ version: 2, blocks: [] }).success).toBe(false)
  })
  it("rejects excessive depth before recursive parsing", () => {
    let nested = { ...paragraph }
    for (let i = 0; i < 50; i++) nested = { ...paragraph, id: `nested-${i}`, children: [nested] } as typeof paragraph
    expect(() => ArticleDocumentSchema.safeParse({ version: 1, blocks: [nested] })).not.toThrow()
    expect(ArticleDocumentSchema.safeParse({ version: 1, blocks: [nested] }).success).toBe(false)
  })
  it("converts legacy article content without modifying it or dropping tables and links", () => {
    const legacy = [{ type: "paragraph", text: "Текст" }, { type: "heading", level: 2, text: "Заголовок" }, { type: "list", ordered: true, items: ["Первый", "Второй"] }, { type: "table", headers: ["Колонка"], rows: [["Ячейка"]] }, { type: "image", url: "/static/photo.webp", alt: "Фото" }, { type: "link", text: "Ссылка", href: "https://example.test" }, { type: "quote", text: "Цитата", author: "Автор" }] as const
    const before = JSON.stringify(legacy)
    const document = articleDocument(JSON.parse(before))
    expect(ArticleDocumentSchema.safeParse(document).success).toBe(true)
    expect(document.blocks.map((block) => block.type)).toEqual(["paragraph", "heading", "numberedListItem", "numberedListItem", "table", "image", "paragraph", "quote"])
    expect(JSON.stringify(document)).toContain("Ячейка")
    expect(JSON.stringify(document)).toContain("https://example.test")
    expect(JSON.stringify(legacy)).toBe(before)
    expect(articleDocument(document)).toBe(document)
  })
  it("validates independent index SEO settings, revision and URLs", () => {
    expect(ArticleIndexSettingsInput.parse({ expected_revision: 0 })).toMatchObject({ title: "Статьи", noindex: true })
    for (const data of [{ title: " " }, { published_data: {} }, { key: "site" }, { canonical: "javascript:x" }, { canonical: "https://" }, { canonical: "https://[bad" }, { canonical: "https://%" }, { social_image: "data:text/html,x" }, { expected_revision: -1 }]) {
      expect(() => ArticleIndexSettingsInput.safeParse({ expected_revision: 0, ...data })).not.toThrow()
      expect(ArticleIndexSettingsInput.safeParse({ expected_revision: 0, ...data }).success).toBe(false)
    }
    expect(ArticleIndexSettingsInput.safeParse({ title: "Блог", meta_title: "Статьи — магазин", canonical: "https://example.test/articles", expected_revision: 3 }).success).toBe(true)
  })
})
