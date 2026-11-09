import { randomUUID } from "node:crypto"
import { writeFileSync } from "node:fs"
import { inspect } from "node:util"
import type { ExecArgs, IInventoryService } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules, ProductStatus } from "@medusajs/framework/utils"
import { createStep, createWorkflow, StepResponse, transform, when, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { createInventoryLevelsWorkflow, createProductsWorkflow } from "@medusajs/medusa/core-flows"
import { CATALOG_ATTRIBUTES_MODULE } from "../modules/catalog-attributes"
import type CatalogAttributesModuleService from "../modules/catalog-attributes/service"
import type { CatalogAttributeInput } from "../modules/catalog-attributes/types"
import { upsertCatalogAttributesWorkflow } from "../workflows/catalog-attributes"

type Input = { sourceId: string; sourceVariantId: string; handle: string; profileId: string; locationId: string; inventory: boolean }
type Identity = { productId: string; variantId: string; inventoryItemId: string; recordId: string; catalogVariantId: string; sourceId: string; sourceVariantId: string; inventory: boolean }
type Observation = { identity: Identity; status: string; attributes: number; productLinks: number; variantLinks: number; inventoryLevels: number }
const observations: Observation[] = []

function testAttribute(key: string, label: string): CatalogAttributeInput {
  return { key, label, rawValues: ["synthetic"], values: [{ value: "synthetic", normalized: "synthetic", numericValue: null, unit: null }], dataType: "text", public: true, filterable: true }
}

const prepareCompensationProbeStep = createStep("prepare-insales-compensation-probe", async (input: { productId: string; data: Input }, { container }) => {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "product", fields: ["id", "variants.id", "variants.inventory_items.inventory_item_id"], filters: { id: input.productId } })
  const product = data[0]
  const variant = product?.variants?.[0]
  const inventoryItemId = variant?.inventory_items?.[0]?.inventory_item_id
  if (!variant?.id || !inventoryItemId) throw new Error("Synthetic product inventory was not created")
  return new StepResponse({
    identity: { productId: product.id, variantId: variant.id, inventoryItemId, sourceId: input.data.sourceId, sourceVariantId: input.data.sourceVariantId, inventory: input.data.inventory },
    attributes: {
      product_id: product.id, source_product_id: input.data.sourceId, source_hash: input.data.sourceId,
      source_data: { synthetic_compensation_probe: true }, searchable_text: "synthetic compensation probe",
      attributes: [testAttribute("compensation_product", "Synthetic product characteristic")],
      variants: [{ variant_id: variant.id, source_variant_id: input.data.sourceVariantId, source_data: { synthetic_compensation_probe: true }, attributes: [testAttribute("compensation_variant", "Synthetic variant characteristic")] }],
    },
    inventoryLevels: [{ inventory_item_id: inventoryItemId, location_id: input.data.locationId, stocked_quantity: 13 }],
  })
})

const forceCompensationProbeStep = createStep("force-insales-compensation-probe-failure", async (input: { identity: Omit<Identity, "recordId" | "catalogVariantId">; recordId: string }, { container }) => {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const service = container.resolve<CatalogAttributesModuleService>(CATALOG_ATTRIBUTES_MODULE)
  const inventoryService = container.resolve<IInventoryService>(Modules.INVENTORY)
  const link = container.resolve(ContainerRegistrationKeys.LINK)
  const { data } = await query.graph({ entity: "product", fields: ["id", "status", "catalog_record.id", "variants.id", "variants.catalog_variant.id"], filters: { id: input.identity.productId } })
  const product = data[0]
  const [variant] = await service.listCatalogVariants({ source_variant_id: input.identity.sourceVariantId })
  const attributes = await service.listCatalogAttributes({ record_id: input.recordId })
  if (!variant || product?.status !== "draft" || product.catalog_record?.id !== input.recordId || product.variants?.[0]?.catalog_variant?.id !== variant.id || attributes.length !== 2) throw new Error("Synthetic attribute/link precondition failed before fault injection")
  const productLinks = await link.list({ [Modules.PRODUCT]: { product_id: input.identity.productId }, [CATALOG_ATTRIBUTES_MODULE]: { catalog_record_id: input.recordId } })
  const variantLinks = await link.list({ [Modules.PRODUCT]: { product_variant_id: input.identity.variantId }, [CATALOG_ATTRIBUTES_MODULE]: { catalog_variant_id: variant.id } })
  const levels = await inventoryService.listInventoryLevels({ inventory_item_id: input.identity.inventoryItemId })
  if (productLinks.length !== 1 || variantLinks.length !== 1 || (input.identity.inventory && (levels.length !== 1 || Number(levels[0].stocked_quantity) !== 13))) throw new Error("Synthetic inventory/link precondition failed before fault injection")
  observations.push({ identity: { ...input.identity, recordId: input.recordId, catalogVariantId: variant.id }, status: product.status, attributes: attributes.length, productLinks: productLinks.length, variantLinks: variantLinks.length, inventoryLevels: levels.length })
  throw new Error(`INSALES_COMPENSATION_EXPECTED:${input.identity.sourceId}`)
})

const compensationProbeWorkflow = createWorkflow("test-insales-compensation-probe", function (input: Input) {
  const products = createProductsWorkflow.runAsStep({ input: transform(input, (data) => ({ products: [{ title: "Synthetic InSales compensation probe", handle: data.handle, status: ProductStatus.DRAFT, shipping_profile_id: data.profileId, options: [{ title: "Probe", values: ["Synthetic"] }], variants: [{ title: "Synthetic", sku: data.sourceVariantId, manage_inventory: true, allow_backorder: false, options: { Probe: "Synthetic" }, prices: [{ currency_code: "rub", amount: 1 }] }] }] })) })
  const prepared = prepareCompensationProbeStep(transform({ input, products }, ({ input, products }) => ({ productId: products[0].id, data: input })))
  const record = upsertCatalogAttributesWorkflow.runAsStep({ input: prepared.attributes })
  const stockInput = transform({ input, prepared, record }, ({ input, prepared }) => ({ enabled: input.inventory, levels: prepared.inventoryLevels }))
  const inventory = when("create-synthetic-probe-stock", stockInput, (data) => data.enabled).then(() => createInventoryLevelsWorkflow.runAsStep({ input: transform(stockInput, (data) => ({ inventory_levels: data.levels })) }))
  const failed = forceCompensationProbeStep(transform({ prepared, record, inventory }, ({ prepared, record }) => ({ identity: prepared.identity, recordId: record.record_id })))
  return new WorkflowResponse(failed)
})

/** Creates only unique synthetic drafts, and leaves cleanup exclusively to workflow compensation. */
export default async function testInsalesCompensation({ container }: ExecArgs) {
  const db = new URL(process.env.DATABASE_URL!)
  if (!["postgres", "localhost", "127.0.0.1"].includes(db.hostname) || db.pathname !== "/texno_medusa") throw new Error("Compensation probe is restricted to the local texno_medusa database")
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const service = container.resolve<CatalogAttributesModuleService>(CATALOG_ATTRIBUTES_MODULE)
  const inventoryService = container.resolve<IInventoryService>(Modules.INVENTORY)
  const link = container.resolve(ContainerRegistrationKeys.LINK)
  const { data: profiles } = await query.graph({ entity: "shipping_profile", fields: ["id", "type"] })
  const { data: locations } = await query.graph({ entity: "stock_location", fields: ["id", "name"] })
  const profileId = profiles.find((profile) => profile.type === "default")?.id
  const locationId = locations.find((location) => location.name === "TEXNO InSales source stock")?.id
  if (!profileId || !locationId) throw new Error("Existing local default shipping profile/source stock location required")
  const stages: Record<string, unknown>[] = []
  const reportPath = "/tmp/insales-compensation-test.json"
  for (const inventory of [false, true]) {
    const sourceId = `test-compensation-${randomUUID()}`
    const sourceVariantId = `${sourceId}-variant`
    const handle = sourceId
    const { data: beforeProducts } = await query.graph({ entity: "product", fields: ["id"], filters: { handle } })
    const beforeRecords = await service.listCatalogRecords({ source_product_id: sourceId })
    const beforeVariants = await service.listCatalogVariants({ source_variant_id: sourceVariantId })
    if (beforeProducts.length || beforeRecords.length || beforeVariants.length) throw new Error("Synthetic identity unexpectedly exists; no mutation attempted")
    let expectedError = false
    let errorText = ""
    try {
      await compensationProbeWorkflow(container).run({ input: { sourceId, sourceVariantId, handle, profileId, locationId, inventory } })
    } catch (error) {
      errorText = error instanceof Error ? error.message : inspect(error, { depth: 6 })
      expectedError = errorText.includes(`INSALES_COMPENSATION_EXPECTED:${sourceId}`)
    }
    const observed = observations.find((observation) => observation.identity.sourceId === sourceId)
    const { data: products } = await query.graph({ entity: "product", fields: ["id"], filters: { handle } })
    const records = await service.listCatalogRecords({ source_product_id: sourceId })
    const variants = await service.listCatalogVariants({ source_variant_id: sourceVariantId })
    const attributes = observed ? await service.listCatalogAttributes({ record_id: observed.identity.recordId }) : []
    const productLinks = observed ? await link.list({ [Modules.PRODUCT]: { product_id: observed.identity.productId }, [CATALOG_ATTRIBUTES_MODULE]: { catalog_record_id: observed.identity.recordId } }) : []
    const variantLinks = observed ? await link.list({ [Modules.PRODUCT]: { product_variant_id: observed.identity.variantId }, [CATALOG_ATTRIBUTES_MODULE]: { catalog_variant_id: observed.identity.catalogVariantId } }) : []
    const inventoryItems = observed ? await inventoryService.listInventoryItems({ id: observed.identity.inventoryItemId }) : []
    const inventoryLevels = observed ? await inventoryService.listInventoryLevels({ inventory_item_id: observed.identity.inventoryItemId }) : []
    const after = { products: products.length, records: records.length, variants: variants.length, attributes: attributes.length, productLinks: productLinks.length, variantLinks: variantLinks.length, inventoryItems: inventoryItems.length, inventoryLevels: inventoryLevels.length }
    const passed = expectedError && Boolean(observed) && Object.values(after).every((count) => count === 0)
    stages.push({ stage: inventory ? "failure_after_inventory_creation" : "failure_after_attributes_and_links", sourceId, before: { products: beforeProducts.length, records: beforeRecords.length, variants: beforeVariants.length }, observedBeforeFailure: observed, expectedError, errorText, after, passed })
    writeFileSync(reportPath, JSON.stringify({ passed: stages.every((stage) => stage.passed), stages }, null, 2))
    if (!passed) throw new Error(`Compensation probe failed; inspect ${reportPath}. No explicit cleanup was performed.`)
  }
  console.log(`InSales compensation probes passed: ${JSON.stringify(stages.map((stage) => ({ stage: stage.stage, after: stage.after })))}`)
}
