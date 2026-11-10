import { model } from "@medusajs/framework/utils"

// A private read projection, not merchant-authored data. Only products with
// multiple variants need correlation checks after the product search index.
const CatalogVariantSearch = model.define("catalog_variant_search", {
  id: model.text().primaryKey(),
  fields: model.json<string[]>(),
  rows: model.json<string[][]>(),
})

export default CatalogVariantSearch
