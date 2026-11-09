import type { CatalogNode, NavigationItem } from "../modules/navigation/types"

export type CatalogHierarchyCategory = { id: string; handle: string; parent_category_id: string | null; is_active: boolean; is_internal: boolean; metadata?: Record<string, unknown> | null }
export type CategoryShortcut = { parent_id: string; category_id: string }

export function categoryShortcuts(nodes: CatalogNode[]): CategoryShortcut[] {
  const primary = new Map(nodes.flatMap((node) => !node.category_shortcut && node.category_id ? [[node.id, node.category_id] as const] : []))
  return nodes.flatMap((node) => {
    const parent = node.parent_id && primary.get(node.parent_id)
    return node.category_shortcut && node.category_id && parent ? [{ parent_id: parent, category_id: node.category_id }] : []
  })
}

export function catalogBranchIds(categories: Pick<CatalogHierarchyCategory, "id" | "parent_category_id">[], shortcuts: CategoryShortcut[], root: string) {
  const children = new Map<string, string[]>()
  const add = (parent: string, child: string) => {
    const list = children.get(parent) ?? []
    list.push(child)
    children.set(parent, list)
  }
  for (const category of categories) if (category.parent_category_id) add(category.parent_category_id, category.id)
  for (const { parent_id, category_id } of shortcuts) add(parent_id, category_id)
  const visited = new Set([root])
  for (const id of visited) for (const child of children.get(id) ?? []) visited.add(child)
  return visited
}

export const shortcutKey = ({ parent_id, category_id }: CategoryShortcut) => JSON.stringify([parent_id, category_id])

export function hasCategoryShortcutCycle(categories: Pick<CatalogHierarchyCategory, "id" | "parent_category_id">[], shortcuts: CategoryShortcut[]) {
  return shortcuts.some(({ parent_id, category_id }) => catalogBranchIds(categories, shortcuts, category_id).has(parent_id))
}

export function publishedCategoryIds(categories: CatalogHierarchyCategory[], scope: string) {
  const index = new Map(categories.map((category) => [category.id, category]))
  return new Set(categories.filter((category) => {
    let current: CatalogHierarchyCategory | undefined = category
    const seen = new Set<string>()
    while (current) {
      if (!current.is_active || current.is_internal || current.metadata?.catalog_scope !== scope || seen.has(current.id) || seen.size >= 20) return false
      seen.add(current.id)
      if (!current.parent_category_id) return true
      current = index.get(current.parent_category_id)
    }
    return false
  }).map((category) => category.id))
}

/** Category hierarchy is authoritative. Menu labels, ordering and visibility
 * remain editorial choices, while links and parents use stable native refs. */
export function resolveCategoryNavigation(items: NavigationItem[], categories: CatalogHierarchyCategory[]): NavigationItem[] {
  const index = new Map(categories.map((category) => [category.id, category]))
  return items.map((item) => {
    const nodes = item.children ?? []
    const categoryNodes = new Map(nodes.filter((node) => node.category_id && !node.category_shortcut).map((node) => [node.category_id!, node.id]))
    return { ...item, children: nodes.map((node): CatalogNode => {
      const category = node.category_id ? index.get(node.category_id) : null
      if (!category) return node
      return { ...node, href: `/collection/${category.handle}`, parent_id: node.category_shortcut ? node.parent_id
        : category.parent_category_id ? categoryNodes.get(category.parent_category_id) ?? null : null }
    }) }
  })
}
