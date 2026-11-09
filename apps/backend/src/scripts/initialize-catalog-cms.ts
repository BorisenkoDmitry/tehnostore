import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { createProductCategoriesWorkflow, updateProductCategoriesWorkflow } from "@medusajs/medusa/core-flows"
import { NAVIGATION_MODULE } from "../modules/navigation"
import NavigationModuleService from "../modules/navigation/service"
import type { NavigationInput } from "../api/admin/navigation/validators"
import { saveNavigationWorkflow } from "../workflows/save-navigation"

/** Link only already-approved menu nodes. No raw CSV row can create a menu
 * category here. Existing IDs, labels, URLs, ordering and manual edits survive. */
export default async function initializeCatalogCms({ container }: ExecArgs) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const service = container.resolve<NavigationModuleService>(NAVIGATION_MODULE)
  const [navigation] = await service.listSiteNavigations({ key: "main" })
  if (!navigation) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Main navigation missing")
  const items = structuredClone(navigation.items) as NavigationInput["items"]
  const nodes = items.flatMap((item) => item.children ?? [])
  const { data: categories } = await query.graph({ entity: "product_category", fields: ["id", "handle", "parent_category_id", "metadata", "is_active", "is_internal"], pagination: { take: 1000 } })
  type CategoryEntry = { id: string; handle: string; parent_category_id: string | null; metadata?: Record<string, unknown> | null; is_active: boolean; is_internal: boolean }
  const byHandle = new Map<string, CategoryEntry>(categories.map((category) => [category.handle, category]))
  const initialized = new Map<string, string>()
  let created = 0, updated = 0
  const initialize = async (node: typeof nodes[number]): Promise<string | null> => {
    if (initialized.has(node.id)) return initialized.get(node.id)!
    const handle = node.href.match(/^\/collection\/([^/?#]+)\/?$/)?.[1]
    if (!handle || !node.visible) return null
    const parent = nodes.find((item) => item.id === node.parent_id)
    const parentId = parent ? await initialize(parent) : null
    let root = node
    while (root.parent_id) root = nodes.find((item) => item.id === root.parent_id)!
    const kind = /аксессуар|aksessuar|accessor/i.test(`${root.label} ${root.href}`) ? "accessory" : "phone"
    let category = byHandle.get(handle)
    if (category && category.metadata?.catalog_scope !== "texno" && category.metadata?.catalog_scope !== "texno-draft") throw new MedusaError(MedusaError.Types.INVALID_DATA, `Foreign category collision: ${handle}`)
    if (!category) {
      const { result } = await createProductCategoriesWorkflow(container).run({ input: { product_categories: [{ name: node.label, handle, parent_category_id: parentId, is_active: true, is_internal: false, metadata: { catalog_scope: "texno", catalog_kind: kind, catalog_position: nodes.indexOf(node), catalog_origin: "approved-navigation" } }] } })
      category = result[0]
      byHandle.set(handle, category)
      created++
    } else if (category.metadata?.catalog_manual_override !== true && (!category.metadata?.catalog_kind || category.parent_category_id !== parentId)) {
      await updateProductCategoriesWorkflow(container).run({ input: { selector: { id: category.id }, update: { parent_category_id: parentId, metadata: { ...category.metadata, catalog_kind: kind, catalog_position: category.metadata?.catalog_position ?? nodes.indexOf(node) } } } })
      updated++
    }
    initialized.set(node.id, category.id)
    if (category.is_active && !category.is_internal) node.category_id = category.id
    return category.id
  }
  for (const node of nodes) await initialize(node)
  const changed = JSON.stringify(items) !== JSON.stringify(navigation.items)
  if (changed) await saveNavigationWorkflow(container).run({ input: { items, phone: navigation.phone, telegram_url: navigation.telegram_url } })
  console.log(JSON.stringify({ approved_nodes: nodes.length, linked: initialized.size, created_categories: created, initialized_categories: updated, navigation_changed: changed }))
}
