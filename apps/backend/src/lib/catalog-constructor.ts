import type { FilterableProductProps, MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import { NAVIGATION_MODULE } from "../modules/navigation"
import NavigationModuleService from "../modules/navigation/service"
import type { NavigationItem } from "../modules/navigation/types"
import { catalogBrand, catalogKind, getCatalogProfile, type CatalogDefinitionData } from "./catalog-cms"
import { publishedCategoryIds, resolveCategoryNavigation } from "./catalog-hierarchy"
import { constructorSlug } from "./catalog-slug"
import { CATALOG_ATTRIBUTES_MODULE } from "../modules/catalog-attributes"
import CatalogAttributesModuleService from "../modules/catalog-attributes/service"
import { configurationModelCategory, inferredProductFamily, isInferredFamilyId, isNamedFamilyId, namedFamilyPrefix, type ConfigurationProduct } from "./product-configurations"
import { tableOrderBy } from "./admin-table-order"
import type { ProductCanvasListBody } from "../api/admin/catalog-constructor/validators"

export const CATALOG_STRUCTURE_LOCK = "catalog-constructor:structure"
export const invalidCatalog = (message: string) => new MedusaError(MedusaError.Types.INVALID_DATA, message)
export const catalogConflict = () => new MedusaError(MedusaError.Types.CONFLICT, "Каталог уже изменён. Обновите данные и повторите действие.")

export const catalogScopes = (scope: string) => [scope, `${scope}:draft`, `${scope}-draft`]
export const catalogTrashScope = (scope: string) => `${scope}:trash`

export async function readCatalogTrashProducts(container: MedusaContainer, scope: string) {
  const service = container.resolve(Modules.PRODUCT)
  const filters: FilterableProductProps & { metadata: { catalog_scope: string } } = {
    metadata: { catalog_scope: catalogTrashScope(scope) },
  }
  const products: { id: string; title: string; handle: string; created_at?: string | Date; kind: "product" }[] = []
  const take = 250
  for (let skip = 0; ; skip += take) {
    const page = await service.listProducts(filters, {
      select: ["id", "title", "handle", "created_at"],
      take,
      skip,
      order: { id: "ASC" },
    })
    for (const { id, title, handle, created_at } of page) products.push({ id, title, handle, created_at, kind: "product" })
    if (page.length < take) return products
  }
}

export async function readConstructor(container: MedusaContainer) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const service = container.resolve<NavigationModuleService>(NAVIGATION_MODULE)
  const [profile, [navigation]] = await Promise.all([getCatalogProfile(container), service.listSiteNavigations({ key: "main" })])
  const categories: ConstructorCategory[] = []
  const take = 250
  for (let skip = 0; ; skip += take) {
    const { data } = await query.graph({
      entity: "product_category",
      fields: ["id", "name", "handle", "parent_category_id", "rank", "description", "is_active", "is_internal", "metadata", "created_at", "updated_at"],
      pagination: { take, skip, order: { id: "ASC" } },
    })
    categories.push(...data as ConstructorCategory[])
    if (data.length < take) break
  }
  const allItems = (navigation?.items ?? []) as NavigationItem[]
  // Legacy nodes can carry only the public handle. Resolve it for reading
  // without saving a migration or changing any existing editorial choices.
  const handles = new Map(categories.map((category) => [category.handle, category.id]))
  const items = allItems.map((item) => ({ ...item, children: item.children?.map((node) => {
    const handle = node.href.match(/^\/(?:collection|collections|categories)\/([^/?#]+)\/?$/)?.[1]
    const category_id = node.category_id ?? (handle ? handles.get(handle) : undefined)
    return category_id ? { ...node, category_id } : node
  }) }))
  const menu = resolveCategoryNavigation(items, categories).find((item) => item.kind === "catalog")
  const visible = publishedCategoryIds(categories, profile.scope)
  return { profile, navigation, items, menu, categories, visible }
}

export type ConstructorCategory = {
  id: string
  name: string
  handle: string
  parent_category_id: string | null
  rank: number
  description: string | null
  is_active: boolean
  is_internal: boolean
  metadata: Record<string, unknown> | null
  created_at?: string | Date
  updated_at: string | Date
}

export function availableHandle(title: string, custom: string | undefined, taken: Set<string>, fallback: string) {
  if (custom && taken.has(custom)) throw new MedusaError(MedusaError.Types.DUPLICATE_ERROR, "Этот адрес уже используется")
  const base = custom ?? (constructorSlug(title) || fallback)
  let handle = base
  for (let suffix = 2; taken.has(handle); suffix++) handle = `${base}-${suffix}`
  return handle
}

export async function readConstructorProducts(container: MedusaContainer, filter: { ids?: string[]; q?: string; category_id?: string; status?: string; limit: number; offset: number; order?: string; include_families?: boolean; family_id?: string; family_category_id?: string; trash?: boolean; canvas?: ProductCanvasListBody["canvas"] }) {
  const productService = container.resolve(Modules.PRODUCT)
  const selectedFamilies = filter.family_id && filter.family_category_id
    ? (await readConstructorFamilies(container, [filter.family_category_id])).filter(({ id }) => id === filter.family_id)
    : undefined
  const familyIds = selectedFamilies?.flatMap(({ members }) => members.map(({ id }) => id))
  let idsFilter = familyIds && filter.ids ? filter.ids.filter((id) => familyIds.includes(id)) : familyIds ?? filter.ids
  const canvasIds = new Set(filter.canvas?.ids)
  const categoryIdsOnCanvas = filter.canvas?.category_ids
  if (categoryIdsOnCanvas?.length) {
    const take = 1000
    for (let skip = 0; ; skip += take) {
      const rows = await productService.listProducts(
        { categories: { id: categoryIdsOnCanvas } },
        { select: ["id"], take, skip, order: { id: "ASC" } },
      )
      for (const { id } of rows) canvasIds.add(id)
      if (rows.length < take) break
    }
  }
  for (const id of filter.canvas?.exclude_ids ?? []) canvasIds.delete(id)
  if (filter.canvas?.mode === "on") idsFilter = idsFilter ? idsFilter.filter((id) => canvasIds.has(id)) : [...canvasIds]
  if (filter.canvas?.mode === "off" && idsFilter) idsFilter = idsFilter.filter((id) => !canvasIds.has(id))
  if (idsFilter && !idsFilter.length) return { products: [], families: [], count: 0, offset: filter.offset, limit: filter.limit }
  const filters = {
    metadata: filter.trash ? { catalog_scope: catalogTrashScope((await getCatalogProfile(container)).scope) } : { catalog_trash: null },
    ...(idsFilter ? { id: idsFilter } : {}),
    ...(!idsFilter && filter.canvas?.mode === "off" && canvasIds.size ? { $and: [{ id: { $nin: [...canvasIds] } }] } : {}),
    ...(filter.q ? { q: filter.q } : {}),
    ...(filter.category_id ? { categories: { id: filter.category_id } } : {}),
    ...(filter.status ? { status: filter.status as "draft" | "published" | "proposed" | "rejected" } : {}),
  }
  const [rows, count] = await productService.listAndCountProducts(filters, { take: filter.limit, skip: filter.offset, order: tableOrderBy(filter.order ?? "title"), relations: ["categories"] })
  const products = rows.map(({ id, title, handle, status, thumbnail, categories, created_at, updated_at, metadata }) => ({
    id, title, handle, status, thumbnail, created_at, updated_at, kind: catalogKind(metadata ?? {}),
    categories: (categories ?? []).map(({ id, name }) => ({ id, name })),
  }))
  if (!filter.include_families) return { products, count, offset: filter.offset, limit: filter.limit }
  const ids = new Set(products.map(({ id }) => id))
  const categoryIds = rows.flatMap(({ id, title, handle, metadata, categories }) => {
    if (!metadata?.catalog_family_id && !metadata?.insales_product_id) return []
    const category = configurationModelCategory({ id, title, handle, metadata, categories: categories ?? undefined })
    return category ? [category.id] : []
  })
  const families = (selectedFamilies ?? await readConstructorFamilies(container, categoryIds)).filter(({ members }) => members.some(({ id }) => ids.has(id)))
  return { products, families, count, offset: filter.offset, limit: filter.limit }
}

export type ConstructorFamily = {
  id: string
  label: string
  category_id: string
  kind: string
  brand: string
  inferred: boolean
  members: { id: string; title: string; status: string }[]
}

export async function readConstructorFamilies(container: MedusaContainer, categoryIds?: string[], profile?: Awaited<ReturnType<typeof getCatalogProfile>>) {
  if (categoryIds?.length === 0) return []
  const productService = container.resolve(Modules.PRODUCT)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const [catalog, definitions, categoryProducts] = await Promise.all([
    profile ?? getCatalogProfile(container),
    container.resolve<CatalogAttributesModuleService>(CATALOG_ATTRIBUTES_MODULE).listCatalogDefinitions({}, { take: 1000 }) as Promise<CatalogDefinitionData[]>,
    Promise.all((categoryIds ? [...new Set(categoryIds)] : [undefined]).map(async (id) => {
      const ids: string[] = []
      for (let skip = 0; ; skip += 200) {
        const page = await productService.listProducts(id ? { categories: { id } } : {}, { select: ["id", "metadata"], take: 200, skip, order: { id: "ASC" } })
        ids.push(...page.filter(({ metadata }) => metadata?.catalog_family_id || (metadata?.insales_product_id && catalogKind(metadata) === "phone")).map((product) => product.id))
        if (page.length < 200) break
      }
      return ids
    })),
  ])
  const ids = [...new Set(categoryProducts.flat())]
  const scopes = catalogScopes(catalog.scope)
  const families = new Map<string, ConstructorFamily>()
  const linked = new Set<string>()
  const aliases = new Map<string, string>()
  for (let start = 0; start < ids.length; start += 200) {
    const { data } = await query.graph({
      entity: "product",
      fields: ["id", "handle", "title", "status", "metadata", "categories.id", "categories.handle", "categories.parent_category_id",
        "catalog_record.attributes", "variants.id", "variants.title", "variants.metadata", "variants.catalog_variant.attributes"],
      filters: { id: ids.slice(start, start + 200) },
    })
    for (const product of data as unknown as (ConfigurationProduct & { status: string })[]) {
      const category = configurationModelCategory(product)
      if (!category || (categoryIds && !categoryIds.includes(category.id)) || !scopes.includes(String(product.metadata?.catalog_scope))) continue
      const kind = catalogKind(product.metadata)
      const brand = catalogBrand(product.metadata)
      if (typeof kind !== "string" || typeof brand !== "string") continue
      const type = catalog.product_types.find((entry) => entry.code === kind)
      const axes = definitions.filter((field) => field.public && field.enabled && type?.variant_axes.includes(field.code))
      const explicit = product.metadata?.catalog_family_id
      const inferred = inferredProductFamily(product, axes)
      const id = typeof explicit === "string" && explicit ? explicit : inferred?.id
      if (!id) continue
      const groupKey = (familyId: string) => JSON.stringify([category.id, kind, brand.trim().toLowerCase(), familyId])
      const key = groupKey(id)
      if (inferred?.legacyId) aliases.set(groupKey(inferred.legacyId), key)
      const label = inferred?.label ?? (isNamedFamilyId(id) ? id.slice(namedFamilyPrefix.length) : id)
      const family = families.get(key) ?? { id, label, category_id: category.id, kind, brand, inferred: isInferredFamilyId(id), members: [] }
      if (inferred) family.label = label
      if (explicit) linked.add(key)
      family.members.push({ id: product.id, title: product.title, status: product.status })
      families.set(key, family)
    }
  }
  for (const [legacy, current] of aliases) {
    const previous = families.get(legacy)
    const family = families.get(current)
    if (!previous || !family) continue
    family.members.push(...previous.members)
    if (linked.has(legacy)) linked.add(current)
    families.delete(legacy)
  }
  return [...families.entries()].filter(([key, { members }]) => linked.has(key) || members.length > 1)
    .map(([, family]) => ({ ...family, members: family.members.sort((a, b) => a.title.localeCompare(b.title, "ru", { numeric: true })) }))
    .sort((a, b) => a.label.localeCompare(b.label, "ru", { numeric: true }))
}
