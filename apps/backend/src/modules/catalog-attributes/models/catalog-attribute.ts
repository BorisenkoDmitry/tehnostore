import { model } from "@medusajs/framework/utils"
import CatalogRecord from "./catalog-record"
import CatalogVariant from "./catalog-variant"

const CatalogAttribute = model.define("catalog_attribute", {
  id: model.id().primaryKey(),
  key: model.text(),
  label: model.text(),
  raw_value: model.text(),
  value: model.text(),
  normalized_value: model.text(),
  type: model.enum(["text", "number", "boolean"]),
  numeric_value: model.float().nullable(),
  unit: model.text().nullable(),
  filterable: model.boolean().default(false),
  scope: model.enum(["product", "variant"]),
  record: model.belongsTo(() => CatalogRecord, { mappedBy: "attribute_values" }),
  variant: model.belongsTo(() => CatalogVariant, { mappedBy: "attribute_values" }).nullable(),
}).indexes([
  { name: "IDX_catalog_attribute_filter", on: ["key", "normalized_value", "record_id"] },
  { name: "IDX_catalog_attribute_record", on: ["record_id", "key"] },
  { name: "IDX_catalog_attribute_variant", on: ["variant_id"] },
])

export default CatalogAttribute
