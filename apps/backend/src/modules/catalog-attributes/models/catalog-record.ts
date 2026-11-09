import { model } from "@medusajs/framework/utils"
import CatalogVariant from "./catalog-variant"
import CatalogAttribute from "./catalog-attribute"
import { CatalogAttributeInput } from "../types"

const CatalogRecord = model.define("catalog_record", {
  id: model.id().primaryKey(),
  source_product_id: model.text().unique().nullable(),
  source_hash: model.text(),
  // Private import provenance. Never add source_data to Store API allowed fields.
  source_data: model.json<Record<string, unknown>>(),
  searchable_text: model.text(),
  family_id: model.text().nullable(),
  family_signature: model.text().nullable(),
  attributes: model.json<CatalogAttributeInput[]>(),
  variants: model.hasMany(() => CatalogVariant, { mappedBy: "record" }),
  attribute_values: model.hasMany(() => CatalogAttribute, { mappedBy: "record" }),
})

export default CatalogRecord
