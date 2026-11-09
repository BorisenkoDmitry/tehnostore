import { z } from "@medusajs/framework/zod"
import type { ContentValue } from "./types"

export const safeContentUrl = (value: string) => {
  if (!value || /[\u0000-\u0020\\]/.test(value)) return false
  if (value.startsWith("/") && !value.startsWith("//")) return true
  if (/^(mailto:|tel:)/.test(value)) return !/[<>"']/.test(value)
  try {
    const url = new URL(value)
    const protocol = url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))
    return protocol && !url.username && !url.password
  } catch { return false }
}

const safeUrl = z.string().max(2000).refine(safeContentUrl, "Укажите путь магазина или безопасную HTTPS-ссылку")
const text = z.string().max(100000)
export const ContentNodeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("heading"), level: z.union([z.literal(2), z.literal(3), z.literal(4)]), text }),
  z.object({ type: z.literal("paragraph"), text }),
  z.object({ type: z.literal("list"), ordered: z.boolean().default(false), items: z.array(text).max(300) }),
  z.object({ type: z.literal("table"), headers: z.array(z.string().max(1000)).max(30), rows: z.array(z.array(z.string().max(10000)).max(30)).max(500) }),
  z.object({ type: z.literal("image"), url: safeUrl, alt: z.string().max(1000) }),
  z.object({ type: z.literal("quote"), text, author: z.string().max(300).optional() }),
  z.object({ type: z.literal("link"), text: z.string().max(3000), href: safeUrl }),
])

const ContentValueSchema: z.ZodType<ContentValue> = z.lazy(() => z.union([
  z.string().max(100000), z.number().finite(), z.boolean(), z.null(),
  z.array(ContentValueSchema).max(1000), z.record(z.string().max(100), ContentValueSchema),
]))

function safeTree(value: ContentValue, depth = 0): boolean {
  if (depth > 15) return false
  if (Array.isArray(value)) return value.every((item) => safeTree(item, depth + 1))
  if (value && typeof value === "object") return Object.entries(value).every(([key, item]) => {
    if (["__proto__", "constructor", "prototype", "html", "dangerouslySetInnerHTML"].includes(key)) return false
    if (/(?:^|_)srcset$/.test(key) && typeof item === "string" && item && !item.split(",").every((entry) => {
      const [url, descriptor, extra] = entry.trim().split(/\s+/)
      return safeContentUrl(url) && !extra && (!descriptor || /^(?:\d+(?:\.\d+)?x|\d+w)$/.test(descriptor))
    })) return false
    if (/(?:^|_)src$/.test(key) && typeof item === "string" && item && !safeContentUrl(item)) return false
    if (/(?:^|_)(?:url|href|image|mobileImage)$/.test(key) && typeof item === "string" && item && !safeContentUrl(item)) return false
    return safeTree(item, depth + 1)
  })
  return true
}

export const ContentDataSchema = z.record(z.string().max(100), ContentValueSchema).refine((value) => safeTree(value), "Некорректное вложенное содержимое или небезопасная ссылка")
export const ContentBlockSchema = z.object({
  id: z.string().min(1).max(100), type: z.string().regex(/^[a-z][a-z0-9_-]*$/).max(100),
  enabled: z.boolean().default(true), order: z.number().int().min(0).max(10000), data: ContentDataSchema,
})
export const ContentMetadataSchema = z.object({
  title: z.string().max(300).optional(), description: z.string().max(3000).optional(), image: safeUrl.optional(),
  noindex: z.boolean().optional(), canonical: safeUrl.optional(),
})
export const ContentPageInput = z.object({
  slug: z.string().min(1).max(150).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().trim().min(1).max(300), body: z.array(ContentNodeSchema).max(1000).default([]),
  blocks: z.array(ContentBlockSchema).max(100).default([]), metadata: ContentMetadataSchema.default({}),
  expected_revision: z.number().int().positive().optional(),
}).superRefine((value, ctx) => {
  if (new Set(value.blocks.map((block) => block.id)).size !== value.blocks.length) ctx.addIssue({ code: "custom", path: ["blocks"], message: "ID блоков должны быть уникальными" })
})
export type ContentPageInputType = z.infer<typeof ContentPageInput>
export const ContentBrandSchema = z.object({ name: z.string().trim().min(1).max(120), logo_url: z.union([safeUrl, z.literal("")]).optional(), logo_alt: z.string().max(300).optional(), catalog_image: z.union([safeUrl, z.literal("")]).optional(), catalog_tagline: z.string().max(300).optional() })
const optionalText = z.string().max(300).optional()
const optionalEmail = z.union([z.email().max(320), z.literal("")]).optional()
const optionalUrl = z.union([safeUrl, z.literal("")]).optional()
const knownSettingsSections: Record<string, z.ZodType> = {
  brand: ContentBrandSchema,
  contacts: z.object({ email: optionalEmail, phone: optionalText, phoneUri: optionalText, departments: z.array(z.object({ name: z.string().min(1).max(300), extension: optionalText, weekdays: optionalText, weekend: optionalText })).max(50).optional() }),
  company: z.object({ name: optionalText, inn: optionalText, kpp: optionalText, ogrn: optionalText, address: z.string().max(1500).optional(), email: optionalEmail }),
  social: z.array(z.object({ label: z.string().max(120), url: z.union([safeUrl, z.literal("")]), enabled: z.boolean() }).refine((item) => !item.enabled || (!!item.label.trim() && item.url.startsWith("https://")), "Укажите название и HTTPS-ссылку включённой социальной сети")).max(50),
  footer: z.object({ text: z.string().max(10000).optional(), columns: z.array(z.object({ title: z.string().max(300), items: z.array(z.object({ label: z.string().max(300), enabled: z.boolean(), href: optionalUrl, page_slug: optionalText, category_id: optionalText, navigation_node_id: optionalText })).max(100) })).max(12).optional() }),
  footer_display: z.object({ logo_src: optionalUrl, logo_alt: optionalText, payment_logos: z.array(z.object({ src: safeUrl, alt: z.string().max(300), width: z.number().positive().max(20000), height: z.number().positive().max(20000) })).max(20).optional() }),
  legal: z.record(z.string().max(100), z.string().max(150).regex(/^(?:[a-z0-9]+(?:-[a-z0-9]+)*)?$/)),
}
export const ContentSettingsInput = z.object({ data: ContentDataSchema, expected_revision: z.number().int().positive().optional() }).superRefine((value, ctx) => {
  for (const [section, schema] of Object.entries(knownSettingsSections)) {
    if (value.data[section] === undefined) continue
    const result = schema.safeParse(value.data[section])
    if (!result.success) for (const issue of result.error.issues) ctx.addIssue({ code: "custom", path: ["data", section, ...issue.path], message: issue.message })
  }
})
export type ContentSettingsInputType = z.infer<typeof ContentSettingsInput>
export const ContentReviewInput = z.object({
  kind: z.enum(["shop", "product"]), product_id: z.string().min(1).max(100).nullable().default(null),
  author: z.string().trim().min(1).max(200), rating: z.number().int().min(1).max(5), body: z.string().trim().min(1).max(20000),
  media: z.array(safeUrl).max(12).default([]), review_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value, "Неверная дата"),
  status: z.enum(["pending", "published", "rejected"]).default("pending"), position: z.number().int().min(0).max(100000).default(0),
}).superRefine((value, ctx) => {
  if (value.kind === "product" && !value.product_id) ctx.addIssue({ code: "custom", path: ["product_id"], message: "Выберите товар" })
  if (value.kind === "shop" && value.product_id) ctx.addIssue({ code: "custom", path: ["product_id"], message: "Отзыв магазина не должен ссылаться на товар" })
})
export type ContentReviewInputType = z.infer<typeof ContentReviewInput>
export const ContentLeadInput = z.object({
  request_key: z.string().min(16).max(100).regex(/^[a-zA-Z0-9_-]+$/), name: z.string().trim().min(1).max(200),
  email: z.email().max(320), phone: z.string().max(50).optional(), message: z.string().trim().min(3).max(10000),
  consent: z.literal(true), website: z.string().max(0).default(""),
})
export type ContentLeadInputType = z.infer<typeof ContentLeadInput>
export const ContentLeadUpdate = z.object({ status: z.enum(["new", "in_progress", "closed"]), notes: z.string().max(10000).default("") })
export type ContentLeadUpdateType = z.infer<typeof ContentLeadUpdate>
export const ContentLeadQuery = z.object({
  q: z.string().trim().max(200).optional(), status: z.enum(["new", "in_progress", "closed"]).optional(),
  type: z.literal("contact").optional(), source: z.literal("contacts").optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30), offset: z.coerce.number().int().min(0).default(0),
})

const nonempty = z.string().trim().min(1).max(20000)
const optionalCategory = { category_id: z.string().min(1).optional() }
const HeroBlockSchema = z.object({ slides: z.array(z.object({ id: nonempty, label: nonempty, button: nonempty, title: z.array(nonempty).min(1).max(5), description: z.string(), image: safeUrl, mobileImage: safeUrl, alt: z.string(), ...optionalCategory })).min(1).max(20) })
const StoryBlockSchema = z.object({ sections: z.array(z.object({ title: nonempty, paragraphs: z.array(z.string()).min(1).max(100) })).min(1).max(30), artwork: z.array(z.object({ src: safeUrl, alt: z.string(), width: z.number().positive().max(20000), height: z.number().positive().max(20000) })).min(1).max(30) })
const HomeBenefitsSchema = z.object({ items: z.array(z.object({ icon: nonempty, title: nonempty, detail: z.string() })).max(30) })
const AboutBenefitsSchema = z.object({ items: z.array(z.object({ icon: nonempty, title: nonempty, paragraphs: z.array(z.string()) })).max(30) })
const QuestionsSchema = z.object({ items: z.array(z.object({ id: nonempty, question: nonempty, answer: nonempty })).max(200) })
const PopularSchema = z.object({ title: nonempty, link_label: z.string(), product_handles: z.array(nonempty).max(100) })
const AccessoriesSchema = z.object({ title: nonempty, items: z.array(z.object({ id: nonempty, title: nonempty, image: safeUrl, href: safeUrl.optional(), ...optionalCategory })).max(30) })
const ReviewBlockSchema = z.object({ title: nonempty, link_label: z.string() })

export function validatePublishedPageLayout(page: ContentPageInputType) {
  const allowed = new Set(["text", "hero", "benefits", "popular", "accessories", "story", "reviews", "layout-copy", "questions"])
  for (const block of page.blocks) {
    if (block.enabled && !allowed.has(block.type)) throw new Error(`Неизвестный шаблон блока «${block.type}»`)
    const pageTypes = page.slug === "home" ? ["hero", "benefits", "popular", "accessories", "story", "reviews", "text"] : page.slug === "about-us" ? ["layout-copy", "benefits", "text"] : page.slug === "faq" ? ["layout-copy", "questions", "text"] : ["delivery", "warranty", "contacts"].includes(page.slug) ? ["layout-copy", "text"] : ["text"]
    if (block.enabled && !pageTypes.includes(block.type)) throw new Error(`Шаблон «${block.type}» не поддерживается на странице «${page.slug}»`)
    if (page.slug !== "home" && block.type !== "text" && block.id !== block.type) throw new Error(`Блок «${block.type}» должен сохранять постоянную связь с композицией страницы`)
    if (block.type === "layout-copy" && !block.enabled) throw new Error("Блок текста и изображений принятой страницы должен оставаться включённым. Редактируйте отдельные поля")
    if (block.enabled && block.type === "text") z.object({ title: z.string(), text: z.string() }).parse(block.data)
  }
  for (const block of page.blocks.filter((item) => item.enabled)) {
    if (block.id === "layout-copy" || block.type === "layout-copy") {
      for (const [key, value] of Object.entries(block.data)) if (/^(?:text_\d+|media_\d+_(?:src|srcset|alt))$/.test(key) && typeof value !== "string") throw new Error(`Блок «${block.id}»: поле ${key} должно содержать текст`)
    }
    let schema: z.ZodType | undefined
    if (page.slug === "home") schema = ({ hero: HeroBlockSchema, benefits: HomeBenefitsSchema, popular: PopularSchema, accessories: AccessoriesSchema, story: StoryBlockSchema, reviews: ReviewBlockSchema } as Record<string, z.ZodType>)[block.type]
    if (page.slug === "about-us" && block.id === "benefits") schema = AboutBenefitsSchema
    if (page.slug === "faq" && block.id === "questions") schema = QuestionsSchema
    if (schema) {
      const parsed = schema.safeParse(block.data)
      if (!parsed.success) throw new Error(`Блок «${block.id}»: ${parsed.error.issues.map((issue) => `${issue.path.join(".")} — ${issue.message}`).join("; ")}`)
    }
  }
}
