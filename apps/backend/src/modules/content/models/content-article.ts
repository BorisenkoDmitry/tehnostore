import { model } from "@medusajs/framework/utils"
import type { ContentMetadata, ContentNode } from "../types"
import type { ArticleDocument } from "../article-document"

// Separate storage keeps articles outside every existing public page reader.
const ContentArticle = model.define("content_article", {
  id: model.id().primaryKey(),
  slug: model.text().unique(),
  title: model.text(),
  excerpt: model.text().default(""),
  cover_image: model.text().default(""),
  cover_alt: model.text().default(""),
  body: model.json<ContentNode[] | ArticleDocument>().default([]),
  metadata: model.json<ContentMetadata>().default({}),
  revision: model.number().default(1),
}).indexes([{ on: ["created_at"] }])

export default ContentArticle
