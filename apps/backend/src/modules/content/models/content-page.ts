import { model } from "@medusajs/framework/utils"
import type { ContentBlock, ContentMetadata, ContentNode, PageSnapshot } from "../types"

const ContentPage = model.define("content_page", {
  id: model.id().primaryKey(),
  slug: model.text().unique(),
  title: model.text(),
  body: model.json<ContentNode[]>().default([]),
  blocks: model.json<ContentBlock[]>().default([]),
  metadata: model.json<ContentMetadata>().default({}),
  status: model.enum(["draft", "published"]).default("draft"),
  revision: model.number().default(1),
  published_at: model.dateTime().nullable(),
  published_snapshot: model.json<PageSnapshot>().nullable(),
  provenance: model.json().nullable(),
}).indexes([{ on: ["status", "slug"] }])

export default ContentPage
