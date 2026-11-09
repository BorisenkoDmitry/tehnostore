import "server-only"
import { getCatalogConfig } from "./catalog"
import { getNavigation } from "./navigation"
import type { ProductDescriptionNode } from "./catalog-product"

export async function getCatalogSeo() {
  const [config, navigation] = await Promise.all([getCatalogConfig(), getNavigation()])
  const categories: Record<string, { name: string; title?: string; description?: string; text?: string; content?: ProductDescriptionNode[] }> = {}
  for (const category of config?.categories ?? []) {
    const value = { name: category.name, ...category.seo }
    categories[category.id] = value
    categories[category.handle] = value
  }
  for (const node of navigation?.items.find((item) => item.kind === "catalog")?.children ?? []) {
    const handle = node.href.match(/^\/(?:collection|collections|categories)\/([^?#/]+)/)?.[1]
    categories[node.id] = { ...(handle ? categories[handle] : {}), name: node.label }
  }
  return categories
}
