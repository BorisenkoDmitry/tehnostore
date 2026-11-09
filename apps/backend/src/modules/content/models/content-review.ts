import { model } from "@medusajs/framework/utils"

const ContentReview = model.define("content_review", {
  id: model.id().primaryKey(),
  source_key: model.text().unique(),
  kind: model.enum(["shop", "product"]),
  product_id: model.text().nullable(),
  author: model.text(),
  rating: model.number(),
  body: model.text(),
  media: model.json<string[]>().default([]),
  review_date: model.text(),
  status: model.enum(["pending", "published", "rejected"]).default("pending"),
  position: model.number().default(0),
  provenance: model.json().nullable(),
}).indexes([{ on: ["status", "kind", "position"] }, { on: ["product_id", "status"] }])

export default ContentReview
