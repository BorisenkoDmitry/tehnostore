import { z } from "@medusajs/framework/zod"
import { isProductSpecificationCode } from "../../../lib/product-specification"

export const CatalogDefinitionSchema = z.object({
  id: z.string().optional(),
  code: z.string().trim().regex(/^[a-z][a-z0-9_]{0,99}$/, "Используйте стабильный латинский код")
    .refine((code) => !isProductSpecificationCode(code), "Этот код зарезервирован для характеристик товара"),
  label: z.string().trim().min(1).max(150),
  type: z.enum(["text", "number", "boolean", "money"]),
  unit: z.string().trim().max(30).nullable(),
  public: z.boolean(),
  filterable: z.boolean(),
  position: z.number().int().min(0).max(10000),
  enabled: z.boolean(),
  role: z.enum(["spec", "color", "variant_axis"]).default("spec"),
  filter_control: z.enum(["checkbox", "swatch", "range"]).default("checkbox"),
  choice_values: z.array(z.string().trim().min(1).max(250)).max(100).optional(),
  choice_colors: z.record(z.string().min(1).max(250), z.string().regex(/^#[0-9a-f]{6}$/i)).optional(),
})
export type CatalogDefinitionBody = z.infer<typeof CatalogDefinitionSchema>

const AttributeSchema = z.object({ code: z.string().min(1).max(100), values: z.array(z.string().trim().min(1).max(1000)).min(1).max(50) })
const uniqueAttributes = (rows: { code: string }[]) => new Set(rows.map((row) => row.code)).size === rows.length
const AttributesSchema = z.array(AttributeSchema).max(150).refine(uniqueAttributes, "Характеристика указана дважды")
const ProductAttributesSchema = z.array(AttributeSchema.extend({
  label: z.string().trim().min(1).max(150).optional(),
})).max(150).refine(uniqueAttributes, "Характеристика указана дважды")
export const CatalogProductSchema = z.object({
  visible: z.boolean(),
  kind: z.string().trim().regex(/^[a-z][a-z0-9_-]{0,79}$/, "Укажите стабильный код типа товара"),
  brand: z.string().trim().min(1).max(100),
  category_ids: z.array(z.string().min(1)).min(1).max(20),
  family_id: z.string().trim().max(100).nullable(),
  seo: z.object({ title: z.string().trim().max(150), description: z.string().trim().max(500) }),
  attributes: ProductAttributesSchema,
  variants: z.array(z.object({ id: z.string().min(1), attributes: AttributesSchema, old_price: z.number().nonnegative().max(100000000).nullable() })).min(1).max(500),
})
export type CatalogProductBody = z.infer<typeof CatalogProductSchema>

export const CatalogStockSchema = z.object({
  quantity: z.number().int().min(0).max(1000000),
  location_id: z.string().min(1),
  reason: z.string().trim().min(5).max(1000),
})
export type CatalogStockBody = z.infer<typeof CatalogStockSchema>

export const CatalogCategorySchema = z.object({
  id: z.string().min(1),
  published: z.boolean(),
  kind: z.string().trim().regex(/^[a-z][a-z0-9_-]{0,79}$/),
  position: z.number().int().min(0).max(10000),
  filter_codes: z.array(z.string().min(1).max(100)).max(20),
  seo: z.object({
    title: z.string().trim().max(150), description: z.string().trim().max(500),
    text: z.string().trim().max(20000), text_html: z.string().max(100000).optional(),
  }),
})
export type CatalogCategoryBody = z.infer<typeof CatalogCategorySchema>

export const CatalogProfileSchema = z.object({
  scope: z.string().trim().regex(/^[a-z][a-z0-9_-]{0,79}$/),
  region_id: z.string().min(1).max(100),
  product_types: z.array(z.object({
    code: z.string().trim().regex(/^[a-z][a-z0-9_-]{0,79}$/),
    label: z.string().trim().min(1).max(100),
    enabled: z.boolean(),
    variant_axes: z.array(z.string().min(1).max(100)).max(10),
    filter_codes: z.array(z.string().min(1).max(100)).max(40),
  })).min(1).max(100).refine((types) => new Set(types.map((type) => type.code)).size === types.length, "Коды типов должны быть уникальны"),
})
export type CatalogProfileBody = z.infer<typeof CatalogProfileSchema>
