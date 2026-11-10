import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { refreshCatalogVariantSearch } from "../lib/catalog-variant-search"

export default async function backfillCatalogVariantSearch({ container }: ExecArgs) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  for (let skip = 0; ; skip += 200) {
    const { data } = await query.graph({ entity: "product", fields: ["id"], pagination: { skip, take: 200, order: { id: "ASC" } } })
    await refreshCatalogVariantSearch(container, data.map(({ id }) => id))
    if (data.length < 200) break
  }
}
