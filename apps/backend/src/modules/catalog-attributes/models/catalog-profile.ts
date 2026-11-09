import { model } from "@medusajs/framework/utils"
import type { CatalogProductType } from "../types"

/** One store installation has one profile and its own database. This is not a
 * tenant key and does not add tenant filtering to commerce entities. */
const CatalogProfile = model.define("catalog_profile", {
  id: model.id().primaryKey(),
  key: model.text().unique(),
  scope: model.text(),
  region_id: model.text(),
  product_types: model.json<CatalogProductType[]>(),
})

export default CatalogProfile
