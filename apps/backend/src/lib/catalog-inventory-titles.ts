import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { updateInventoryItemsWorkflow } from "@medusajs/medusa/core-flows"

const lockKey = "catalog-inventory-titles"

export type InventoryTitleChange = { id: string; title: string; previous: string | null }

export async function syncCatalogInventoryTitles(container: MedusaContainer, productIds: string[]) {
  if (!productIds.length) return []
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  return container.resolve(Modules.LOCKING).execute(lockKey, async () => {
    const { data: products } = await query.graph({
      entity: "product",
      fields: ["id", "title", "variants.id", "variants.inventory_items.required_quantity",
        "variants.inventory_items.inventory.id", "variants.inventory_items.inventory.title",
        "variants.inventory_items.inventory.variants.id"],
      filters: { id: [...new Set(productIds)] },
    })
    const changes: InventoryTitleChange[] = []
    for (const product of products) {
      if (product.variants?.length !== 1) continue
      const [variant] = product.variants
      if (variant.inventory_items?.length !== 1) continue
      const [link] = variant.inventory_items
      if (!link || Number(link.required_quantity) !== 1) continue
      const item = link.inventory
      if (item?.variants?.length !== 1 || item.variants[0]?.id !== variant.id) continue
      if (item.title !== product.title) changes.push({ id: item.id, title: product.title, previous: item.title ?? null })
    }
    if (changes.length) {
      await updateInventoryItemsWorkflow(container).run({ input: { updates: changes.map(({ id, title }) => ({ id, title })) } })
    }
    return changes
  }, { timeout: 10, expire: 60 })
}

export async function restoreCatalogInventoryTitles(container: MedusaContainer, changes: InventoryTitleChange[] | undefined) {
  if (!changes?.length) return
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  await container.resolve(Modules.LOCKING).execute(lockKey, async () => {
    const { data: items } = await query.graph({
      entity: "inventory_item",
      fields: ["id", "title"],
      filters: { id: changes.map(({ id }) => id) },
    })
    const current = new Map(items.map(({ id, title }) => [id, title]))
    const updates = changes.filter(({ id, title }) => current.get(id) === title)
      .map(({ id, previous }) => ({ id, title: previous }))
    if (updates.length) await updateInventoryItemsWorkflow(container).run({ input: { updates } })
  }, { timeout: 10, expire: 60 })
}
