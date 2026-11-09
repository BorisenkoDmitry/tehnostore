import type { MedusaContainer } from "@medusajs/framework/types"
import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import { createInventoryLevelsWorkflow, deleteInventoryLevelsWorkflow, updateInventoryLevelsWorkflow, updateProductsWorkflow, updateProductVariantsWorkflow, updateProductCategoriesWorkflow } from "@medusajs/medusa/core-flows"
import { CATALOG_ATTRIBUTES_MODULE } from "../modules/catalog-attributes"
import CatalogAttributesModuleService from "../modules/catalog-attributes/service"
import type { CatalogAttributeInput } from "../modules/catalog-attributes/types"
import { CatalogDefinitionData, catalogStableId, cmsAttributeRows, getCatalogProfile, matchesCatalogAttributeValues, normalizeCatalogValue, normalizeCmsAttributes, normalizeProductSpecifications } from "../lib/catalog-cms"
import { CatalogCategoryBody, CatalogCategorySchema, CatalogDefinitionBody, CatalogDefinitionSchema, CatalogProductBody, CatalogProductSchema, CatalogStockBody, CatalogStockSchema, CatalogProfileBody, CatalogProfileSchema } from "../api/admin/catalog-cms/validators"
import { configurationAxisDefinitions, configuredFamilyKey, isInferredFamilyId, isNamedFamilyId } from "../lib/product-configurations"
import { CATALOG_STRUCTURE_LOCK, readConstructor } from "../lib/catalog-constructor"
import { canonicalLibraryCode, isLibraryDefinition, LEGACY_COLOR, LIBRARY_VARIATIONS, detachedVariationFields, libraryVariations } from "../lib/catalog-variation-library"
import { canonicalCatalogToken } from "../search/helpers/catalog-filter-values"
import { isProductSpecificationCode } from "../lib/product-specification"
import { nativeCatalogAxes, includeNativeAxisValues } from "../lib/catalog-native-axes"
import { categorySeoWithDescription } from "../lib/product-description"

const productFields = ["id", "title", "metadata", "status", "categories.id", "sales_channels.id", "catalog_record.*", "variants.id", "variants.metadata", "variants.catalog_variant.*", "options.id", "options.title", "variants.options.option_id", "variants.options.value"]

type DefinitionSnapshot = {
  definition: any; created_id?: string
  records: { id: string; attributes: any[]; searchable_text: string }[]
  variants: { id: string; attributes: any[] }[]
  rows: { id: string; label: string; filterable: boolean }[]
}
async function restoreDefinition(service: CatalogAttributesModuleService, snapshot: DefinitionSnapshot) {
  if (snapshot.records.length) await service.updateCatalogRecords(snapshot.records)
  if (snapshot.variants.length) await service.updateCatalogVariants(snapshot.variants)
  if (snapshot.rows.length) await service.updateCatalogAttributes(snapshot.rows)
  if (snapshot.definition) {
    const { id, code, label, aliases, choice_values, choice_colors, type, unit, public: isPublic, filterable, position, enabled, role, filter_control } = snapshot.definition
    await service.updateCatalogDefinitions({ id, code, label, aliases, choice_values, choice_colors, type, unit, public: isPublic, filterable, position, enabled, role, filter_control })
  } else if (snapshot.created_id) await service.deleteCatalogDefinitions(snapshot.created_id)
}

type SaveCatalogProductInput = { id: string; data: CatalogProductBody; actor_id: string; constructor_edit?: boolean; preserve_attribute_codes?: string[]; preserve_variant_attribute_codes?: string[]; library_fields?: string[] }
const saveCatalogProductStep = createStep("save-catalog-product", async (input: SaveCatalogProductInput, { container }) => {
  // The original API keeps its validation contract. Constructor input is
  // validated at its own boundary and can retain draft category assignments.
  const data = input.constructor_edit ? input.data : CatalogProductSchema.parse(input.data)
  const profile = await getCatalogProfile(container)
  const productType = profile.product_types.find((type) => type.code === data.kind && type.enabled)
  if (!productType) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Выберите доступный тип из профиля каталога")
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const service = container.resolve<CatalogAttributesModuleService>(CATALOG_ATTRIBUTES_MODULE)
  const { data: products } = await query.graph({ entity: "product", fields: productFields, filters: { id: input.id } })
  const product = products[0] as any
  if (!product) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Товар не найден")
  if (product.metadata?.catalog_trash) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Сначала восстановите товар из корзины каталога")
  const variantIds = new Set(product.variants.map((variant: any) => variant.id))
  if (data.variants.length !== variantIds.size || new Set(data.variants.map((v) => v.id)).size !== variantIds.size || data.variants.some((v) => !variantIds.has(v.id))) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Варианты изменились. Обновите форму")
  const { data: categories } = data.category_ids.length
    ? await query.graph({ entity: "product_category", fields: ["id", "handle", "parent_category_id", "is_active", "is_internal", "metadata"], filters: { id: data.category_ids } })
    : { data: [] }
  const compatible = (category: typeof categories[number]) => !category.metadata?.catalog_kind || category.metadata.catalog_kind === data.kind
  const invalidCategories = () => new MedusaError(MedusaError.Types.INVALID_DATA, "Для публикации нужна опубликованная категория совместимого типа")
  if (input.constructor_edit) {
    if (data.visible) {
      const { visible } = await readConstructor(container)
      const published = categories.filter((category) => visible.has(category.id))
      if (!published.length || published.some((category) => !compatible(category))) throw invalidCategories()
    }
  } else if (categories.length !== new Set(data.category_ids).size || categories.some((category) => category.metadata?.catalog_scope !== profile.scope || !category.is_active || category.is_internal || !compatible(category))) throw invalidCategories()
  if (data.visible && !product.sales_channels?.length) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Сначала укажите канал продаж в стандартной форме товара")
  const definitions = await service.listCatalogDefinitions({}, { take: 1000 }) as CatalogDefinitionData[]
  const nativeAxes = input.constructor_edit ? [] : nativeCatalogAxes(product.options ?? [], productType.variant_axes, definitions)
  const library = new Set(input.library_fields ?? productType.variant_axes)
  const normalizedAttributes = (rows: typeof data.attributes, previous: CatalogAttributeInput[] = [], productScope = false) => {
    const preserved = new Set([...(input.preserve_attribute_codes ?? []), ...(productScope ? [] : input.preserve_variant_attribute_codes ?? [])])
    const submitted = rows.filter((attribute) => !preserved.has(attribute.code))
    const normalized = productScope
      ? normalizeProductSpecifications(submitted, definitions, previous)
      : normalizeCmsAttributes(submitted, definitions, previous, library)
    const edited = normalized.map((attribute) => {
      if (!input.constructor_edit) return attribute
      const before = previous.find((entry) => entry.key === attribute.key)
      if (isProductSpecificationCode(attribute.key) && before?.label !== attribute.label) return attribute
      return before && matchesCatalogAttributeValues(before, submitted.find((row) => row.code === attribute.key)?.values) ? before : attribute
    })
    if (!preserved.size) return edited
    const previousOrder = new Map(previous.map((attribute, index) => [attribute.key, index]))
    return [...edited, ...previous.filter((attribute) => preserved.has(attribute.key))].sort((a, b) => (previousOrder.get(a.key) ?? Infinity) - (previousOrder.get(b.key) ?? Infinity))
  }
  const attributes = normalizedAttributes(data.attributes, product.catalog_record?.attributes, true)
  const variants = data.variants.map((variant) => ({ ...variant, attributes: normalizedAttributes(includeNativeAxisValues(variant.attributes, product.variants.find((item: any) => item.id === variant.id)?.options ?? [], nativeAxes), product.variants.find((item: any) => item.id === variant.id)?.catalog_variant?.attributes) }))
  const manualAxes = !input.constructor_edit && !product.metadata?.insales_product_id ? productType.variant_axes.filter((code) => !detachedVariationFields(product.metadata).has(code) && variants.every((variant) => variant.attributes.some((attribute) => attribute.key === code && attribute.values.length === 1))) : []
  const axisMetadata = manualAxes.length ? {
    [LIBRARY_VARIATIONS]: Object.fromEntries(variants.map((variant) => [variant.id, {
      ...libraryVariations(product.metadata)?.[variant.id],
      ...Object.fromEntries(manualAxes.map((code) => {
        const attribute = variant.attributes.find((attribute) => attribute.key === code)!
        return [code, { ...libraryVariations(product.metadata)?.[variant.id]?.[code], choice: attribute.rawValues[0], value: attribute.values[0].value }]
      })),
    }])),
    catalog_constructor_axes: { ...product.metadata?.catalog_constructor_axes, ...Object.fromEntries(manualAxes.map((code) => [code, definitions.find((definition) => definition.code === code)!.label])) },
    catalog_constructor_axis_order: [...new Set([...(product.metadata?.catalog_constructor_axis_order ?? []), ...manualAxes])],
  } : {}
  const selectedFamily = isInferredFamilyId(data.family_id) || isNamedFamilyId(data.family_id)
  const familyProduct = {
    id: product.id, handle: product.id, title: product.title, categories, catalog_record: { attributes },
    metadata: { ...(selectedFamily ? product.metadata : {}), ...axisMetadata, catalog_kind: data.kind, catalog_brand: data.brand, catalog_family_id: data.family_id },
    variants: variants.map((variant) => ({
      id: variant.id, title: variant.id, catalog_variant: { attributes: variant.attributes },
      metadata: selectedFamily ? product.variants.find((item: { id: string }) => item.id === variant.id)?.metadata : undefined,
    })),
  }
  const familyAxes = selectedFamily
    ? configurationAxisDefinitions(familyProduct, productType.variant_axes, definitions).axes
    : definitions.filter((definition) => productType.variant_axes.includes(definition.code))
  const familySignature = data.family_id ? configuredFamilyKey(familyProduct, familyAxes) : null
  if (data.family_id) {
    if (!familySignature) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Для семейства укажите одну модельную категорию, все оси вариантов и совместимые технические характеристики")
    const members = await service.listCatalogRecords({ family_id: data.family_id }, { take: 1000 })
    if (members.some((member) => member.id !== product.catalog_record?.id && member.family_signature !== familySignature)) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Семейство уже связано с другой моделью, брендом или техническими характеристиками")
  }
  const recordId = product.catalog_record?.id || catalogStableId("catrec", `manual:${product.id}`)
  const previousRecords = product.catalog_record ? [{ id: recordId, attributes: product.catalog_record.attributes, searchable_text: product.catalog_record.searchable_text, family_id: product.catalog_record.family_id, family_signature: product.catalog_record.family_signature }] : []
  const previousVariants = product.variants.filter((variant: any) => variant.catalog_variant).map((variant: any) => ({ id: variant.catalog_variant.id, attributes: variant.catalog_variant.attributes }))
  const previousRows = await service.listCatalogAttributes({ record_id: recordId }, { take: 10000 })
  const createdVariantIds: string[] = []
  const createdLinks: Record<string, Record<string, string>>[] = []
  const link = container.resolve(ContainerRegistrationKeys.LINK)
  const metadata = { ...product.metadata, ...axisMetadata, catalog_scope: data.visible ? profile.scope : `${profile.scope}:draft`, catalog_origin: product.metadata?.insales_product_id ? "insales" : "manual", catalog_kind: data.kind, catalog_brand: data.brand, catalog_family_id: data.family_id || null, catalog_seo: data.seo, catalog_manual_override: true }
  const restore = async () => {
    if (createdLinks.length) await link.dismiss(createdLinks)
    const rows = await service.listCatalogAttributes({ record_id: recordId }, { take: 10000 })
    if (rows.length) await service.deleteCatalogAttributes(rows.map((row) => row.id))
    if (previousRows.length) await service.createCatalogAttributes(previousRows.map(({ id, key, label, raw_value, value, normalized_value, type, numeric_value, unit, filterable, scope, record_id, variant_id }) => ({ id, key, label, raw_value, value, normalized_value, type, numeric_value, unit, filterable, scope, record_id, variant_id })))
    if (createdVariantIds.length) await service.deleteCatalogVariants(createdVariantIds)
    if (previousVariants.length) await service.updateCatalogVariants(previousVariants)
    if (previousRecords.length) await service.updateCatalogRecords(previousRecords)
    else await service.deleteCatalogRecords(recordId)
    await updateProductsWorkflow(container).run({ input: { products: [{ id: product.id, status: product.status, metadata: product.metadata, category_ids: product.categories.map((category: any) => category.id), variants: product.variants.map((variant: any) => ({ id: variant.id, metadata: variant.metadata })) }] } })
  }
  try {
    const recordData = { attributes, family_id: data.family_id || null, family_signature: familySignature, searchable_text: [product.title, ...attributes.filter((a) => a.public).flatMap((a) => a.values.map((v) => `${a.label} ${v.value}`)), ...variants.flatMap((v) => v.attributes.filter((a) => a.public).flatMap((a) => a.values.map((value) => value.value)))].join(" ") }
    if (product.catalog_record) await service.updateCatalogRecords({ id: recordId, ...recordData })
    else {
      await service.createCatalogRecords({ id: recordId, source_product_id: null, source_hash: "manual", source_data: { origin: "manual", created_by: input.actor_id }, ...recordData })
      createdLinks.push({ [Modules.PRODUCT]: { product_id: product.id }, [CATALOG_ATTRIBUTES_MODULE]: { catalog_record_id: recordId } })
    }
    const rows = cmsAttributeRows(recordId, null, attributes)
    for (const variant of variants) {
      const existing = product.variants.find((item: any) => item.id === variant.id).catalog_variant
      const catalogVariantId = existing?.id || catalogStableId("catvar", `manual:${variant.id}`)
      if (existing) await service.updateCatalogVariants({ id: catalogVariantId, attributes: variant.attributes })
      else {
        await service.createCatalogVariants({ id: catalogVariantId, source_variant_id: null, source_data: { origin: "manual", created_by: input.actor_id }, record_id: recordId, attributes: variant.attributes })
        createdVariantIds.push(catalogVariantId)
        createdLinks.push({ [Modules.PRODUCT]: { product_variant_id: variant.id }, [CATALOG_ATTRIBUTES_MODULE]: { catalog_variant_id: catalogVariantId } })
      }
      rows.push(...cmsAttributeRows(recordId, catalogVariantId, variant.attributes))
    }
    if (previousRows.length) await service.deleteCatalogAttributes(previousRows.map((row) => row.id))
    if (rows.length) await service.createCatalogAttributes(rows)
    if (createdLinks.length) await link.create(createdLinks)
    await updateProductsWorkflow(container).run({ input: { products: [{ id: product.id, ...(input.constructor_edit ? { status: data.visible ? "published" as const : "draft" as const } : {}), metadata, category_ids: data.category_ids, variants: variants.map((variant) => ({ id: variant.id, metadata: { ...product.variants.find((item: any) => item.id === variant.id).metadata, catalog_old_price: variant.old_price, catalog_old_price_currency: profile.currency_code, ...(profile.currency_code === "rub" ? { catalog_old_price_rub: variant.old_price } : {}) } })) }] } })
    await service.createCatalogChanges({ product_id: product.id, variant_id: null, actor_id: input.actor_id, action: "product-cms-save", reason: "Сохранение формы каталога", before: { metadata: product.metadata, attributes: product.catalog_record?.attributes ?? [], variants: previousVariants }, after: { metadata, attributes, variants } })
    return new StepResponse({ id: product.id, record_id: recordId })
  } catch (error) {
    await restore()
    throw error
  }
})

export const saveCatalogProductWorkflow = createWorkflow("save-catalog-product", function (input: SaveCatalogProductInput) {
  return new WorkflowResponse(saveCatalogProductStep(input))
})

async function* readLibraryDefinitionUsage(container: MedusaContainer, code: string) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const take = 200
  for (let skip = 0; ; skip += take) {
    const { data: products } = await query.graph({ entity: "product", fields: ["id", "metadata"], pagination: { take, skip, order: { id: "ASC" } } })
    for (const product of products) {
      const assignments = Object.values(libraryVariations(product.metadata) ?? {}).flatMap((row) => row[code] ?? [])
      if (assignments.length) yield { id: product.id, assignments }
    }
    if (products.length < take) break
  }
}

const saveCatalogDefinitionStep = createStep("save-catalog-definition", async (input: { data: CatalogDefinitionBody; actor_id: string }, { container }) => container.resolve(Modules.LOCKING).execute(CATALOG_STRUCTURE_LOCK, async () => {
  const data = CatalogDefinitionSchema.parse(input.data)
  if (data.filter_control === "range" && data.type !== "number" && data.type !== "money") throw new MedusaError(MedusaError.Types.INVALID_DATA, "Диапазон доступен для числовой характеристики и денежного значения")
  if (data.filter_control === "swatch" && data.role !== "color") throw new MedusaError(MedusaError.Types.INVALID_DATA, "Образцы цвета требуют роли Цвет")
  if (data.type === "money") {
    const currency = (data.unit || (await getCatalogProfile(container)).currency_code).toUpperCase()
    const currencyCodes = (Intl as typeof Intl & { supportedValuesOf(key: "currency"): string[] }).supportedValuesOf("currency")
    if (!currencyCodes.includes(currency)) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Укажите код валюты ISO, например RUB")
    data.unit = currency
  }
  const service = container.resolve<CatalogAttributesModuleService>(CATALOG_ATTRIBUTES_MODULE)
  const previous = data.id ? await service.retrieveCatalogDefinition(data.id) : null
  const definitions = await service.listCatalogDefinitions({}, { take: 1000 })
  if (data.code === LEGACY_COLOR && data.choice_values?.length) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Добавляйте значения в существующее поле Цвет")
  if (data.code !== LEGACY_COLOR && (data.role === "color" || normalizeCatalogValue(data.label) === "цвет")) {
    if (definitions.some((definition) => definition.code !== LEGACY_COLOR && definition.code !== data.code && (definition.role === "color" || normalizeCatalogValue(definition.label) === "цвет"))) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Цвет уже есть в библиотеке. Добавляйте значения в существующее поле")
    }
  }
  if (data.choice_values?.length) {
    const retained = new Set(previous?.choice_values ?? [])
    const additions = data.choice_values.filter((value) => !retained.has(value))
    const [normalized] = additions.length ? normalizeCmsAttributes([{ code: data.code, values: additions }], [{ ...data, id: previous?.id ?? data.code, enabled: true }]) : []
    data.choice_values = [...new Set([...data.choice_values.filter((value) => retained.has(value)), ...(normalized?.values ?? []).map((item) => item.numericValue === null ? item.value : String(item.numericValue))])]
  }
  const allowedValues = new Set(data.choice_values ?? previous?.choice_values ?? [])
  if (Object.keys(data.choice_colors ?? {}).some((name) => data.role !== "color" || !allowedValues.has(name))) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Оттенок можно задать только допустимому значению поля «Цвет»")
  }
  const colors = Object.fromEntries(Object.entries(data.choice_colors ?? previous?.choice_colors ?? {})
    .filter(([name]) => data.role === "color" && allowedValues.has(name)))
  const choice_colors = Object.keys(colors).length ? colors : null
  if (previous && previous.code !== data.code) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Стабильный код нельзя менять. Создайте новое определение")
  const typeChanged = previous && (previous.type !== data.type || previous.unit !== data.unit)
  const usedType = () => new MedusaError(MedusaError.Types.INVALID_DATA, "Тип и единицу используемой характеристики нельзя менять; создайте новое определение")
  if (typeChanged) {
    const [used] = await service.listCatalogAttributes({ key: previous.code }, { take: 1 })
    if (used) throw usedType()
  }
  const aliases = [...new Set([...(previous?.aliases ?? []), ...(previous && previous.label !== data.label ? [previous.label] : [])])]
  const isLibrary = isLibraryDefinition({ ...data, id: previous?.id ?? data.code, choice_values: data.choice_values ?? previous?.choice_values })
  const otherLabels = new Set(definitions.filter((definition) => definition.code !== data.code && isLibraryDefinition(definition) === isLibrary)
    .flatMap((definition) => [definition.label, ...definition.aliases].map(canonicalCatalogToken)))
  const previousLabels = new Set([previous?.label ?? "", ...(previous?.aliases ?? [])].map(canonicalCatalogToken))
  const currentLabel = canonicalCatalogToken(data.label)
  if ((isLibrary && ["базовый вариант", "__catalog_combination"].includes(currentLabel)) ||
      [data.label, ...aliases].map(canonicalCatalogToken).some((label) => otherLabels.has(label) && (!previousLabels.has(label) || (previous && isLibrary !== isLibraryDefinition(previous))))) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Название поля совпадает с названием или прежним названием другого поля")
  }
  // Definitions are canonical display policy. Existing assignments preserve
  // their values and source provenance when labels/visibility/order change.
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const removed = new Set(data.choice_values !== undefined ? (previous?.choice_values ?? []).filter((value) => !data.choice_values!.includes(value)) : [])
  const policyChanged = previous && (previous.label !== data.label || previous.public !== data.public || previous.enabled !== data.enabled || previous.filterable !== data.filterable)
  const [records, variants, rows] = await Promise.all([
    policyChanged ? service.listCatalogRecords({}, { take: 10000 }) : Promise.resolve([] as Awaited<ReturnType<typeof service.listCatalogRecords>>),
    policyChanged || removed.size ? service.listCatalogVariants({}, { take: 10000 }) : Promise.resolve([] as Awaited<ReturnType<typeof service.listCatalogVariants>>),
    policyChanged ? service.listCatalogAttributes({ key: data.code }, { take: 20000 }) : Promise.resolve([] as Awaited<ReturnType<typeof service.listCatalogAttributes>>),
  ])
  const renamed = previous && canonicalCatalogToken(previous.label) !== currentLabel
  const migratedProductIds: string[] = []
  if (removed.size) {
    const used = variants.some((variant) => variant.attributes.some((attribute) => attribute.key === data.code && attribute.rawValues.some((value) => removed.has(value))))
    if (used) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Значение уже назначено варианту товара. Сначала измените его в товаре")
  }
  if (removed.size || renamed || typeChanged) {
    for await (const { id, assignments } of readLibraryDefinitionUsage(container, data.code)) {
      if (typeChanged) throw usedType()
      if (assignments.some((assignment) => removed.has(assignment.choice))) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Значение уже назначено варианту товара. Сначала измените его в товаре")
      if (renamed) migratedProductIds.push(id)
    }
  }
  const affectedVariants = policyChanged ? variants.filter((variant) => variant.attributes.some((attribute) => attribute.key === data.code)) : []
  const snapshot: DefinitionSnapshot = { definition: previous, records: records.filter((record) => record.attributes.some((attribute) => attribute.key === data.code)).map(({ id, attributes, searchable_text }) => ({ id, attributes, searchable_text })), variants: affectedVariants.map(({ id, attributes }) => ({ id, attributes })), rows: rows.map(({ id, label, filterable }) => ({ id, label, filterable })) }
  try {
  const definition = previous ? await service.updateCatalogDefinitions({ ...data, aliases, choice_colors, id: previous.id }) : await service.createCatalogDefinitions({ ...data, aliases, choice_colors })
  if (!previous) snapshot.created_id = definition.id
  const apply = (attributes: any[]) => attributes.map((attribute) => attribute.key === data.code ? { ...attribute, label: data.label, legacyLabels: aliases, cmsManaged: true, public: data.public && data.enabled, filterable: data.public && data.enabled && data.filterable } : attribute)
  for (const record of records) if (record.attributes.some((attribute) => attribute.key === data.code)) {
    const attributes = apply(record.attributes)
    await service.updateCatalogRecords({ id: record.id, attributes, searchable_text: attributes.filter((attribute) => attribute.public).flatMap((attribute) => attribute.values.map((value: any) => `${attribute.label} ${value.value}`)).join(" ") })
  }
  for (const variant of affectedVariants) await service.updateCatalogVariants({ id: variant.id, attributes: apply(variant.attributes) })
  if (rows.length) await service.updateCatalogAttributes(rows.map((row) => ({ id: row.id, label: data.label, filterable: data.public && data.enabled && data.filterable })))
  const affectedRecordIds = [...new Set([...snapshot.records.map((record) => record.id), ...affectedVariants.map((variant) => variant.record_id)])]
  const productIds = new Set(migratedProductIds)
  if (affectedRecordIds.length) {
    const { data: linked } = await query.graph({ entity: "catalog_record", fields: ["product.id"], filters: { id: affectedRecordIds }, pagination: { take: 10000 } })
    for (const record of linked) if ((record as any).product?.id) productIds.add((record as any).product.id)
  }
  if (productIds.size) await container.resolve(Modules.EVENT_BUS).emit({ name: "product.updated", data: [...productIds].map((id) => ({ id })) })
  await service.createCatalogChanges({ product_id: "definitions", variant_id: null, actor_id: input.actor_id, action: "definition-save", reason: data.code, before: previous ?? {}, after: definition })
  return new StepResponse({ definition }, snapshot)
  } catch (error) {
    await restoreDefinition(service, snapshot)
    throw error
  }
}, { timeout: 10, expire: 180 }), async (snapshot, { container }) => {
  if (snapshot) await restoreDefinition(container.resolve<CatalogAttributesModuleService>(CATALOG_ATTRIBUTES_MODULE), snapshot)
})

export const saveCatalogDefinitionWorkflow = createWorkflow("save-catalog-definition", function (input: { data: CatalogDefinitionBody; actor_id: string }) {
  return new WorkflowResponse(saveCatalogDefinitionStep(input))
})

const confirmCatalogStockStep = createStep("confirm-catalog-stock", async (input: { id: string; data: CatalogStockBody; actor_id: string }, { container }) => {
  const data = CatalogStockSchema.parse(input.data)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: variants } = await query.graph({ entity: "product_variant", fields: ["id", "metadata", "manage_inventory", "allow_backorder", "product.id", "product.metadata", "product.sales_channels.id", "inventory_items.inventory_item_id", "inventory_items.required_quantity", "inventory_items.inventory.location_levels.*"], filters: { id: input.id } })
  const variant = variants[0] as any
  if (!variant || variant.inventory_items?.length !== 1 || Number(variant.inventory_items[0].required_quantity) !== 1) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Подтверждение доступно для варианта с одной складской единицей. Настройте Inventory в стандартной форме")
  const { data: locations } = await query.graph({ entity: "stock_location", fields: ["id", "sales_channels.id"], filters: { id: data.location_id } })
  if (!locations[0]?.sales_channels?.some((channel) => channel && variant.product.sales_channels?.some((entry: any) => entry.id === channel.id))) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Склад должен быть связан с каналом продаж товара")
  const inventory = variant.inventory_items[0]
  const level = inventory.inventory.location_levels.find((item: any) => item.location_id === data.location_id)
  if (level && data.quantity < Number(level.reserved_quantity)) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Количество не может быть меньше уже зарезервированного")
  const service = container.resolve<CatalogAttributesModuleService>(CATALOG_ATTRIBUTES_MODULE)
  const change = await service.createCatalogChanges({ product_id: variant.product.id, variant_id: variant.id, actor_id: input.actor_id, action: "stock-confirmation", reason: data.reason, before: { metadata: variant.metadata, quantity: level?.stocked_quantity ?? null, location_id: data.location_id }, after: { quantity: data.quantity, location_id: data.location_id } })
  try {
    if (level) await updateInventoryLevelsWorkflow(container).run({ input: { updates: [{ inventory_item_id: inventory.inventory_item_id, location_id: data.location_id, stocked_quantity: data.quantity }] } })
    else await createInventoryLevelsWorkflow(container).run({ input: { inventory_levels: [{ inventory_item_id: inventory.inventory_item_id, location_id: data.location_id, stocked_quantity: data.quantity }] } })
    await updateProductVariantsWorkflow(container).run({ input: { product_variants: [{ id: variant.id, manage_inventory: true, allow_backorder: false, metadata: { ...variant.metadata, catalog_stock_confirmed: true, catalog_stock_confirmation_id: change.id } }] } })
    await updateProductsWorkflow(container).run({ input: { products: [{ id: variant.product.id, metadata: { ...variant.product.metadata, catalog_manual_override: true } }] } })
  } catch (error) {
    if (level) await updateInventoryLevelsWorkflow(container).run({ input: { updates: [{ inventory_item_id: inventory.inventory_item_id, location_id: data.location_id, stocked_quantity: Number(level.stocked_quantity) }] } })
    else await deleteInventoryLevelsWorkflow(container).run({ input: { inventory_item_id: inventory.inventory_item_id, location_id: data.location_id, force: true } })
    await updateProductVariantsWorkflow(container).run({ input: { product_variants: [{ id: variant.id, metadata: variant.metadata, manage_inventory: variant.manage_inventory, allow_backorder: variant.allow_backorder }] } })
    await service.deleteCatalogChanges(change.id)
    throw error
  }
  return new StepResponse({ confirmation_id: change.id, variant_id: variant.id })
})

export const confirmCatalogStockWorkflow = createWorkflow("confirm-catalog-stock", function (input: { id: string; data: CatalogStockBody; actor_id: string }) {
  return new WorkflowResponse(confirmCatalogStockStep(input))
})

const saveCatalogCategoryStep = createStep("save-catalog-category", async (input: { data: CatalogCategoryBody; actor_id: string }, { container }) => {
  const data = CatalogCategorySchema.parse(input.data)
  const profile = await getCatalogProfile(container)
  if (!profile.product_types.some((type) => type.enabled && type.code === data.kind)) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Выберите доступный тип из профиля каталога")
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: categories } = await query.graph({ entity: "product_category", fields: ["id", "metadata", "is_active", "is_internal"], filters: { id: data.id } })
  const category = categories[0]
  if (!category) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Категория не найдена")
  if (category.metadata?.catalog_trash) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Сначала восстановите категорию из корзины каталога")
  const metadata = { ...category.metadata, catalog_scope: data.published ? profile.scope : `${profile.scope}:draft`, catalog_kind: data.kind, catalog_position: data.position, catalog_filter_codes: data.filter_codes, catalog_seo: categorySeoWithDescription(data.seo, category.metadata?.catalog_seo), catalog_manual_override: true }
  await updateProductCategoriesWorkflow(container).run({ input: { selector: { id: data.id }, update: { metadata, is_active: data.published, is_internal: !data.published } } })
  await container.resolve<CatalogAttributesModuleService>(CATALOG_ATTRIBUTES_MODULE).createCatalogChanges({ product_id: data.id, variant_id: null, actor_id: input.actor_id, action: "category-save", reason: "Настройка категории каталога", before: category, after: metadata })
  return new StepResponse({ id: data.id })
})

export const saveCatalogCategoryWorkflow = createWorkflow("save-catalog-category", function (input: { data: CatalogCategoryBody; actor_id: string }) {
  return new WorkflowResponse(saveCatalogCategoryStep(input))
})

const deleteCatalogDefinitionStep = createStep("delete-catalog-definition", async (input: { id: string }, { container }) => container.resolve(Modules.LOCKING).execute(CATALOG_STRUCTURE_LOCK, async () => {
  const service = container.resolve<CatalogAttributesModuleService>(CATALOG_ATTRIBUTES_MODULE)
  const definition = await service.retrieveCatalogDefinition(input.id)
  const [records, variants] = await Promise.all([service.listCatalogRecords({}, { take: 10000 }), service.listCatalogVariants({}, { take: 10000 })])
  const inUse = () => new MedusaError(MedusaError.Types.INVALID_DATA, "Характеристика используется товарами. Отключите её или сначала удалите назначения")
  if ([...records, ...variants].some((item) => item.attributes.some((attribute) => attribute.key === definition.code))) throw inUse()
  for await (const usage of readLibraryDefinitionUsage(container, definition.code)) if (usage.assignments.length) throw inUse()
  await service.softDeleteCatalogDefinitions(definition.id)
  return new StepResponse({ id: definition.id, deleted: true }, definition.id)
}, { timeout: 10, expire: 180 }), async (id, { container }) => {
  if (id) await container.resolve<CatalogAttributesModuleService>(CATALOG_ATTRIBUTES_MODULE).restoreCatalogDefinitions(id)
})

export const deleteCatalogDefinitionWorkflow = createWorkflow("delete-catalog-definition", function (input: { id: string }) {
  return new WorkflowResponse(deleteCatalogDefinitionStep(input))
})

const saveCatalogProfileStep = createStep("save-catalog-profile", async (input: { data: CatalogProfileBody; actor_id: string }, { container }) => {
  const data = CatalogProfileSchema.parse(input.data)
  const service = container.resolve<CatalogAttributesModuleService>(CATALOG_ATTRIBUTES_MODULE)
  const [previous] = await service.listCatalogProfiles({ key: "store" })
  if (previous && previous.scope !== data.scope) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Пространство каталога сохраняется на весь срок установки. Новый магазин использует отдельный проект и БД")
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: regions } = await query.graph({ entity: "region", fields: ["id", "currency_code"], filters: { id: data.region_id } })
  if (!regions[0]) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Выберите существующий регион Medusa")
  const definitions = await service.listCatalogDefinitions({}, { take: 1000 })
  for (const type of data.product_types) {
    if (new Set(type.variant_axes).size !== type.variant_axes.length || new Set(type.filter_codes).size !== type.filter_codes.length) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Оси и фильтры не должны повторяться")
    if (type.variant_axes.some((code) => !definitions.some((definition) => definition.code === code && definition.enabled && definition.public))) throw new MedusaError(MedusaError.Types.INVALID_DATA, `«${type.label}»: выберите доступные публичные поля для шаблона вариаций`)
    if (type.filter_codes.some((code) => !definitions.some((definition) => definition.code === code && definition.enabled && definition.public && definition.filterable))) throw new MedusaError(MedusaError.Types.INVALID_DATA, `«${type.label}»: выберите публичные фильтруемые характеристики`)
  }
  const { data: products } = await query.graph({ entity: "product", fields: ["id", "metadata"], pagination: { take: 10000 } })
  if (products.some((product) => product.metadata?.catalog_scope === data.scope && !data.product_types.some((type) => type.code === (product.metadata?.catalog_kind ?? product.metadata?.insales_kind)))) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Нельзя удалить тип, назначенный товарам. Отключите его или измените товары")
  const product_types = data.product_types.map((type) => {
    const saved = previous?.product_types.find((item) => item.code === type.code)
    const variant_axes = type.variant_axes.map((code) => saved?.variant_axes.find((oldCode) => canonicalLibraryCode(oldCode) === code) ?? code)
    return { ...type, variant_axes }
  })
  const profile = previous ? await service.updateCatalogProfiles({ id: previous.id, ...data, product_types }) : await service.createCatalogProfiles({ key: "store", ...data, product_types })
  await service.createCatalogChanges({ product_id: "profile", variant_id: null, actor_id: input.actor_id, action: "profile-save", reason: "Профиль установки магазина", before: previous ?? {}, after: profile })
  return new StepResponse({ profile, currency_code: regions[0].currency_code }, { previous, id: profile.id })
}, async (snapshot, { container }) => {
  if (!snapshot) return
  const service = container.resolve<CatalogAttributesModuleService>(CATALOG_ATTRIBUTES_MODULE)
  if (snapshot.previous) await service.updateCatalogProfiles({ id: snapshot.previous.id, scope: snapshot.previous.scope, region_id: snapshot.previous.region_id, product_types: snapshot.previous.product_types })
  else await service.deleteCatalogProfiles(snapshot.id)
})

export const saveCatalogProfileWorkflow = createWorkflow("save-catalog-profile", function (input: { data: CatalogProfileBody; actor_id: string }) {
  return new WorkflowResponse(saveCatalogProfileStep(input))
})

