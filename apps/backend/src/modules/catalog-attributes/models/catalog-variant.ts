import { model } from "@medusajs/framework/utils"
import CatalogRecord from "./catalog-record"
import CatalogAttribute from "./catalog-attribute"
import { CatalogAttributeInput } from "../types"

const CatalogVariant = model.define("catalog_variant", {
  id: model.id().primaryKey(),
  source_variant_id: model.text().unique().nullable(),
  source_data: model.json<Record<string, unknown>>(),
  attributes: model.json<CatalogAttributeInput[]>(),
  record: model.belongsTo(() => CatalogRecord, { mappedBy: "variants" }),
  attribute_values: model.hasMany(() => CatalogAttribute, { mappedBy: "variant" }),
})

export default CatalogVariant
