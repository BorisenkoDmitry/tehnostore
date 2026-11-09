import { model } from "@medusajs/framework/utils"

const ContentLead = model.define("content_lead", {
  id: model.id().primaryKey(),
  request_key: model.text().unique(),
  name: model.text(),
  email: model.text(),
  phone: model.text().nullable(),
  message: model.text(),
  consent: model.boolean(),
  status: model.enum(["new", "in_progress", "closed"]).default("new"),
  notes: model.text().default(""),
  source: model.text().default("contacts"),
  type: model.enum(["contact"]).default("contact"),
  product_id: model.text().nullable(),
  order_id: model.text().nullable(),
}).indexes([{ on: ["status", "created_at"] }, { on: ["type", "status", "created_at"] }, { on: ["email", "created_at"] }])

export default ContentLead
