import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { refreshCatalogVariantSearch } from "../lib/catalog-variant-search"
import { resolveProductIds } from "../search/helpers/resolve-product-ids"

export default async function catalogVariantSearch({ event, container }: SubscriberArgs) {
  const ids = await resolveProductIds(event, { container: { query: container.resolve(ContainerRegistrationKeys.QUERY), logger: container.resolve(ContainerRegistrationKeys.LOGGER) } } as Parameters<typeof resolveProductIds>[1])
  await refreshCatalogVariantSearch(container, ids)
}

export const config: SubscriberConfig = {
  event: ["product.created", "product.updated", "product.deleted", "product-variant.created", "product-variant.updated", "product-variant.deleted", "product-option.created", "product-option.updated", "product-option.deleted", "product-option-value.updated", "product-option-value.deleted"],
}
