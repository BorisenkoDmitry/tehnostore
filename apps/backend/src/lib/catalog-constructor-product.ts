import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import type { CatalogDefinitionData } from "./catalog-cms"
import { normalizeCatalogValue } from "./catalog-cms"
import { stockProvenanceKnown } from "./texno-cart-rules"
import type { CatalogAttributeInput } from "../modules/catalog-attributes/types"
import { detachedVariationFields, isLibraryDefinition, libraryChoices, libraryVariations } from "./catalog-variation-library"

export type ConstructorPrice = {
  id: string
  amount: number
  currency_code: string
  price_list_id: string | null
  min_quantity: number | null
  max_quantity: number | null
  rules_count?: number
}
export type NativeOption = { id: string; title: string; values: { id: string; value: string }[] }
export type ConstructorVariant = {
  id: string
  title: string
  sku: string | null
  variant_rank?: number | null
  created_at?: string | Date
  updated_at: string
  product_id: string
  metadata: Record<string, unknown> | null
  options: { option_id: string; value: string }[]
  price_set?: { prices?: ConstructorPrice[] }
  catalog_variant?: { attributes: CatalogAttributeInput[]; source_data?: Record<string, unknown> }
  inventory_items?: { inventory?: { location_levels?: { location_id: string; stocked_quantity: number; reserved_quantity: number }[] } }[]
}
export type ConstructorProduct = {
  id: string
  title: string
  handle: string
  description: string | null
  thumbnail: string | null
  status: "draft" | "published" | "proposed" | "rejected"
  updated_at: string
  metadata: Record<string, unknown> | null
  images: { url: string }[]
  categories: { id: string; name: string }[]
  sales_channels: { id: string }[]
  options: NativeOption[]
  variants: ConstructorVariant[]
  catalog_record?: { attributes: CatalogAttributeInput[]; source_data?: Record<string, unknown> }
}

const variantFields = [
  "id", "title", "sku", "product_id", "metadata", "updated_at", "variant_rank", "created_at",
  "options.option_id", "options.value", "price_set.prices.*", "catalog_variant.attributes", "catalog_variant.source_data",
  "inventory_items.inventory.location_levels.location_id", "inventory_items.inventory.location_levels.stocked_quantity", "inventory_items.inventory.location_levels.reserved_quantity",
]

export async function readConstructorProduct(container: MedusaContainer, id: string) {
  const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "product",
    fields: [
      "id", "title", "handle", "description", "thumbnail", "status", "metadata", "updated_at", "images.url",
      "categories.id", "categories.name", "sales_channels.id", "options.id", "options.title", "options.values.id", "options.values.value",
      "catalog_record.attributes", "catalog_record.source_data",
      ...variantFields.map((field) => `variants.${field}`),
    ],
    filters: { id },
  })
  if (!data[0] || data[0].metadata?.catalog_trash) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Товар не найден в каталоге")
  const product = data[0] as unknown as ConstructorProduct
  const variants = [...product.variants].sort((a, b) => (a.variant_rank ?? 0) - (b.variant_rank ?? 0)
    || new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime()
    || a.id.localeCompare(b.id))
  return { ...product, variants }
}

export function constructorProductRevision(product: ConstructorProduct) {
  return JSON.stringify([
    new Date(product.updated_at).toISOString(),
    ...product.variants.map((variant) => `${variant.id}:${new Date(variant.updated_at).toISOString()}`).sort(),
  ])
}

export function basePrice(variant: ConstructorVariant, currency: string) {
  return variant.price_set?.prices?.find((price) => price.currency_code === currency && !price.price_list_id && !price.min_quantity && !price.max_quantity && !price.rules_count)
}

export function constructorVariantStock(variant: ConstructorVariant) {
  const known = stockProvenanceKnown(variant)
  return {
    known,
    levels: known ? (variant.inventory_items ?? []).flatMap((item) => item.inventory?.location_levels ?? []).map((level) => ({
      location_id: level.location_id,
      stocked_quantity: Number(level.stocked_quantity),
      reserved_quantity: Number(level.reserved_quantity),
    })) : [],
  }
}

export function constructorAxes(product: ConstructorProduct, definitions: CatalogDefinitionData[], includeDetached = false) {
  const stored = product.metadata?.catalog_constructor_axes as Record<string, string> | undefined
  const library = libraryVariations(product.metadata)
  const codes = new Set(Object.values(library ?? {}).flatMap(Object.keys))
  const migrated = definitions.filter((definition) => codes.has(definition.code)).map(({ code, label }) => ({ code, title: label, id: code, library: true }))
  const native = product.options.flatMap((option) => {
    const title = normalizeCatalogValue(option.title)
    const definition = definitions.find((item) => stored?.[item.code] === option.title)
      ?? (!library && !product.metadata?.insales_product_id ? definitions.find((item) =>
        isLibraryDefinition(item) && [item.label, ...(item.aliases ?? [])].some((label) => normalizeCatalogValue(label) === title)
      ) : undefined)
    return definition && !codes.has(definition.code) ? [{ code: definition.code, title: option.title, id: option.id, library: false }] : []
  })
  const storedOrder = Array.isArray(product.metadata?.catalog_constructor_axis_order) ? product.metadata.catalog_constructor_axis_order : []
  const positions = new Map(definitions.map(({ code, position }) => [code, position]))
  const order = (code: string) => {
    const index = storedOrder.indexOf(code)
    return index === -1 ? storedOrder.length + (positions.get(code) ?? 10000) : index
  }
  const detached = detachedVariationFields(product.metadata)
  return [...migrated, ...native].filter((axis) => includeDetached || !detached.has(axis.code))
    .sort((a, b) => order(a.code) - order(b.code) || a.title.localeCompare(b.title, "ru"))
}

export function constructorChoices(product: ConstructorProduct, variant: ConstructorVariant, axes: ReturnType<typeof constructorAxes>) {
  const assigned = libraryChoices(product.metadata, variant.id)
  return Object.fromEntries(axes.flatMap((axis) => {
    const value = axis.library ? assigned[axis.code]?.choice : variant.options.find((option) => option.option_id === axis.id)?.value
    return value === undefined ? [] : [[axis.code, value]]
  }))
}
