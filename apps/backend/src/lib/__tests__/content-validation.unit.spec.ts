import { ContentLeadInput, ContentPageInput, ContentReviewInput, ContentSettingsInput, safeContentUrl, validatePublishedPageLayout } from "../../modules/content/validation"
import { createContentPreviewToken, readContentPreviewToken } from "../content-preview"

describe("CMS content validation and private previews", () => {
  const page = { slug: "qa-page", title: "QA страница", body: [{ type: "paragraph", text: "Полный текст <script> остаётся безопасным текстом" }] }
  it("retains full Unicode prose and structured legal tables without HTML execution", () => {
    const body = [{ type: "heading", level: 2, text: "Раздел" }, ...page.body, { type: "table", headers: ["Услуга", "Цена"], rows: [["Доставка", "600–1200 ₽"]] }, { type: "list", ordered: true, items: ["Первый", "Второй"] }]
    expect(ContentPageInput.parse({ ...page, body }).body).toEqual(body)
  })
  it("rejects unsafe links, credentials, protocol-relative URLs and script schemes", () => {
    for (const href of ["javascript:alert(1)", "data:text/html,bad", "//evil.test", "https://u:p@example.test", "java\nscript:x", "\\evil.test"]) {
      expect(safeContentUrl(href)).toBe(false)
      expect(ContentPageInput.safeParse({ ...page, body: [{ type: "link", text: "x", href }] }).success).toBe(false)
    }
    for (const href of ["/page/privacy-policy", "https://texno.store/", "tel:+74950000000", "mailto:info@texno.store", "http://localhost:9000/static/image.webp"]) expect(safeContentUrl(href)).toBe(true)
  })
  it("rejects raw HTML properties and dangerous nested media URLs", () => {
    expect(ContentSettingsInput.safeParse({ data: { footer: { html: "<script>" } } }).success).toBe(false)
    expect(ContentSettingsInput.safeParse({ data: { home: { image: "javascript:x" } } }).success).toBe(false)
    expect(ContentSettingsInput.safeParse({ data: { company: { name: "<AURA>" } } }).success).toBe(true)
  })
  it("validates the reusable store brand without imposing any company identity", () => {
    expect(ContentSettingsInput.safeParse({ data: { brand: { name: "Another Store", logo_url: "/images/another.svg", logo_alt: "Another Store" }, company: {} } }).success).toBe(true)
    expect(ContentSettingsInput.safeParse({ data: { brand: { name: "Another Store" } } }).success).toBe(true)
    expect(ContentSettingsInput.safeParse({ data: { brand: { name: "", logo_url: "/images/another.svg", logo_alt: "Logo" } } }).success).toBe(false)
    expect(ContentSettingsInput.safeParse({ data: { brand: { name: "Another Store", logo_url: "javascript:x", logo_alt: "Logo" } } }).success).toBe(false)
  })
  it("validates typed contact and footer sections before they reach the storefront", () => {
    expect(ContentSettingsInput.safeParse({ data: { contacts: {}, company: {}, footer: { columns: [] }, social: [], legal: {} } }).success).toBe(true)
    expect(ContentSettingsInput.safeParse({ data: { contacts: { departments: "invalid", email: "no-email" } } }).success).toBe(false)
    expect(ContentSettingsInput.safeParse({ data: { footer: { columns: "invalid" } } }).success).toBe(false)
    expect(ContentSettingsInput.safeParse({ data: { social: [{ label: "Broken", url: "", enabled: true }] } }).success).toBe(false)
  })
  it("rejects duplicate block IDs, invalid slugs and nonfinite values", () => {
    expect(ContentPageInput.safeParse({ ...page, slug: "../../secret" }).success).toBe(false)
    const block = { id: "same", type: "text", enabled: true, order: 0, data: {} }
    expect(ContentPageInput.safeParse({ ...page, blocks: [block, block] }).success).toBe(false)
    expect(ContentSettingsInput.safeParse({ data: { price: Infinity } }).success).toBe(false)
  })
  it("requires product refs for product reviews and rejects invalid dates/ratings", () => {
    const review = { kind: "product", author: "QA", rating: 5, body: "Текст отзыва", review_date: "2026-11-07" }
    expect(ContentReviewInput.safeParse(review).success).toBe(false)
    expect(ContentReviewInput.safeParse({ ...review, product_id: "prod_qa" }).success).toBe(true)
    expect(ContentReviewInput.safeParse({ ...review, product_id: "prod_qa", rating: 6 }).success).toBe(false)
    expect(ContentReviewInput.safeParse({ ...review, product_id: "prod_qa", review_date: "2026-02-31" }).success).toBe(false)
  })
  it("requires contact consent and a valid email, supports retry request keys and honeypot", () => {
    const lead = { request_key: "qa-request-000000001", name: "QA", email: "qa@example.test", message: "Обращение", consent: true }
    expect(ContentLeadInput.safeParse(lead).success).toBe(true)
    expect(ContentLeadInput.safeParse({ ...lead, consent: false }).success).toBe(false)
    expect(ContentLeadInput.safeParse({ ...lead, website: "bot" }).success).toBe(false)
    expect(ContentLeadInput.safeParse({ ...lead, email: "not email" }).success).toBe(false)
  })
  it("rejects invalid named layout shapes before publishing while allowing drafts", () => {
    const draft = ContentPageInput.parse({ slug: "home", title: "Home", blocks: [{ id: "hero", type: "hero", enabled: true, order: 0, data: { slides: [{ title: "wrong-shape" }] } }] })
    expect(() => validatePublishedPageLayout(draft)).toThrow("hero")
    expect(() => validatePublishedPageLayout({ ...draft, blocks: draft.blocks.map((block) => ({ ...block, id: "new-random-id", type: "story" })) })).toThrow("new-random-id")
    expect(() => validatePublishedPageLayout({ ...draft, blocks: draft.blocks.map((block) => ({ ...block, enabled: false })) })).not.toThrow()
    expect(ContentSettingsInput.safeParse({ data: { media_001_srcset: "javascript:x 1x, /safe.webp 2x" } }).success).toBe(false)
    expect(ContentSettingsInput.safeParse({ data: { media_001_srcset: "/one.webp 1x, /two.webp 2x" } }).success).toBe(true)
  })
  it("authenticates preview capabilities, rejects tampering and expires after fifteen minutes", () => {
    const previous = process.env.JWT_SECRET
    process.env.JWT_SECRET = "unit-test-preview-secret-only"
    try {
      const token = createContentPreviewToken("page_fixture", 4)
      expect(readContentPreviewToken(token)).toEqual({ id: "page_fixture", revision: 4 })
      expect(() => readContentPreviewToken(`${token}x`)).toThrow()
      const now = Date.now()
      const clock = jest.spyOn(Date, "now").mockReturnValue(now + 16 * 60 * 1000)
      expect(() => readContentPreviewToken(token)).toThrow()
      clock.mockRestore()
    } finally { if (previous === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previous }
  })
})
