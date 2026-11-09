import type { CreateProductWorkflowInputDTO, UpdateProductVariantWorkflowInputDTO } from "@medusajs/framework/types"
import { createStep, createWorkflow, StepResponse, transform, when, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import { createProductsWorkflow, updateProductsStep, updateProductsWorkflow, updateProductVariantsStep, createInventoryLevelsWorkflow, updateInventoryLevelsWorkflow } from "@medusajs/medusa/core-flows"
import { upsertCatalogAttributesWorkflow } from "./catalog-attributes"
import type { CatalogAttributesInput as CatalogRecordInput } from "../modules/catalog-attributes/types"
import { insalesVariantImagesWorkflow } from "./insales-variant-images"
import { LEGACY_VARIATION_FACETS, snapshotLegacyVariations } from "../search/helpers/variation-facets"
import type { snapshotLegacyConfigurationAttributes } from "../lib/product-configurations"
import { CATALOG_STRUCTURE_LOCK } from "../lib/catalog-constructor"
import { attachRamChoices, LIBRARY_RAM, LIBRARY_VARIATIONS } from "../lib/catalog-variation-library"
import { CATALOG_ATTRIBUTES_MODULE } from "../modules/catalog-attributes"
import type CatalogAttributesModuleService from "../modules/catalog-attributes/service"

type Input = {
  product: CreateProductWorkflowInputDTO
  existing_id?: string
  existing_variant_ids: Record<string, string>
  existing_price_updates?: { variant_id: string; price_id: string; previous_amount: number; amount: number }[]
  attributes: Omit<CatalogRecordInput, "product_id" | "variants"> & { variants: (Omit<CatalogRecordInput["variants"][number], "variant_id">)[] }
  stocks: Record<string, number | null>
  location_id: string
  variant_image_urls: { source_variant_id: string; image_urls: string[] }[]
  legacy_configuration: ReturnType<typeof snapshotLegacyConfigurationAttributes>
}

const updateInsalesBasePricesStep = createStep("update-insales-base-prices", async (updates: NonNullable<Input["existing_price_updates"]>, { container }) => {
  if (!updates.length) return new StepResponse([], [])
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const pricing = container.resolve(Modules.PRICING)
  const { data: variants } = await query.graph({ entity: "product_variant", fields: ["id", "price_set.id", "price_set.prices.*"], filters: { id: updates.map(({ variant_id }) => variant_id) } })
  const plans = updates.map((update) => {
    const set = variants.find((variant) => variant.id === update.variant_id)?.price_set
    const base = set?.prices?.filter((price) => price && !price.price_list_id && !price.deleted_at) ?? []
    const price = base[0]
    if (!set?.id || base.length !== 1 || !price || price.id !== update.price_id || price.currency_code !== "rub" || price.rules_count || price.min_quantity != null || price.max_quantity != null || Number(price.amount) !== update.previous_amount) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Base price changed during import; product update was reverted")
    }
    return { set_id: set.id, price_id: price.id, previous_amount: update.previous_amount, amount: update.amount }
  })
  const updated = await pricing.upsertPriceSets(plans.map((plan) => ({ id: plan.set_id, prices: [{ id: plan.price_id, currency_code: "rub", amount: plan.amount }] })))
  return new StepResponse(updated.map(({ id }) => id), plans)
}, async (plans, { container }) => {
  if (!plans?.length) return
  const pricing = container.resolve(Modules.PRICING)
  const sets = await pricing.listPriceSets({ id: plans.map((plan) => plan.set_id) }, { relations: ["prices"] })
  for (const plan of plans) {
    // The pricing module populates base prices only for price sets.
    const base = sets.find((set) => set.id === plan.set_id)?.prices ?? []
    if (base.length !== 1 || base[0].id !== plan.price_id || Number(base[0].amount) !== plan.amount) throw new Error("Base price changed after import; automatic price recovery stopped")
  }
  await pricing.upsertPriceSets(plans.map((plan) => ({ id: plan.set_id, prices: [{ id: plan.price_id, currency_code: "rub", amount: plan.previous_amount }] })))
})

const prepareImportedRecordStep = createStep("prepare-imported-record", async (input: { product_id: string; data: Input }, { container }) => {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "product", fields: ["id", "metadata", "options.title", "options.values.value", "variants.id", "variants.metadata", "variants.options.option.title", "variants.options.value", "variants.inventory_items.inventory_item_id", "variants.inventory_items.inventory.location_levels.*"], filters: { id: input.product_id } })
  const product = data[0]
  const variants = input.data.attributes.variants.map((source) => {
    const variant = product.variants?.find((v) => v.metadata?.insales_variant_id === source.source_variant_id)
    if (!variant) throw new Error(`Missing variant mapping ${source.source_variant_id}`)
    return { ...source, variant_id: variant.id }
  })
  const creates: { inventory_item_id: string; location_id: string; stocked_quantity: number }[] = []
  const updates: { id: string; inventory_item_id: string; location_id: string; stocked_quantity: number }[] = []
  for (const variant of product.variants ?? []) {
    const sourceId = String(variant.metadata?.insales_variant_id ?? "")
    // Unknown stock remains unknown in the private snapshot and unsellable in Medusa.
    const quantity = input.data.stocks[sourceId] ?? 0
    const item = variant.inventory_items?.[0]
    if (!item?.inventory_item_id) throw new Error(`Missing inventory item for ${sourceId}`)
    const level = item.inventory?.location_levels?.find((l) => l?.location_id === input.data.location_id)
    const value = { inventory_item_id: item.inventory_item_id, location_id: input.data.location_id, stocked_quantity: quantity }
    if (!level) creates.push(value)
    else if (Number(level.stocked_quantity) !== quantity) {
      if (Number(level.reserved_quantity) > 0) throw new Error("Stock became reserved during import; product update was reverted")
      updates.push({ ...value, id: level.id })
    }
  }
  const facetVariants = variants.map((source) => {
    const variant = product.variants!.find((row) => row.id === source.variant_id)!
    return { id: variant.id, metadata: variant.metadata, options: variant.options, catalog_variant: { attributes: source.attributes } }
  })
  const facets = snapshotLegacyVariations({ metadata: product.metadata, options: product.options, catalog_record: { attributes: input.data.attributes.attributes }, variants: facetVariants }, facetVariants)
  const facetUpdates = facetVariants.map((variant, index) => ({ id: variant.id, metadata: { ...variant.metadata, [LEGACY_VARIATION_FACETS]: { ...facets[index], configuration: input.data.legacy_configuration } } }))
  const ram = attachRamChoices(product.metadata, input.data.attributes.attributes, variants.map(({ variant_id, attributes }) => ({ id: variant_id, attributes })))
  const ramUpdates = ram ? await container.resolve(Modules.LOCKING).execute(CATALOG_STRUCTURE_LOCK, async () => {
    const service = container.resolve<CatalogAttributesModuleService>(CATALOG_ATTRIBUTES_MODULE)
    const [definition] = await service.listCatalogDefinitions({ code: LIBRARY_RAM })
    if (!definition?.enabled) return []
    const values = [...new Set([...definition.choice_values, ...Object.values(ram).flatMap((row) => row[LIBRARY_RAM]?.choice ?? [])])]
    if (values.length !== definition.choice_values.length) {
      await service.updateCatalogDefinitions({ id: definition.id, choice_values: values.sort((a, b) => a.localeCompare(b, "ru", { numeric: true })) })
    }
    return [{ id: product.id, metadata: { ...product.metadata, [LIBRARY_VARIATIONS]: ram } }]
  }, { timeout: 10, expire: 60 }) : []
  return new StepResponse({ attributes: { ...input.data.attributes, product_id: product.id, variants }, creates, updates, facetUpdates, ramUpdates })
})

export const importInsalesProductWorkflow = createWorkflow("import-insales-product", function (input: Input) {
  const created = when("new-insales-product", input, (data) => !data.existing_id).then(() => {
    return createProductsWorkflow.runAsStep({ input: transform(input, (data) => ({ products: [data.product] })) })
  })
  const updated = when("existing-insales-product", input, (data) => Boolean(data.existing_id)).then(() => {
    return updateProductsWorkflow.runAsStep({ input: transform(input, (data) => {
      // Existing options already have allowed value links. Passing create-style
      // `values` alongside their IDs would clear those links in Medusa 2.22.
      const { options: _options, variants, ...product } = data.product
      // Legacy demo replacements still use the native initial price setup.
      // Imported variants have their own compensating step below.
      const demoVariants = !data.existing_price_updates ? variants?.map((variant) => ({ ...variant, id: data.existing_variant_ids[String(variant.metadata?.insales_variant_id)] })) as UpdateProductVariantWorkflowInputDTO[] : undefined
      return { products: [{ ...product, handle: product.handle ?? undefined, id: data.existing_id!, ...(demoVariants ? { variants: demoVariants } : {}) }] }
    }) })
  })
  const importedVariantUpdates = transform({ input, updated }, ({ input }) => ({
    product_variants: input.existing_id && input.existing_price_updates ? (input.product.variants ?? []).map((variant) => ({
      id: input.existing_variant_ids[String(variant.metadata?.insales_variant_id)],
      title: variant.title, sku: variant.sku, metadata: variant.metadata,
      manage_inventory: variant.manage_inventory, allow_backorder: variant.allow_backorder,
    })) : [],
  }))
  const variantsUpdated = updateProductVariantsStep(importedVariantUpdates)
  const prepared = prepareImportedRecordStep(transform({ input, created, updated, variantsUpdated }, ({ input, created, updated }) => ({ product_id: (input.existing_id ?? created?.[0]?.id ?? updated?.[0]?.id)!, data: input })))
  const record = upsertCatalogAttributesWorkflow.runAsStep({ input: prepared.attributes })
  const facets = updateProductVariantsStep(transform({ prepared, record }, ({ prepared }) => ({ product_variants: prepared.facetUpdates }))).config({ name: "save-imported-variation-facets" })
  const ram = updateProductsStep(transform({ prepared, facets }, ({ prepared }) => ({ products: prepared.ramUpdates }))).config({ name: "save-imported-ram-variations" })
  const stock = transform({ prepared, ram }, ({ prepared }) => prepared)
  const stockCreated = when("new-insales-stock", stock, (data) => data.creates.length > 0).then(() => {
    return createInventoryLevelsWorkflow.runAsStep({ input: transform(stock, (data) => ({ inventory_levels: data.creates })) })
  })
  const stockUpdated = when("updated-insales-stock", stock, (data) => data.updates.length > 0).then(() => {
    return updateInventoryLevelsWorkflow.runAsStep({ input: transform(stock, (data) => ({ updates: data.updates })) })
  })
  const images = insalesVariantImagesWorkflow.runAsStep({ input: transform({ input, prepared, record }, ({ input, prepared }) => ({ product_id: prepared.attributes.product_id, variants: input.variant_image_urls })) })
  const prices = updateInsalesBasePricesStep(transform({ input, stockCreated, stockUpdated, images }, ({ input }) => input.existing_price_updates ?? []))
  // Publication occurs only after all attributes, links and inventory steps succeeded.
  const published = updateProductsWorkflow.runAsStep({ input: transform({ prepared, prices }, ({ prepared }) => ({ products: [{ id: prepared.attributes.product_id, status: "published" }] })) }).config({ name: "publish-imported-insales-product" })
  return new WorkflowResponse(published)
})
