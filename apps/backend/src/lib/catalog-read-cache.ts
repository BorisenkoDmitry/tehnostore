import type { ICachingModuleService, MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { CATALOG_ATTRIBUTES_MODULE } from "../modules/catalog-attributes"
import type CatalogAttributesModuleService from "../modules/catalog-attributes/service"
import { randomUUID } from "node:crypto"

const REVISION_KEY = "catalog-read:revision:v1"

export async function advanceCatalogCache(container: MedusaContainer) {
  const caching = container.resolve<ICachingModuleService>(Modules.CACHING, { allowUnregistered: true })
  if (caching && typeof caching.set === "function") await caching.set({ key: REVISION_KEY, data: { value: randomUUID() }, ttl: 86400, tags: [] })
}

// Only public-context, non-transactional reads belong here. Prices, stock,
// customer data and channel visibility are deliberately read on every request.
export async function cachedCatalogRead<T extends object>(container: MedusaContainer, key: string, tags: string[], load: () => Promise<T>): Promise<T> {
  const caching = container.resolve<ICachingModuleService>(Modules.CACHING, { allowUnregistered: true })
  if (!caching || typeof caching.get !== "function" || typeof caching.set !== "function") return load()
  const revision = await caching.get({ key: REVISION_KEY })
  const generation = typeof revision?.value === "string" ? revision.value : "initial"
  const cacheKey = `catalog-read:v2:${generation}:${key}`
  const hit = await caching.get({ key: cacheKey })
  if (hit != null) return hit as T
  const data = await load()
  await caching.set({ key: cacheKey, data, tags, ttl: 300, options: { autoInvalidate: true } })
  return data
}

export function getCatalogDefinitions(container: MedusaContainer) {
  return cachedCatalogRead(container, "definitions", ["CatalogDefinition:list:*"], () =>
    container.resolve<CatalogAttributesModuleService>(CATALOG_ATTRIBUTES_MODULE).listCatalogDefinitions({}, { take: 1000, order: { position: "ASC", label: "ASC" } })
  )
}

export function getCatalogCategories(container: MedusaContainer) {
  return cachedCatalogRead(container, "categories", ["ProductCategory:list:*"], async () => {
    const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
      entity: "product_category",
      fields: ["id", "handle", "name", "parent_category_id", "metadata", "is_active", "is_internal"],
      pagination: { take: 1000 },
    })
    return data
  })
}
