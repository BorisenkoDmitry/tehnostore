import { z } from "@medusajs/framework/zod"
import { productOrderFields, tableOrderSchema, trashOrderFields, variantOrderFields } from "../../../lib/admin-table-order"

const TrashKind = z.enum(["folder", "product"])
export const CatalogTrashBodySchema = z.object({ kind: TrashKind, id: z.string().min(1).max(100), action: z.enum(["trash", "restore"]) })
export const CatalogTrashQuerySchema = z.object({
  kind: z.enum(["all", ...TrashKind.options]).default("all"),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().nonnegative().default(0),
  order: tableOrderSchema(trashOrderFields),
})
export type CatalogTrashBody = z.infer<typeof CatalogTrashBodySchema>
import { CatalogCategorySchema, CatalogProductSchema } from "../catalog-cms/validators"

const id = z.string().min(1).max(100)
const ids = z.array(id).max(1000)
const categoryLink = z.object({
  id,
  before: id.nullable(),
  parent: id.nullable(),
  was_placed: z.boolean(),
})
const productLink = z.object({
  id,
  before: ids,
  categories: ids,
})
const shortcutLink = z.object({ parent_id: id, category_id: id, before: z.boolean(), linked: z.boolean() })
export const GraphSchema = z.object({
  folders: z.array(categoryLink).max(100),
  products: z.array(productLink).max(100),
  shortcuts: z.array(shortcutLink).max(100).optional(),
}).refine(({ folders, products, shortcuts = [] }) =>
  new Set(folders.map((item) => item.id)).size === folders.length &&
  new Set(products.map((item) => item.id)).size === products.length &&
  new Set(shortcuts.map(({ parent_id, category_id }) => JSON.stringify([parent_id, category_id]))).size === shortcuts.length,
"Каждая карточка может быть указана только один раз")
export type GraphBody = z.infer<typeof GraphSchema>

const handle = z.string().trim().max(200).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional()
export const FolderSchema = CatalogCategorySchema.omit({ id: true }).extend({
  id: id.optional(),
  name: z.string().trim().min(1).max(100),
  handle,
  revision: z.string().optional(),
  filter_codes: CatalogCategorySchema.shape.filter_codes.nullable(),
  filter_disabled_codes: z.array(id).max(100).optional(),
  keep_legacy_filters: z.boolean().optional(),
  menu_visible: z.boolean().optional(),
  menu_label: z.string().trim().min(1).max(100).optional(),
})
export type FolderBody = z.infer<typeof FolderSchema>

export const ProductListSchema = z.object({
  q: z.string().trim().max(150).optional(),
  category_id: id.optional(),
  status: z.enum(["draft", "published", "proposed", "rejected"]).optional(),
  family_id: z.string().trim().min(1).max(100).optional(),
  family_category_id: id.optional(),
  include_families: z.literal("true").transform(() => true).optional(),
  offset: z.coerce.number().int().min(0).max(10000000).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(24),
  order: tableOrderSchema(productOrderFields),
}).refine((filter) => !!filter.family_id === !!filter.family_category_id, "Укажите семейство и его категорию")
export const VariantListSchema = ProductListSchema.safeExtend({ order: tableOrderSchema(variantOrderFields) })
export const ProductCanvasListSchema = z.object({
  filters: ProductListSchema,
  canvas: z.object({
    mode: z.enum(["on", "off"]),
    ids: z.array(id).max(10000),
    category_ids: z.array(id).max(10000).optional(),
    exclude_ids: z.array(id).max(10000).optional(),
  }),
})
export type ProductCanvasListBody = z.infer<typeof ProductCanvasListSchema>
export const FamilyListSchema = z.object({ category_id: id.optional() })

export const ConstructorProductSchema = CatalogProductSchema.omit({ category_ids: true, variants: true }).extend({
  brand: z.string().trim().max(100),
  id: id.optional(),
  revision: z.string().optional(),
  title: z.string().trim().min(1).max(250),
  family_category_id: id.optional(),
  new_family_name: z.string().trim().min(1).max(87).optional(),
  handle,
  description_html: z.string().max(100000).optional(),
  images: z.array(z.string().trim().max(2000).refine((value) => /^https?:\/\/[^\s\\]+$/i.test(value) || /^\/(?!\/)[^\s\\]+$/.test(value))).max(100).optional(),
  axes: z.array(z.object({ code: id, title: z.string().trim().min(1).max(100).optional() })).max(10).optional(),
  variant_spec_fields: z.array(id).max(11).optional(),
  variants: z.array(CatalogProductSchema.shape.variants.element.omit({ id: true }).extend({
    id: id.optional(),
    title: z.string().trim().min(1).max(250),
    sku: z.string().trim().max(250).nullable().optional(),
    price: z.number().nonnegative().max(100000000).optional(),
    choices: z.record(z.string(), z.string().trim().min(1).max(250)).optional(),
  })).min(1).max(500),
})
export type ConstructorProductBody = z.infer<typeof ConstructorProductSchema>
