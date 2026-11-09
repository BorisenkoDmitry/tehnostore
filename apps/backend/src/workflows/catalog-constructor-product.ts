import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import {
  createProductsWorkflow, createProductVariantsWorkflow, updateProductVariantsWorkflow, deleteProductVariantsWorkflow,
  updateProductsWorkflow, deleteProductsWorkflow, createProductOptionsWorkflow, deleteProductOptionsWorkflow, setProductProductOptionsWorkflow,
} from "@medusajs/medusa/core-flows"
import type { ConstructorProductBody } from "../api/admin/catalog-constructor/validators"
import { availableHandle, catalogConflict, CATALOG_STRUCTURE_LOCK, invalidCatalog, readConstructor, readConstructorFamilies } from "../lib/catalog-constructor"
import { constructorSlug } from "../lib/catalog-slug"
import { basePrice, constructorAxes, constructorChoices, constructorProductRevision, readConstructorProduct } from "../lib/catalog-constructor-product"
import { catalogKind, catalogStableId, normalizeCatalogValue, normalizeCmsAttributes, normalizeProductSpecifications, type CatalogDefinitionData } from "../lib/catalog-cms"
import { configurationModelCategory, namedFamilyPrefix } from "../lib/product-configurations"
import { canonicalLibraryCode, DETACHED_VARIATION_FIELDS, detachedVariationFields, isLibraryDefinition, isRamAttribute, LIBRARY_RAM, LIBRARY_VARIATIONS, libraryChoices, librarySourceKeys, libraryVariations, type LibraryChoices } from "../lib/catalog-variation-library"
import { productSpecificationPrefix } from "../lib/product-specification"
import { descriptionHtml, descriptionTree } from "../lib/product-description"
import { descriptionText } from "../lib/insales"
import { CATALOG_ATTRIBUTES_MODULE } from "../modules/catalog-attributes"
import CatalogAttributesModuleService from "../modules/catalog-attributes/service"
import { canonicalCatalogToken } from "../search/helpers/catalog-filter-values"
import { saveCatalogProductWorkflow } from "./catalog-cms"

type Input = { data: ConstructorProductBody; actor_id: string }
const baseOption = { title: "Базовый вариант", values: ["Основной"] }
const combinationOption = "__catalog_combination"

function choiceIdentity(value: string, type: CatalogDefinitionData["type"] | undefined) {
  const token = canonicalCatalogToken(value)
  if (type === "number" || type === "money") {
    const number = token.replace(/\s+/g, "").replace(",", ".")
    if (/^-?\d+(?:\.\d+)?$/.test(number) && Number.isFinite(Number(number))) return String(Number(number))
  }
  if (type === "boolean") {
    if (["да", "есть", "true", "1"].includes(token)) return "да"
    if (["нет", "false", "0"].includes(token)) return "нет"
  }
  return token
}

const saveConstructorProduct = createStep("save-constructor-product", async ({ data, actor_id }: Input, { container }) => {
  const result = await container.resolve(Modules.LOCKING).execute(CATALOG_STRUCTURE_LOCK, async () => {
    const { profile, categories, visible } = await readConstructor(container)
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const service = container.resolve<CatalogAttributesModuleService>(CATALOG_ATTRIBUTES_MODULE)
    const current = data.id ? await readConstructorProduct(container, data.id) : null
    if (current && constructorProductRevision(current) !== data.revision) throw catalogConflict()
    if (current && current.variants.some((variant) => !data.variants.some((row) => row.id === variant.id))) throw invalidCatalog("Сохранённые варианты должны остаться в товаре. Измените их сочетания в таблице.")
    const ids = data.variants.flatMap((variant) => variant.id ? [variant.id] : [])
    if (new Set(ids).size !== ids.length || ids.some((id) => !current?.variants.some((row) => row.id === id))) throw invalidCatalog("Некорректный список вариантов")
    const productType = profile.product_types.find((type) => type.code === data.kind && type.enabled)
    if (!productType) throw invalidCatalog("Выберите доступный тип товара")
    const categoryIds = (current?.categories ?? []).map((category) => category.id)
    const familyId = data.new_family_name ? namedFamilyPrefix + data.new_family_name : data.family_id
    if (data.family_category_id && familyId && !categoryIds.includes(data.family_category_id)) categoryIds.push(data.family_category_id)
    const productCategories = categories.filter((category) => categoryIds.includes(category.id))
    if (familyId && (data.new_family_name || familyId !== current?.metadata?.catalog_family_id || data.family_category_id)) {
      const familyCategory = configurationModelCategory({
        id: current?.id ?? "", title: data.title, handle: "", categories: productCategories,
        metadata: { catalog_kind: data.kind, catalog_family_id: familyId },
      })
      if (!familyCategory || (data.family_category_id && familyCategory.id !== data.family_category_id)) throw invalidCatalog("Укажите одну категорию модели для семейства")
      if (familyCategory.metadata?.catalog_kind && familyCategory.metadata.catalog_kind !== data.kind) throw invalidCatalog("Категория семейства должна соответствовать типу товара")
      if (!data.brand.trim()) throw invalidCatalog("Укажите бренд товара для семейства")
      const families = await readConstructorFamilies(container, [familyCategory.id], profile)
      if (data.new_family_name) {
        const name = normalizeCatalogValue(data.new_family_name)
        if (families.some((family) => normalizeCatalogValue(family.label) === name)
          || (await service.listCatalogRecords({ family_id: familyId }, { take: 1 })).length) throw invalidCatalog("Семейство с таким названием уже существует")
      } else if (!families.some((family) => family.id === familyId && family.kind === data.kind
        && normalizeCatalogValue(family.brand) === normalizeCatalogValue(data.brand))) {
        throw invalidCatalog("Выберите семейство этой категории, типа и бренда")
      }
    }
    const publicCategories = categories.filter((row) => categoryIds.includes(row.id) && visible.has(row.id))
    if (data.visible && (!current || !current.sales_channels.length || !publicCategories.length || publicCategories.some((row) => row.metadata?.catalog_kind && row.metadata.catalog_kind !== data.kind))) {
      throw invalidCatalog("Для публикации нужна хотя бы одна опубликованная категория. Тип всех опубликованных категорий должен совпадать с типом товара.")
    }
    const definitions = await service.listCatalogDefinitions({}, { take: 1000 }) as CatalogDefinitionData[]
    const axes = current ? constructorAxes(current, definitions) : []
    const importedChoices = libraryVariations(current?.metadata)
    const nativeAxes = current ? constructorAxes(current, definitions, true).filter((axis) => !axis.library) : []
    const nativeByCode = new Map(nativeAxes.map((axis) => [axis.code, axis.title]))
    const template = productType.variant_axes.map(canonicalLibraryCode).filter((code) => data.variants.some((row) => row.choices?.[code]))
    const newAxes = (data.axes ?? (current ? axes : template.map((code) => ({ code })))).map(({ code }) => ({ code: canonicalLibraryCode(code) }))
    if (new Set(newAxes.map((axis) => axis.code)).size !== newAxes.length) throw invalidCatalog("Поля вариаций не должны повторяться")
    const removedAxes = axes.filter((axis) => !newAxes.some(({ code }) => code === axis.code))
    const detached = detachedVariationFields(current?.metadata)
    for (const { code } of removedAxes) detached.add(code)
    for (const { code } of newAxes) detached.delete(code)
    const allFields = new Map(newAxes.map(({ code }) => {
      const definition = definitions.find((row) => row.code === code)
      const existing = axes.some((axis) => axis.code === code)
      if (!definition || ((!definition.enabled || !definition.public || !isLibraryDefinition(definition)) && !existing)) throw invalidCatalog("Недоступное поле варианта")
      return [code, definition]
    }))
    const axisByCode = new Map([...allFields].flatMap(([code, definition]) =>
      !importedChoices || nativeByCode.has(code) ? [[code, nativeByCode.get(code) ?? definition.label] as const] : []))
    if (new Set(axisByCode.values()).size !== axisByCode.size) throw invalidCatalog("Названия осей должны быть уникальны")
    const axisTypes = new Map([...axisByCode].map(([code, title]) => [title, definitions.find((row) => row.code === code)?.type]))
    const nativeOptions = current?.options ?? []
    const originalByTitle = new Map(nativeOptions.map((option) => [option.title, option]))
    const choicesOf = (id: string | undefined) => {
      const variant = current?.variants.find((row) => row.id === id)
      return Object.fromEntries((variant?.options ?? []).flatMap((option) => {
        const native = nativeOptions.find((row) => row.id === option.option_id)
        return native ? [[native.title, option.value]] : []
      }))
    }
    if (!current && !axisByCode.size && data.variants.length !== 1) throw invalidCatalog("Товар без полей выбора имеет один базовый вариант")
    const valueMaps = new Map([...axisByCode.values()].map((title) => [
      title, new Map((originalByTitle.get(title)?.values ?? []).map(({ value }) => [choiceIdentity(value, axisTypes.get(title)), value])),
    ]))
    const attachCombinationOption = !!importedChoices && data.variants.some((row) => !row.id)
    const storedCombinationOption = originalByTitle.get(combinationOption)
    if (attachCombinationOption || storedCombinationOption) {
      valueMaps.set(combinationOption, new Map((storedCombinationOption?.values ?? []).map(({ value }) => [value, value])))
    }
    const sourceKeys = librarySourceKeys(current?.metadata)
    const detachedAttributes = new Set(definitions.map(({ code }) => code).filter((code) => detached.has(canonicalLibraryCode(code))))
    const libraryFields = new Set(axisByCode.keys())
    const fieldIdentity = (choices: Record<string, string>) => JSON.stringify(Object.entries(choices)
      .filter(([code]) => allFields.has(code)).sort().map(([code, value]) => [code, choiceIdentity(value, allFields.get(code)?.type)]))
    const rows = data.variants.map((row) => {
      const before = current?.variants.find((variant) => variant.id === row.id)
      const choices = choicesOf(row.id)
      const previousFields = current && before ? constructorChoices(current, before, axes) : {}
      const fields: Record<string, string> = {}
      const assignments: LibraryChoices = Object.fromEntries(Object.entries(libraryChoices(current?.metadata, row.id)).filter(([code]) => !detached.has(code)))
      const managed = new Map(row.attributes.map((attribute) => [attribute.code, attribute]))
      if (Object.keys(row.choices ?? {}).some((code) => !allFields.has(code))) throw invalidCatalog("Выберите только поля вариаций этого товара")
      for (const [code, definition] of allFields) {
        const title = axisByCode.get(code)
        const raw = row.choices?.[code] ?? previousFields[code]
        if (!raw && before && importedChoices && axes.some((axis) => axis.code === code)) continue
        if (!raw) throw invalidCatalog(`Укажите «${definition.label}» для каждого сочетания`)
        const token = choiceIdentity(raw, definition.type)
        const valueFromLibrary = definition.choice_values?.find((value) => value === raw)
          ?? definition.choice_values?.find((value) => choiceIdentity(value, definition.type) === token)
        if (!valueFromLibrary && raw !== previousFields[code]) throw invalidCatalog(`Выберите допустимое значение «${definition.label}» из библиотеки`)
        const selected = valueFromLibrary ?? raw
        fields[code] = selected
        if (!title) {
          if (assignments[code]?.choice !== selected) {
            const [attribute] = normalizeCmsAttributes([{ code, values: [selected] }], definitions, [], new Set([code]))
            const similar = Object.values(importedChoices ?? {}).find((row) => row[code]?.display?.length)?.[code]
            const label = similar?.display?.[0].split(":", 1)[0] ?? definition.label
            assignments[code] = { source_keys: similar?.source_keys, ...assignments[code], label, choice: selected, value: attribute.values[0].value }
          }
          continue
        }
        const values = valueMaps.get(title)!
        const value = values.get(token) ?? selected
        values.set(token, value)
        choices[title] = value
        if (row.choices?.[code] !== undefined || !before) managed.set(code, { code, values: [selected] })
      }
      const visibleCombination = fieldIdentity(fields)
      const previousCombination = fieldIdentity(previousFields)
      if (attachCombinationOption || storedCombinationOption) {
        const value = choices[combinationOption] ?? catalogStableId("set", row.id ?? visibleCombination)
        choices[combinationOption] = value
        valueMaps.get(combinationOption)!.set(value, value)
      }
      for (const option of nativeOptions) if ((!before || data.axes !== undefined) && !choices[option.title]) {
        if (!before && importedChoices) {
          const label = canonicalCatalogToken(option.title)
          const code = [...allFields].find(([, definition]) =>
            [definition.label, ...(definition.aliases ?? [])].some((name) => canonicalCatalogToken(name) === label) || (definition.role === "color" && label === "цвет варианта"))?.[0]
          const selected = code && fields[code]
          if (selected) {
            const values = valueMaps.get(option.title) ?? new Map(option.values.map(({ value }) => [canonicalCatalogToken(value), value]))
            const token = canonicalCatalogToken(selected)
            const value = values.get(token) ?? selected
            values.set(token, value)
            valueMaps.set(option.title, values)
            choices[option.title] = value
            continue
          }
        }
        if (option.values.length !== 1) throw invalidCatalog(`Для добавления сочетания настройте поле «${option.title}» в справочнике`)
        choices[option.title] = option.values[0].value
      }
      if (!nativeOptions.length && !axisByCode.size) choices[baseOption.title] = baseOption.values[0]
      const attributes = [...managed.values()].filter((attribute) => !sourceKeys.has(attribute.code) && !detachedAttributes.has(attribute.code))
      normalizeCmsAttributes(attributes, definitions, before?.catalog_variant?.attributes, libraryFields)
      return { ...row, attributes, choices, fields, before, previousChoices: choicesOf(row.id), assignments, visibleCombination, previousCombination }
    })
    if (data.variant_spec_fields?.some((code) => code === "__price"
      ? !rows.some((row) => row.price !== undefined || (row.before && basePrice(row.before, profile.currency_code)))
      : !rows.some((row) => Object.prototype.hasOwnProperty.call(row.fields, code)))) throw invalidCatalog("Выберите поля вариаций этого товара")
    const identity = (choices: Record<string, string>) => JSON.stringify(Object.entries(choices).sort().map(([title, value]) => [title, choiceIdentity(value, axisTypes.get(title))]))
    const identities = new Map<string, typeof rows[number]>()
    for (const row of rows) {
      const key = allFields.size ? row.visibleCombination : identity(row.choices)
      const existing = identities.get(key)
      const changed = (entry: typeof row) => !entry.id || entry.visibleCombination !== entry.previousCombination
      if (existing && ((!importedChoices && !detached.size) || changed(existing) || changed(row))) throw invalidCatalog("Два варианта имеют одинаковое сочетание значений")
      identities.set(key, row)
    }
    const attributes = [...data.attributes]
    if (current) for (const { code, title } of removedAxes) {
      const definition = definitions.find((field) => field.code === code)
      const label = definition?.label ?? title
      const labels = new Set([label, title, ...(definition?.aliases ?? [])].map(normalizeCatalogValue))
      const common = current.catalog_record?.attributes ?? []
      const matches = (key: string, title: string) => labels.has(normalizeCatalogValue(title)) || (code === LIBRARY_RAM && isRamAttribute({ key, label: title }))
      const hasSpecification = attributes.some((attribute) => matches(attribute.code,
        attribute.label ?? definitions.find((field) => field.code === attribute.code)?.label ?? "",
      )) || common.some((attribute) => sourceKeys.has(attribute.key) && matches(attribute.key, attribute.label))
      if (hasSpecification) continue
      const values = [...new Set(current.variants.flatMap((variant) => {
        const value = libraryChoices(current.metadata, variant.id)[code]?.value ??
          variant.catalog_variant?.attributes.find((attribute) => attribute.key === code)?.values[0]?.value ??
          constructorChoices(current, variant, axes)[code]
        return value ? [value] : []
      }))]
      if (values.length) attributes.push({ code: catalogStableId(productSpecificationPrefix.slice(0, -1), code), label, values })
    }
    normalizeProductSpecifications(attributes.filter((attribute) => !sourceKeys.has(attribute.code)), definitions, current?.catalog_record?.attributes)
    const options = [...valueMaps].map(([title, values]) => ({ title, values: [...values.values()] }))
    const automatic = constructorSlug(data.title) || "product"
    const handleCandidate = data.handle ?? current?.handle ?? automatic
    const productService = container.resolve(Modules.PRODUCT)
    const taken = new Set<string>()
    const isTaken = async (handle: string) => (await productService.listProducts({ handle }, { select: ["id"], take: 1 })).some((row) => row.id !== current?.id)
    for (let candidate = handleCandidate; await isTaken(candidate); candidate = availableHandle(data.title, data.handle ?? current?.handle, taken, "product")) taken.add(candidate)
    const handle = availableHandle(data.title, data.handle ?? current?.handle, taken, "product")
    const rich = data.description_html === undefined ? undefined : descriptionHtml(descriptionTree(data.description_html))
    const metadata = {
      ...current?.metadata,
      catalog_scope: current?.metadata?.catalog_scope ?? `${profile.scope}:draft`,
      catalog_kind: data.kind ?? catalogKind(current?.metadata ?? {}),
      ...(data.axes !== undefined || !current ? {
        catalog_constructor_axes: Object.fromEntries([...nativeByCode].filter(([code]) => detached.has(code)).concat([...axisByCode])),
        catalog_constructor_axis_order: [...allFields.keys()],
        [DETACHED_VARIATION_FIELDS]: [...detached],
      } : {}),
      ...(data.variant_spec_fields !== undefined ? { catalog_variant_spec_fields: [...new Set(data.variant_spec_fields)] } : {}),
      ...(rich !== undefined ? { catalog_description_html: rich } : {}),
    }
    const basic = {
      title: data.title,
      handle,
      metadata,
      ...(rich !== undefined ? { description: descriptionText(rich) } : {}),
      ...(data.images !== undefined ? { images: [...new Set(data.images)].map((url) => ({ url })), thumbnail: data.images[0] ?? null } : {}),
    }
    const currency_code = profile.currency_code
    const newVariant = (row: typeof rows[number], variant_rank: number) => ({
      title: row.title,
      sku: row.sku || undefined,
      options: row.choices,
      prices: row.price === undefined ? [] : [{ currency_code, amount: row.price }],
      manage_inventory: true,
      allow_backorder: false,
      variant_rank,
    })
    const rollback: (() => Promise<unknown>)[] = []
    try {
      let id = current?.id
      const variantIds = new Map<number, string>()
      if (!id) {
        const [{ data: stores }, { data: shipping }] = await Promise.all([
          query.graph({ entity: "store", fields: ["default_sales_channel_id"] }),
          query.graph({ entity: "shipping_profile", fields: ["id", "type"] }),
        ])
        const channel = stores[0]?.default_sales_channel_id
        const shippingProfile = shipping.find((row) => row.type === "default") ?? shipping[0]
        if (!channel || !shippingProfile) throw invalidCatalog("Настройте канал продаж и профиль доставки магазина")
        const { result: [product] } = await createProductsWorkflow(container).run({ input: { products: [{
          ...basic, status: "draft", sales_channels: [{ id: channel }], shipping_profile_id: shippingProfile.id,
          options: options.length ? options : [baseOption], variants: rows.map(newVariant),
        }] } })
        id = product.id
        rollback.push(() => deleteProductsWorkflow(container).run({ input: { ids: [product.id] } }))
        product.variants.forEach((variant, index) => variantIds.set(index, variant.id))
      } else {
        const productId = id
        const missingOptions = options.filter((option) => !originalByTitle.has(option.title))
        if (missingOptions.length) {
          const { result: created } = await createProductOptionsWorkflow(container).run({ input: { product_options: missingOptions.map((option) => ({ ...option, is_exclusive: true })) } })
          const ids = created.map((option) => option.id)
          let linked = false
          rollback.push(() => linked
            ? setProductProductOptionsWorkflow(container).run({ input: { product_id: productId, remove: ids } })
            : deleteProductOptionsWorkflow(container).run({ input: { ids } }))
          await setProductProductOptionsWorkflow(container).run({ input: { product_id: productId, add: ids } })
          linked = true
        }
        const addedValues = options.flatMap((option) => {
          const previous = originalByTitle.get(option.title)
          if (!previous) return []
          const add = option.values.filter((value) => !previous.values.some((entry) => entry.value === value)).map((value) => ({ value }))
          return add.length ? [{ product_option_id: previous.id, add }] : []
        })
        if (addedValues.length) {
          await setProductProductOptionsWorkflow(container).run({ input: { product_id: productId, update: addedValues } })
          rollback.push(async () => {
            const product = await readConstructorProduct(container, productId)
            const update = addedValues.map(({ product_option_id, add }) => ({
              product_option_id,
              remove: product.options.find((option) => option.id === product_option_id)?.values
                .filter(({ value }) => add.some((entry) => entry.value === value)).map(({ id }) => id) ?? [],
            }))
            await setProductProductOptionsWorkflow(container).run({ input: { product_id: productId, update } })
          })
        }
        const updates = rows.flatMap((row) => {
          if (!row.before) return []
          const base = basePrice(row.before, currency_code)
          const prices = row.before.price_set?.prices?.filter((price) => !price.price_list_id) ?? []
          const changedPrice = row.price !== undefined && row.price !== (base ? Number(base.amount) : undefined)
          const changedOptions = identity(row.choices) !== identity(row.previousChoices)
          const sku = row.sku === undefined ? row.before.sku : row.sku
          if (!changedPrice && !changedOptions && row.title === row.before.title && sku === row.before.sku) return []
          const updatedPrices = base ? prices.map((price) => price.id === base.id ? { ...price, amount: row.price! } : price) : [...prices, { currency_code, amount: row.price! }]
          // Native variant updates require every currently linked option.
          // Restore the old choices first, retaining the newly linked axes
          // until the preceding compensation unlinks them from the product.
          const previousChoices = { ...row.previousChoices }
          for (const option of missingOptions) previousChoices[option.title] = row.choices[option.title]
          return [{
            next: { id: row.before.id, title: row.title, sku, ...(changedOptions ? { options: row.choices } : {}), ...(changedPrice ? { prices: updatedPrices } : {}) },
            previous: { id: row.before.id, title: row.before.title, sku: row.before.sku, ...(changedOptions ? { options: previousChoices } : {}), ...(changedPrice ? { prices } : {}) },
          }]
        })
        if (updates.length) {
          await updateProductVariantsWorkflow(container).run({ input: { product_variants: updates.map((update) => update.next) } })
          rollback.push(() => updateProductVariantsWorkflow(container).run({ input: { product_variants: updates.map((update) => update.previous) } }))
        }
        const nextRank = Math.max(-1, ...(current?.variants.map((variant) => variant.variant_rank ?? 0) ?? [])) + 1
        const additions = rows.flatMap((row, index) => row.id ? [] : [{ index, input: { ...newVariant(row, nextRank + index), product_id: productId } }])
        if (additions.length) {
          const { result: created } = await createProductVariantsWorkflow(container).run({ input: { product_variants: additions.map((item) => item.input) } })
          rollback.push(() => deleteProductVariantsWorkflow(container).run({ input: { ids: created.map((row) => row.id) } }))
          additions.forEach((item, index) => variantIds.set(item.index, created[index].id))
        }
        const variations = importedChoices ? Object.fromEntries(rows.map((row, index) => [row.id ?? variantIds.get(index)!, row.assignments])) : undefined
        await updateProductsWorkflow(container).run({ input: { products: [{ id, ...basic, metadata: variations ? { ...metadata, [LIBRARY_VARIATIONS]: variations } : metadata }] } })
        rollback.push(() => updateProductsWorkflow(container).run({ input: { products: [{
          id: productId, title: current!.title, handle: current!.handle, description: current!.description,
          thumbnail: current!.thumbnail, metadata: current!.metadata,
          ...(data.images === undefined ? {} : { images: current!.images }),
        }] } }))
      }
      await saveCatalogProductWorkflow(container).run({
        input: { id, actor_id, constructor_edit: true, preserve_attribute_codes: [...sourceKeys],
          preserve_variant_attribute_codes: [...detachedAttributes], library_fields: [...libraryFields], data: {
          visible: data.visible, kind: data.kind, brand: data.brand, family_id: familyId, seo: data.seo,
          category_ids: categoryIds, attributes,
          variants: rows.map((row, index) => ({ id: row.id ?? variantIds.get(index)!, attributes: row.attributes, old_price: row.old_price })),
        } },
      })
      return { id }
    } catch (error) {
      const failures: unknown[] = []
      for (const undo of rollback.reverse()) {
        try { await undo() } catch (failure) { failures.push(failure) }
      }
      if (failures.length) {
        container.resolve(ContainerRegistrationKeys.LOGGER).error("Catalog product compensation failed", new AggregateError([error, ...failures]))
        throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "Не удалось полностью отменить сохранение товара")
      }
      throw error
    }
  }, { timeout: 10, expire: 180 })
  return new StepResponse(result)
})

export const saveConstructorProductWorkflow = createWorkflow("save-constructor-product", function (input: Input) {
  return new WorkflowResponse(saveConstructorProduct(input))
})
