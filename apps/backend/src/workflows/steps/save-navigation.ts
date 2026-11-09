import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { NAVIGATION_MODULE } from "../../modules/navigation"
import NavigationModuleService from "../../modules/navigation/service"
import { NavigationInput, UpdateNavigationSchema } from "../../api/admin/navigation/validators"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import { getCatalogProfile } from "../../lib/catalog-cms"
import { CATALOG_STRUCTURE_LOCK } from "../../lib/catalog-constructor"
import { categoryShortcuts, hasCategoryShortcutCycle, shortcutKey } from "../../lib/catalog-hierarchy"
import { updateProductCategoriesWorkflow } from "@medusajs/medusa/core-flows"

type Snapshot = NavigationInput & { id: string }

export const saveNavigationStep = createStep(
  "save-navigation",
  async (input: NavigationInput, { container }) => container.resolve(Modules.LOCKING).execute(CATALOG_STRUCTURE_LOCK, async () => {
    const { expected_updated_at, ...data } = UpdateNavigationSchema.parse(input)
    const profile = await getCatalogProfile(container)
    const service = container.resolve<NavigationModuleService>(NAVIGATION_MODULE)
    const [previous] = await service.listSiteNavigations({ key: "main" })
    if (expected_updated_at && previous && new Date(previous.updated_at).toISOString() !== new Date(expected_updated_at).toISOString()) throw new MedusaError(MedusaError.Types.CONFLICT, "Меню уже изменено в другом окне. Обновите страницу и повторите изменения")
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data: categories } = await query.graph({ entity: "product_category", fields: ["id", "handle", "metadata", "is_active", "is_internal", "parent_category_id"], pagination: { take: 1000 } })
    for (const item of data.items) for (const node of item.children ?? []) {
      const handle = node.href.match(/^\/(?:collection|collections|categories)\/([^/?#]+)\/?$/)?.[1]
      const category = node.category_id ? categories.find((entry) => entry.id === node.category_id) : categories.find((entry) => entry.handle === handle)
      if (node.category_id && (!category || ![profile.scope, `${profile.scope}:draft`, `${profile.scope}-draft`].includes(String(category.metadata?.catalog_scope)))) throw new MedusaError(MedusaError.Types.INVALID_DATA, `«${node.label}»: выберите категорию этого магазина`)
      if (category) { node.category_id = category.id; node.href = `/collection/${category.handle}` }
    }
    const requestedParents = new Map<string, string | null>()
    for (const item of data.items) for (const node of item.children ?? []) {
      if (!node.category_id || node.category_shortcut) continue
      const parentNode = node.parent_id ? item.children?.find((parent) => parent.id === node.parent_id) : null
      if (parentNode && (!parentNode.category_id || parentNode.category_shortcut)) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Родителем категории должна быть другая товарная категория")
      const parentId = parentNode?.category_id ?? null
      if (parentId === node.category_id || (requestedParents.has(node.category_id) && requestedParents.get(node.category_id) !== parentId)) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Категория должна иметь одного родителя без циклов")
      requestedParents.set(node.category_id, parentId)
    }
    // Validate category cycles even when the menu contains only part of a tree.
    const finalParents = new Map(categories.map((category) => [category.id, requestedParents.has(category.id) ? requestedParents.get(category.id)! : category.parent_category_id]))
    for (const id of requestedParents.keys()) {
      let parent: string | null | undefined = id
      const seen = new Set<string>()
      while (parent) { if (seen.has(parent) || seen.size > 20) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Цикл в иерархии товарных категорий"); seen.add(parent); parent = finalParents.get(parent) }
    }
    for (const item of data.items) {
      const nodes = item.children ?? []
      const shortcuts = categoryShortcuts(nodes)
      if (shortcuts.length !== nodes.filter((node) => node.category_shortcut).length ||
        shortcuts.length !== new Set(shortcuts.map(shortcutKey)).size ||
        hasCategoryShortcutCycle(categories.map((category) => ({ id: category.id, parent_category_id: finalParents.get(category.id) ?? null })), shortcuts)) {
        throw new MedusaError(MedusaError.Types.INVALID_DATA, "Проверьте дополнительные связи категорий")
      }
      const primary = new Map(nodes.flatMap((node) => !node.category_shortcut && node.category_id ? [[node.id, node.category_id] as const] : []))
      if (item.children) item.children = nodes.filter((node) => !node.category_shortcut ||
        finalParents.get(node.category_id!) !== primary.get(node.parent_id!))
    }
    const changedParents = categories.filter((category) => requestedParents.has(category.id) && requestedParents.get(category.id) !== category.parent_category_id).map((category) => ({ id: category.id, parent_category_id: category.parent_category_id }))
    const appliedParents: typeof changedParents = []
    let navigation
    try {
      for (const category of changedParents) {
        await updateProductCategoriesWorkflow(container).run({ input: { selector: { id: category.id }, update: { parent_category_id: requestedParents.get(category.id)! } } })
        appliedParents.push(category)
      }
      navigation = previous ? await service.updateSiteNavigations({ id: previous.id, ...data }) : await service.createSiteNavigations({ key: "main", ...data })
    } catch (error) {
      for (const category of appliedParents.reverse()) await updateProductCategoriesWorkflow(container).run({ input: { selector: { id: category.id }, update: { parent_category_id: category.parent_category_id } } })
      throw error
    }

    const snapshot: Snapshot | null = previous ? {
      id: previous.id,
      items: previous.items as NavigationInput["items"],
      phone: previous.phone,
      telegram_url: previous.telegram_url,
    } : null

    return new StepResponse(navigation, { id: navigation.id, previous: snapshot, parents: changedParents })
  }, { timeout: 10, expire: 180 }),
  async (snapshot, { container }) => {
    if (!snapshot) return
    const service = container.resolve<NavigationModuleService>(NAVIGATION_MODULE)
    for (const category of [...snapshot.parents].reverse()) await updateProductCategoriesWorkflow(container).run({ input: { selector: { id: category.id }, update: { parent_category_id: category.parent_category_id } } })
    if (snapshot.previous) {
      await service.updateSiteNavigations(snapshot.previous)
    } else {
      await service.deleteSiteNavigations(snapshot.id)
    }
  }
)
