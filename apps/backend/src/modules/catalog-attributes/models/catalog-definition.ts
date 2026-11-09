import { model } from "@medusajs/framework/utils"

const CatalogDefinition = model.define("catalog_definition", {
  id: model.id().primaryKey(),
  code: model.text().unique(),
  label: model.text(),
  aliases: model.json<string[]>().default([]),
  choice_values: model.json<string[]>().default([]),
  choice_colors: model.json<Record<string, string>>().nullable(),
  type: model.enum(["text", "number", "boolean", "money"]),
  unit: model.text().nullable(),
  public: model.boolean().default(true),
  filterable: model.boolean().default(false),
  position: model.number().default(0),
  enabled: model.boolean().default(true),
  role: model.enum(["spec", "color", "variant_axis"]).default("spec"),
  filter_control: model.enum(["checkbox", "swatch", "range"]).default("checkbox"),
})

export default CatalogDefinition
