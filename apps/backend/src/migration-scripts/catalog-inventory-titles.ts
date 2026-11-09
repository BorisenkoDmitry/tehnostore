import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { syncCatalogInventoryTitles } from "../lib/catalog-inventory-titles"

export default async function catalogInventoryTitles({ container }: ExecArgs) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const take = 100
  let updated = 0
  for (let skip = 0; ; skip += take) {
    const { data: products } = await query.graph({
      entity: "product",
      fields: ["id"],
      pagination: { skip, take, order: { id: "ASC" } },
    })
    const changes = await syncCatalogInventoryTitles(container, products.map(({ id }) => id))
    updated += changes.length
    if (products.length < take) break
  }
  container.resolve(ContainerRegistrationKeys.LOGGER).info(`Updated ${updated} catalog inventory titles`)
}
