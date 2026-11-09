import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { getCatalogProfile } from "../../../../lib/catalog-cms"
import { basePrice, constructorVariantStock, type ConstructorVariant } from "../../../../lib/catalog-constructor-product"
import { tableOrderBy } from "../../../../lib/admin-table-order"
import { VariantListSchema } from "../validators"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { q, offset, limit, order } = VariantListSchema.parse(req.query)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const filters: Record<string, unknown> = {
    product: { metadata: { catalog_trash: null } },
    ...(q ? { $or: [{ title: { $ilike: `%${q}%` } }, { sku: { $ilike: `%${q}%` } }] } : {}),
  }
  const [profile, { data, metadata }] = await Promise.all([
    getCatalogProfile(req.scope),
    query.graph({
      entity: "product_variant",
      fields: ["id", "title", "sku", "created_at", "metadata", "product.id", "product.title", "price_set.prices.*",
        "catalog_variant.source_data", "inventory_items.inventory.location_levels.location_id",
        "inventory_items.inventory.location_levels.stocked_quantity", "inventory_items.inventory.location_levels.reserved_quantity"],
      filters,
      pagination: { skip: offset, take: limit, order: tableOrderBy(order ?? "title") },
    }),
  ])
  const variants = (data as unknown as (ConstructorVariant & { created_at: string; product: { id: string; title: string } })[]).map((row) => {
    const price = basePrice(row, profile.currency_code)
    return { id: row.id, title: row.title, sku: row.sku, created_at: row.created_at, product: row.product, price: price ? Number(price.amount) : null, stock: constructorVariantStock(row) }
  })
  res.json({ variants, count: metadata?.count ?? variants.length, currency: profile.currency_code })
}
