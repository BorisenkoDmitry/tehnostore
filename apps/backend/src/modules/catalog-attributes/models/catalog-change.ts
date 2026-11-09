import { model } from "@medusajs/framework/utils"

const CatalogChange = model.define("catalog_change", {
  id: model.id().primaryKey(),
  product_id: model.text(),
  variant_id: model.text().nullable(),
  actor_id: model.text(),
  action: model.text(),
  reason: model.text(),
  before: model.json(),
  after: model.json(),
}).indexes([{ on: ["product_id", "created_at"] }])

export default CatalogChange
