import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import { createProductCategoriesWorkflow, updateProductCategoriesWorkflow, updateProductsWorkflow } from "@medusajs/medusa/core-flows"
import type { FolderBody, GraphBody } from "../api/admin/catalog-constructor/validators"
import { availableHandle, CATALOG_STRUCTURE_LOCK, catalogConflict, catalogScopes, invalidCatalog, readConstructor, readConstructorProducts } from "../lib/catalog-constructor"
import { catalogKind, catalogStableId } from "../lib/catalog-cms"
import { categoryShortcuts, hasCategoryShortcutCycle, publishedCategoryIds, shortcutKey } from "../lib/catalog-hierarchy"
import { categorySeoWithDescription } from "../lib/product-description"
import { NAVIGATION_MODULE } from "../modules/navigation"
import NavigationModuleService from "../modules/navigation/service"
import type { CatalogNode, NavigationItem } from "../modules/navigation/types"

const sameIds = (left: string[], right: string[]) => JSON.stringify([...new Set(left)].sort()) === JSON.stringify([...new Set(right)].sort())
type FolderMove = { id: string; before: string | null; parent: string | null }

const saveGraph = createStep("save-graph", async (input: GraphBody, { container }) => {
  const result = await container.resolve(Modules.LOCKING).execute(CATALOG_STRUCTURE_LOCK, async () => {
    const { profile, categories, items, menu, navigation } = await readConstructor(container)
    const index = new Map(categories.map((category) => [category.id, category]))
    const allowed = new Set(catalogScopes(profile.scope))
    const placed = new Set((menu?.children ?? []).flatMap((node) => node.category_id && !node.category_shortcut ? [node.category_id] : []))
    const parentMap = new Map(categories.map((category) => [category.id, category.parent_category_id ?? null]))
    const moves: FolderMove[] = []
    const wanted = new Set<string>()
    const requireCategory = (id: string) => {
      const category = index.get(id)
      if (!category || !allowed.has(String(category.metadata?.catalog_scope))) throw invalidCatalog("Выберите категорию этого каталога")
      return category
    }
    for (const change of input.folders) {
      const folder = requireCategory(change.id)
      if (change.parent) requireCategory(change.parent)
      const before = folder.parent_category_id ?? null
      if (before === change.parent && placed.has(change.id)) continue
      if (before !== change.before || placed.has(change.id) !== change.was_placed) throw catalogConflict()
      parentMap.set(change.id, change.parent)
      wanted.add(change.id)
      if (before !== change.parent) moves.push({ id: change.id, before, parent: change.parent })
    }
    for (const category of categories) {
      const seen = new Set<string>()
      let id: string | null = category.id
      while (id) {
        if (seen.has(id)) throw invalidCatalog("Категория не может быть родителем самой себя или своей ветки")
        seen.add(id)
        if (seen.size > 9 && [...seen].some((entry) => wanted.has(entry))) throw invalidCatalog("Допустимо до девяти уровней каталога")
        id = parentMap.get(id) ?? null
      }
    }
    const proposedCategories = categories.map((category) => ({ ...category, parent_category_id: parentMap.get(category.id) ?? null }))
    const savedShortcuts = categoryShortcuts(menu?.children ?? [])
    const shortcuts = new Map(savedShortcuts.map((link) => [shortcutKey(link), link]))
    for (const change of input.shortcuts ?? []) {
      requireCategory(change.parent_id)
      requireCategory(change.category_id)
      const key = shortcutKey(change)
      const exists = shortcuts.has(key)
      if (exists === change.linked) continue
      if (exists !== change.before) throw catalogConflict()
      if (change.linked) shortcuts.set(key, { parent_id: change.parent_id, category_id: change.category_id })
      else shortcuts.delete(key)
    }
    for (const [key, link] of shortcuts) if (parentMap.get(link.category_id) === link.parent_id) shortcuts.delete(key)
    if (hasCategoryShortcutCycle(proposedCategories, [...shortcuts.values()])) throw invalidCatalog("Связи между категориями создают цикл")
    const shortcutsChanged = !sameIds(savedShortcuts.map(shortcutKey), [...shortcuts.keys()])
    const published = publishedCategoryIds(proposedCategories, profile.scope)
    const products = input.products.length
      ? (await readConstructorProducts(container, { ids: input.products.map((item) => item.id), limit: input.products.length, offset: 0 })).products
      : []
    const productChanges = input.products.flatMap((change) => {
      const product = products.find((row) => row.id === change.id)
      if (!product) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Товар не найден")
      const categories = [...new Set(change.categories)]
      const before = product.categories.map(({ id }) => id)
      if (sameIds(before, categories)) return []
      if (!sameIds(before, change.before)) throw catalogConflict()
      for (const id of categories) if (!before.includes(id)) {
        const category = requireCategory(id)
        if (product.status === "published" && published.has(id) && product.kind && category.metadata?.catalog_kind && category.metadata.catalog_kind !== product.kind) {
          throw invalidCatalog("Тип опубликованной категории должен совпадать с типом товара")
        }
      }
      return [{ id: change.id, before, category_ids: categories }]
    })

    // Copy only changed menu nodes and their missing ancestors. Existing node
    // IDs, labels, visibility and sibling order are editorial data.
    let menuItems: NavigationItem[] | undefined
    if (wanted.size || shortcutsChanged) {
      const entry: NavigationItem = menu ?? { id: "catalog", label: "Каталог", kind: "catalog", href: "", visible: true, children: [] }
      const raw = items.find((item) => item.id === entry.id)?.children ?? []
      const primary = new Map(raw.flatMap((node) => node.category_id && !node.category_shortcut ? [[node.id, node.category_id] as const] : []))
      const aliasKey = (node: CatalogNode) => shortcutKey({ parent_id: primary.get(node.parent_id ?? "") ?? "", category_id: node.category_id ?? "" })
      const children = raw.filter((node) => !node.category_shortcut || shortcuts.has(aliasKey(node)))
      const nodes = new Map(children.flatMap((node) => node.category_id && !node.category_shortcut ? [[node.category_id, node] as const] : []))
      const ensure = (id: string): CatalogNode => {
        const category = requireCategory(id)
        const parent = parentMap.get(id)
        const parentNode = parent ? ensure(parent) : null
        const node = nodes.get(id)
        if (node && (!wanted.has(id) || node.parent_id === (parentNode?.id ?? null))) return node
        const updated = { ...node, id: node?.id ?? id, label: node?.label ?? category.name, href: `/collection/${category.handle}`, category_id: id, parent_id: parentNode?.id ?? null, visible: node?.visible ?? true }
        if (node) children[children.indexOf(node)] = updated
        else children.push(updated)
        nodes.set(id, updated)
        return updated
      }
      for (const id of wanted) ensure(id)
      const existing = new Set(children.filter((node) => node.category_shortcut).map(aliasKey))
      for (const [key, link] of shortcuts) {
        if (existing.has(key)) continue
        const parent = ensure(link.parent_id)
        const target = ensure(link.category_id)
        children.push({ id: catalogStableId("nav-shortcut", key), parent_id: parent.id, category_id: link.category_id,
          category_shortcut: true, label: target.label, href: target.href, visible: true })
      }
      menuItems = menu ? items.map((item) => item.id === menu.id ? { ...item, children } : item) : [...items, { ...entry, children }]
    }
    const service = container.resolve<NavigationModuleService>(NAVIGATION_MODULE)
    const applied: FolderMove[] = []
    let productsSaved = false
    const setParent = (id: string, parent_category_id: string | null) => updateProductCategoriesWorkflow(container).run({
      input: { selector: { id }, update: { parent_category_id } },
    })
    try {
      // Detach moved subtrees before attaching. This avoids a transient cycle
      // when a valid batch reverses the relationship between two folders.
      for (const move of moves) {
        if (move.before) await setParent(move.id, null)
        applied.push(move)
      }
      for (const move of moves) if (move.parent) await setParent(move.id, move.parent)
      if (productChanges.length) {
        await updateProductsWorkflow(container).run({ input: { products: productChanges.map(({ id, category_ids }) => ({ id, category_ids })) } })
        productsSaved = true
      }
      if (menuItems) {
        if (navigation) await service.updateSiteNavigations({ id: navigation.id, items: menuItems })
        else await service.createSiteNavigations({ key: "main", items: menuItems, phone: "", telegram_url: "" })
      }
    } catch (error) {
      const failures: unknown[] = []
      const compensate = async (action: () => Promise<unknown>) => {
        try { await action() } catch (failure) { failures.push(failure) }
      }
      if (productsSaved) await compensate(() => updateProductsWorkflow(container).run({ input: { products: productChanges.map(({ id, before }) => ({ id, category_ids: before })) } }))
      for (const move of applied) await compensate(() => setParent(move.id, null))
      for (const move of applied) if (move.before) await compensate(() => setParent(move.id, move.before))
      if (failures.length) {
        container.resolve(ContainerRegistrationKeys.LOGGER).error("Catalog graph compensation failed", new AggregateError([error, ...failures]))
        throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "Не удалось полностью отменить изменения каталога")
      }
      throw error
    }
    return { folders: wanted.size, products: productChanges.length }
  }, { timeout: 10, expire: 180 })
  return new StepResponse(result)
})

export const saveConstructorGraphWorkflow = createWorkflow("save-constructor-graph", function (input: GraphBody) {
  return new WorkflowResponse(saveGraph(input))
})

const saveFolder = createStep("save-folder", async (input: FolderBody, { container }) => {
  const result = await container.resolve(Modules.LOCKING).execute(CATALOG_STRUCTURE_LOCK, async () => {
    const { profile, categories, menu, items, navigation, visible } = await readConstructor(container)
    const current = categories.find((category) => category.id === input.id)
    if (input.id && !current) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Категория не найдена")
    if (current && !catalogScopes(profile.scope).includes(String(current.metadata?.catalog_scope))) throw invalidCatalog("Категория вне профиля магазина")
    if (current && new Date(current.updated_at).toISOString() !== input.revision) throw catalogConflict()
    const type = profile.product_types.find((type) => type.code === input.kind && type.enabled)
    if (!type) throw invalidCatalog("Выберите тип каталога")
    if (!current && input.published) throw invalidCatalog("Сначала создайте черновик и разместите категорию на схеме")
    const node = menu?.children?.find((node) => node.category_id === input.id && !node.category_shortcut)
    if (input.published && !node) throw invalidCatalog("Сначала разместите категорию на схеме")
    if (current && input.published && (!current.is_active || current.is_internal || current.metadata?.catalog_kind !== input.kind)) {
      if (!current.is_active && current.parent_category_id && !visible.has(current.parent_category_id)) throw invalidCatalog("Сначала опубликуйте родительскую ветку")
      const productService = container.resolve(Modules.PRODUCT)
      for (let skip = 0; ; skip += 250) {
        const products = await productService.listProducts({ status: "published", categories: { id: current.id } }, {
          select: ["id", "metadata"], order: { id: "ASC" }, take: 250, skip,
        })
        if (products.some((product) => catalogKind(product.metadata ?? {}) && catalogKind(product.metadata ?? {}) !== input.kind)) {
          throw invalidCatalog("В категории есть опубликованные товары другого типа")
        }
        if (products.length < 250) break
      }
    }
    const handle = availableHandle(input.name, input.handle ?? current?.handle, new Set(categories.filter((category) => category.id !== current?.id).map((category) => category.handle)), "category")
    const update = {
      name: input.name,
      handle,
      is_active: input.published,
      is_internal: input.published ? false : current?.is_internal ?? false,
      metadata: {
        ...current?.metadata,
        catalog_scope: input.published ? profile.scope : `${profile.scope}:draft`,
        catalog_kind: input.kind,
        catalog_position: input.position,
        catalog_filter_codes: input.filter_codes,
        catalog_filters_from_profile: input.filter_codes === null && !input.keep_legacy_filters,
        ...(input.filter_disabled_codes !== undefined ? { catalog_filter_disabled_codes: [...new Set(input.filter_disabled_codes)] } : {}),
        catalog_seo: categorySeoWithDescription(input.seo, current?.metadata?.catalog_seo),
        catalog_manual_override: true,
      },
    }
    if (!current) {
      const { result: [folder] } = await createProductCategoriesWorkflow(container).run({ input: { product_categories: [update] } })
      return { id: folder.id }
    }
    await updateProductCategoriesWorkflow(container).run({ input: { selector: { id: current.id }, update } })
    if (node && menu && navigation) {
      const service = container.resolve<NavigationModuleService>(NAVIGATION_MODULE)
      try {
        const siblingPosition = menu.children?.filter((entry) => entry.parent_id === node.parent_id).findIndex((entry) => entry.id === node.id)
        const reorder = siblingPosition !== input.position
        const updatedItems = items.map((item) => {
          if (item.id !== menu.id) return item
          const updated = { ...node, label: input.menu_label ?? node.label, visible: input.menu_visible ?? node.visible, href: `/collection/${handle}` }
          const children = (item.children ?? []).map((entry) => entry.id === node.id ? updated : entry)
          if (!reorder) return { ...item, children }
          const siblings = children.filter((entry) => entry.id !== node.id && entry.parent_id === node.parent_id)
          const next = siblings[input.position]
          const preceding = siblings.at(-1)
          const remaining = children.filter((entry) => entry.id !== node.id)
          const target = next ? remaining.indexOf(next) : preceding ? remaining.indexOf(preceding) + 1 : children.indexOf(updated)
          remaining.splice(target, 0, updated)
          return { ...item, children: remaining }
        })
        await service.updateSiteNavigations({ id: navigation.id, items: updatedItems })
      } catch (error) {
        await updateProductCategoriesWorkflow(container).run({ input: { selector: { id: current.id }, update: {
          name: current.name, handle: current.handle, is_active: current.is_active, is_internal: current.is_internal, metadata: current.metadata,
        } } })
        throw error
      }
    }
    return { id: current.id }
  }, { timeout: 10, expire: 120 })
  return new StepResponse(result)
})

export const saveConstructorFolderWorkflow = createWorkflow("save-constructor-folder", function (input: FolderBody) {
  return new WorkflowResponse(saveFolder(input))
})
