/**
 * Temporary, explicitly marked product quotes for the TEXNO catalog.
 * Run with: pnpm exec medusa exec ./src/scripts/seed-catalog-examples.ts
 * Re-running creates only missing records; it never overwrites merchant edits.
 * Replace this marked set with the future Excel import through normal workflows.
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError, Modules, ProductStatus } from "@medusajs/framework/utils"
import { createProductCategoriesWorkflow, createProductsWorkflow } from "@medusajs/medusa/core-flows"
import { readSeedData } from "../lib/seed-data"

const categoryDefinitions = [
  { handle: "apple-iphone", name: "Apple iPhone", parent: null },
  { handle: "samsung", name: "Samsung", parent: null },
  { handle: "xiaomi", name: "Xiaomi", parent: null },
  { handle: "honor", name: "Huawei Honor", parent: null },
  { handle: "aksessuary", name: "Аксессуары", parent: null },
  { handle: "apple-iphone-11-pro", name: "Apple iPhone 11 Pro", parent: "apple-iphone" },
  { handle: "xiaomi-redmi-note-5", name: "Xiaomi Redmi Note 5", parent: "xiaomi" },
  { handle: "xiaomi-redmi-note-7", name: "Xiaomi Redmi Note 7", parent: "xiaomi" },
  { handle: "naushniki-i-garnitury", name: "Наушники и гарнитуры", parent: "aksessuary" },
]

export default async function seedCatalogExamples({ container }: ExecArgs) {
  const examples = readSeedData<{ source_id: string; title: string; image: string; source_url: string; old_price: number | null; price: number; options: Record<string, string>; category_handles: string[] }[]>("catalog-examples.json")
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: stores } = await query.graph({ entity: "store", fields: ["id", "default_sales_channel_id"] })
  const { data: profiles } = await query.graph({ entity: "shipping_profile", fields: ["id", "type"] })
  const salesChannelId = stores[0]?.default_sales_channel_id
  const profile = profiles.find((item) => item.type === "default") ?? profiles[0]
  if (!salesChannelId || !profile) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Initialize the store, sales channel and shipping profile first")
  }

  const { data: existingCategories } = await query.graph({
    entity: "product_category",
    fields: ["id", "handle", "metadata"],
    filters: { handle: categoryDefinitions.map((item) => item.handle) },
  })
  const categoryIds = new Map(existingCategories.map((item) => [item.handle, item.id]))
  for (const existing of existingCategories) {
    if (existing.metadata?.catalog_scope !== "texno") {
      throw new MedusaError(MedusaError.Types.CONFLICT, `Category ${existing.handle} already exists outside the TEXNO scope; map it explicitly before seeding`)
    }
  }
  let createdCategories = 0
  for (const item of categoryDefinitions) {
    if (categoryIds.has(item.handle)) continue
    const { result } = await createProductCategoriesWorkflow(container).run({
      input: {
        product_categories: [{
          name: item.name,
          handle: item.handle,
          parent_category_id: item.parent ? categoryIds.get(item.parent) : null,
          is_active: true,
          is_internal: false,
          metadata: { catalog_scope: "texno", is_catalog_example: true },
        }],
      },
    })
    categoryIds.set(item.handle, result[0].id)
    createdCategories++
  }

  const handles = examples.map((item) => `texno-example-${item.source_id}`)
  const { data: existingProducts } = await query.graph({
    entity: "product", fields: ["id", "handle", "metadata"], filters: { handle: handles },
  })
  for (const existing of existingProducts) {
    if (existing.metadata?.is_catalog_example !== true) {
      throw new MedusaError(MedusaError.Types.CONFLICT, `Product handle ${existing.handle} already belongs to a non-example product`)
    }
  }
  const existingHandles = new Set(existingProducts.map((item) => item.handle))
  const missing = examples.filter((item) => !existingHandles.has(`texno-example-${item.source_id}`))
  const products = missing.map((item) => {
    const options: Record<string, string> = Object.fromEntries(
      Object.entries(item.options).filter((entry): entry is [string, string] => typeof entry[1] === "string")
    )
    return {
    title: item.title,
    handle: `texno-example-${item.source_id}`,
    description: "Временный пример из каталога TEXNO STORE. Исторические цены; наличие не подтверждено. Покупка не подключена.",
    status: ProductStatus.PUBLISHED,
    thumbnail: item.image,
    images: [{ url: item.image }],
    shipping_profile_id: profile.id,
    sales_channels: [{ id: salesChannelId }],
    category_ids: item.category_handles.map((handle) => categoryIds.get(handle)!),
    metadata: {
      catalog_scope: "texno",
      is_catalog_example: true,
      catalog_source_id: item.source_id,
      catalog_source_url: item.source_url,
      catalog_source_captured_at: "2026-11-06",
      catalog_original_price_rub: item.old_price,
    },
    options: Object.entries(options).map(([title, value]) => ({ title, values: [value] })),
    variants: [{
      title: Object.values(options).join(" / "),
      sku: `TEXNO-EXAMPLE-${item.source_id}`,
      options,
      manage_inventory: true,
      allow_backorder: false,
      prices: [{ currency_code: "rub", amount: item.price }],
    }],
    }
  })
  if (products.length) {
    await createProductsWorkflow(container).run({ input: { products } })
  }

  const { data: scopedProducts } = await query.graph({ entity: "product", fields: ["id"], filters: { handle: handles } })
  const search = container.resolve(Modules.SEARCH)
  await search.ingest({ name: "product.updated", data: scopedProducts.map((item) => ({ id: item.id })) } as never)
  logger.info(`TEXNO examples: ${products.length} products and ${createdCategories} categories created; ${scopedProducts.length} products indexed. Existing data preserved.`)
}
