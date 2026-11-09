import { useQueries } from "@tanstack/react-query"
import type { GraphBody, ProductCanvasListBody } from "../../../api/admin/catalog-constructor/validators"
import { categoryShortcuts, shortcutKey } from "../../../lib/catalog-hierarchy"
import { sdk } from "../../lib/sdk"
import { useCanvasSession, useRemovedCanvasCards } from "./catalog-viewport"
import { constructorKey, constructorPath, type CardRef, type GraphData, type ProductCard, type ProductPage } from "./types"

export const canvasBranchPageSize = 10
export const canvasCardKey = ({ kind, id }: CardRef) => `${kind}:${id}`

export type ProductCanvasMembership = {
  filter: Omit<ProductCanvasListBody["canvas"], "mode">
  has: (product: ProductCard) => boolean
}

export function useCatalogCanvasPlacement(data: GraphData, focusFolder?: string) {
  const scope = data.profile.scope
  const [removedCards, setRemovedCards] = useRemovedCanvasCards(scope)
  const [placedFolders, setPlacedFolders] = useCanvasSession<string[]>(scope, "folders", [])
  const [placedProducts, setPlacedProducts] = useCanvasSession<Record<string, ProductCard>>(scope, "products", {})
  const [history, setHistory] = useCanvasSession<GraphBody[]>(scope, "links", [])
  const [targets, setTargets] = useCanvasSession<string[]>(scope, "targets", [])
  // Older drafts also kept products needed to render pending links in the cache.
  const stagedProductIds = new Set(history.flatMap((step) => step.products.map(({ id }) => id)))
  const [placedProductIds, setPlacedProductIds] = useCanvasSession<string[]>(scope, "placed-product-ids",
    [...new Set([...targets, ...Object.keys(placedProducts).filter((id) => !stagedProductIds.has(id))])],
  )

  const removed = new Set(removedCards)
  const pending = history.at(-1) ?? { folders: [], products: [] }
  const folders = new Map(data.categories.map((folder) => [folder.id, folder]))
  const realNodes = new Map(data.nodes.flatMap((node) => node.category_id && !node.category_shortcut ? [[node.category_id, node] as const] : []))
  const moved = new Map(pending.folders.map((change) => [change.id, change]))
  const parentOf = (id: string) => moved.has(id) ? moved.get(id)!.parent : folders.get(id)?.parent_category_id ?? null
  const savedShortcuts = new Map(categoryShortcuts(data.nodes).map((link) => [shortcutKey(link), link]))
  const activeShortcuts = new Map(savedShortcuts)
  for (const link of pending.shortcuts ?? []) {
    if (link.linked) activeShortcuts.set(shortcutKey(link), link)
    else activeShortcuts.delete(shortcutKey(link))
  }
  const extraChildren = new Map<string, string[]>()
  for (const { category_id, parent_id } of activeShortcuts.values()) if (parentOf(category_id) !== parent_id) {
    extraChildren.set(parent_id, [...(extraChildren.get(parent_id) ?? []), category_id])
  }
  const menuOrder = new Set([...realNodes.keys(), ...placedFolders, ...moved.keys(), ...(focusFolder ? [focusFolder] : [])])
  const children = new Map<string | null, string[]>()
  for (const id of menuOrder) {
    if (!folders.has(id)) continue
    const parent = parentOf(id)
    const key = parent && folders.has(parent) && menuOrder.has(parent) ? parent : null
    children.set(key, [...(children.get(key) ?? []), id])
  }

  // Placement survives closing a branch, changing its page, or removing a
  // different card. Only explicit removal excludes the selected card.
  const categoryIds = new Set([...menuOrder].filter((id) => folders.has(id)))
  for (const id of categoryIds) {
    for (const child of extraChildren.get(id) ?? []) if (folders.has(child)) categoryIds.add(child)
  }
  const placedCategoryIds = new Set([...categoryIds].filter((id) => !removed.has(canvasCardKey({ kind: "folder", id }))))
  const changedProducts = new Map(pending.products.map((change) => [change.id, change]))
  const included = new Set(placedProductIds)
  const excluded = new Set(removedCards.filter((key) => key.startsWith("product:")).map((key) => key.slice("product:".length)))
  for (const { id, categories } of changedProducts.values()) {
    if (categories.some((category) => categoryIds.has(category))) included.add(id)
    else if (!included.has(id)) excluded.add(id)
  }
  const productMembership: ProductCanvasMembership = {
    filter: { category_ids: [...categoryIds].sort(), ids: [...included].sort(), exclude_ids: [...excluded].sort() },
    has: (product) => !excluded.has(product.id) && (
      included.has(product.id) || product.categories.some(({ id }) => categoryIds.has(id))
    ),
  }

  const forgetPlacement = ({ kind, id }: CardRef) => {
    if (kind === "folder") setPlacedFolders((previous) => previous.filter((folderId) => folderId !== id))
    else {
      setTargets((previous) => previous.filter((productId) => productId !== id))
      setPlacedProductIds((previous) => previous.filter((productId) => productId !== id))
      setPlacedProducts(({ [id]: _, ...remaining }) => remaining)
    }
  }

  return {
    setPlacedFolders, placedProducts, setPlacedProducts, setPlacedProductIds, setRemovedCards, removed,
    history, setHistory, pending, targets, setTargets, forgetPlacement, placedCategoryIds, productMembership,
    folders, realNodes, moved, parentOf, savedShortcuts, activeShortcuts, extraChildren, children, changedProducts,
  }
}

export function useCatalogCanvasCards(data: GraphData, focusFolder?: string, focusProduct?: ProductCard) {
  const placement = useCatalogCanvasPlacement(data, focusFolder)
  const { folders, realNodes, removed, children, extraChildren, parentOf, placedProducts, changedProducts, targets } = placement
  const [expanded, setExpanded] = useCanvasSession<Record<string, number>>(data.profile.scope, "expanded", {})
  const [directProducts, setDirectProducts] = useCanvasSession<string[]>(data.profile.scope, "direct-products", [])

  const visibleFolders = new Set<string>()
  const visibleProductBranches = new Set<string>()
  const visit = (id: string) => {
    if (!folders.has(id) || visibleFolders.has(id) || removed.has(canvasCardKey({ kind: "folder", id }))) return
    visibleFolders.add(id)
    if (!(id in expanded)) return
    for (const child of children.get(id) ?? []) visit(child)
    for (const child of extraChildren.get(id) ?? []) visit(child)
    if (!(children.has(id) || extraChildren.has(id)) || directProducts.includes(id)) visibleProductBranches.add(id)
  }
  for (const id of realNodes.keys()) if (!parentOf(id)) visit(id)
  for (const id of children.get(null) ?? []) visit(id)

  const openBranches = [...visibleProductBranches]
  const branchQueries = useQueries({
    queries: openBranches.map((id) => ({
      queryKey: [...constructorKey, "branch", id, expanded[id]],
      queryFn: ({ signal }) => sdk.client.fetch<ProductPage>(`${constructorPath}/products`, { query: { category_id: id, offset: expanded[id], limit: canvasBranchPageSize }, signal }),
    })),
  })
  const branches = new Map(openBranches.map((id, index) => [id, branchQueries[index]]))
  const products = new Map<string, ProductCard>()
  for (const query of branchQueries) for (const product of query.data?.products ?? []) products.set(product.id, product)
  for (const product of Object.values(placedProducts)) if (!products.has(product.id)) products.set(product.id, product)
  if (focusProduct) products.set(focusProduct.id, focusProduct)
  const categoriesOf = (id: string) => changedProducts.get(id)?.categories ?? products.get(id)?.categories.map((category) => category.id) ?? []

  const shownProducts = new Set(targets)
  for (const [id, branch] of branches) {
    for (const product of branch.data?.products ?? []) if (categoriesOf(product.id).includes(id)) shownProducts.add(product.id)
  }
  for (const id of changedProducts.keys()) if (categoriesOf(id).some((category) => visibleProductBranches.has(category))) shownProducts.add(id)
  const visibleProducts = new Set([...shownProducts].filter((id) => products.has(id) && !removed.has(canvasCardKey({ kind: "product", id }))))

  return {
    ...placement,
    expanded, setExpanded, directProducts, setDirectProducts, branches, products, categoriesOf,
    visibleFolders, visibleProductBranches, visibleProducts,
  }
}
