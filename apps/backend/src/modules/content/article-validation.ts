import { z } from "@medusajs/framework/zod"
import { ContentMetadataSchema, ContentNodeSchema, safeContentUrl } from "./validation"
import { ArticleDocumentSchema, ArticleImageUrl } from "./article-document"

export const ContentArticleInput = z.object({
  title: z.string().trim().min(1, "Укажите заголовок").max(300),
  slug: z.string().min(1).max(150).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Используйте латинские буквы, цифры и дефисы"),
  excerpt: z.string().trim().max(1000).default(""),
  cover_image: z.union([ArticleImageUrl, z.literal("")]).default(""),
  cover_alt: z.string().max(300).default(""),
  body: z.union([z.array(ContentNodeSchema).max(1000), ArticleDocumentSchema]).default([]),
  metadata: ContentMetadataSchema.default({}),
  expected_revision: z.number().int().positive().optional(),
}).strict()
export type ContentArticleInputType = z.infer<typeof ContentArticleInput>

export const ContentArticleListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).max(1000000).default(0),
  order: z.enum(["title", "-title", "slug", "-slug", "created_at", "-created_at", "updated_at", "-updated_at"]).default("-created_at"),
}).strict()
export const ContentArticleDeleteQuery = z.object({ expected_revision: z.coerce.number().int().positive() }).strict()

export const ArticleIndexSettingsInput = z.object({
  title: z.string().trim().min(1, "Укажите заголовок страницы").max(300).default("Статьи"),
  intro: z.string().max(5000).default(""),
  meta_title: z.string().max(300).default(""),
  meta_description: z.string().max(3000).default(""),
  social_image: z.union([ArticleImageUrl, z.literal("")]).default(""),
  canonical: z.union([z.string().max(2000).refine((url) => url.startsWith("https://") && safeContentUrl(url), "Укажите HTTPS-адрес без учётных данных"), z.literal("")]).default(""),
  noindex: z.boolean().default(true),
  expected_revision: z.number().int().min(0),
}).strict()
export type ArticleIndexSettingsInputType = z.infer<typeof ArticleIndexSettingsInput>
export const ARTICLE_INDEX_SETTINGS_KEY = "articles-index"
export const defaultArticleIndexSettings = () => ArticleIndexSettingsInput.parse({ expected_revision: 0 })
