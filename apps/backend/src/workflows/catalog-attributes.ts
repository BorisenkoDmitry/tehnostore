import { createHash } from "node:crypto"
import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { createRemoteLinkStep } from "@medusajs/medusa/core-flows"
import { CATALOG_ATTRIBUTES_MODULE } from "../modules/catalog-attributes"
import CatalogAttributesModuleService from "../modules/catalog-attributes/service"
import { CatalogAttributeInput, CatalogAttributesInput } from "../modules/catalog-attributes/types"

type RecordData = {
  id: string
  source_product_id: string | null
  source_hash: string
  source_data: Record<string, unknown>
  searchable_text: string
  attributes: CatalogAttributeInput[]
}
type VariantData = {
  id: string
  source_variant_id: string | null
  source_data: Record<string, unknown>
  attributes: CatalogAttributeInput[]
  record_id: string
}
type AttributeData = {
  id: string
  key: string
  label: string
  raw_value: string
  value: string
  normalized_value: string
  type: "text" | "number" | "boolean"
  numeric_value: number | null
  unit: string | null
  filterable: boolean
  scope: "product" | "variant"
  record_id: string
  variant_id: string | null
}
type Snapshot = {
  record_id: string
  record: RecordData | null
  variants: VariantData[]
  attributes: AttributeData[]
}

const stableId = (prefix: string, value: string) =>
  `${prefix}_${createHash("sha256").update(value).digest("hex").slice(0, 32)}`

function publicAttributes(attributes: CatalogAttributeInput[]) {
  return attributes.filter((attribute) => attribute.public && !attribute.label.startsWith("__"))
}

function attributeRows(
  recordId: string,
  variantId: string | null,
  attributes: CatalogAttributeInput[]
): AttributeData[] {
  const rows = new Map<string, AttributeData>()
  for (const attribute of publicAttributes(attributes)) {
    for (const value of attribute.values) {
      const id = stableId("catattr", `${recordId}:${variantId || "product"}:${attribute.key}:${value.normalized}`)
      rows.set(id, {
        id,
        key: attribute.key,
        label: attribute.label,
        raw_value: attribute.rawValues.join("##"),
        value: value.value,
        normalized_value: value.normalized,
        type: attribute.dataType,
        numeric_value: value.numericValue,
        unit: value.unit,
        filterable: attribute.filterable,
        scope: variantId ? "variant" : "product",
        record_id: recordId,
        variant_id: variantId,
      })
    }
  }
  return [...rows.values()]
}

async function restore(service: CatalogAttributesModuleService, snapshot: Snapshot) {
  const currentAttributes = await service.listCatalogAttributes({ record_id: snapshot.record_id }, { take: 10000 })
  if (currentAttributes.length) await service.deleteCatalogAttributes(currentAttributes.map((row) => row.id))
  const currentVariants = await service.listCatalogVariants({ record_id: snapshot.record_id }, { take: 10000 })
  const previousIds = new Set(snapshot.variants.map((variant) => variant.id))
  const createdVariants = currentVariants.filter((variant) => !previousIds.has(variant.id))
  if (createdVariants.length) await service.deleteCatalogVariants(createdVariants.map((variant) => variant.id))
  if (!snapshot.record) {
    await service.deleteCatalogRecords(snapshot.record_id)
    return
  }
  await service.updateCatalogRecords(snapshot.record)
  if (snapshot.variants.length) await service.updateCatalogVariants(snapshot.variants)
  if (snapshot.attributes.length) await service.createCatalogAttributes(snapshot.attributes)
}

export const upsertCatalogAttributesStep = createStep(
  "upsert-catalog-attributes",
  async (input: CatalogAttributesInput, { container }) => {
    if (!input.source_product_id || !input.product_id || !input.variants.length) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Catalog source product, product and variants are required")
    }
    const variantIds = input.variants.map((variant) => variant.source_variant_id)
    if (new Set(variantIds).size !== variantIds.length) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Duplicate source variant IDs")
    }
    const service = container.resolve<CatalogAttributesModuleService>(CATALOG_ATTRIBUTES_MODULE)
    const [previous] = await service.listCatalogRecords({ source_product_id: input.source_product_id })
    const recordId = previous?.id || stableId("catrec", input.source_product_id)
    const oldVariants = previous
      ? await service.listCatalogVariants({ record_id: recordId }, { take: 10000 })
      : []
    const oldAttributes = previous
      ? await service.listCatalogAttributes({ record_id: recordId }, { take: 10000 })
      : []
    if (oldVariants.some((variant) => !variant.source_variant_id || !variantIds.includes(variant.source_variant_id))) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Import would omit an existing source variant; explicit reconciliation is required"
      )
    }
    const snapshot: Snapshot = {
      record_id: recordId,
      record: previous ? {
        id: previous.id,
        source_product_id: previous.source_product_id,
        source_hash: previous.source_hash,
        source_data: previous.source_data,
        searchable_text: previous.searchable_text,
        attributes: previous.attributes,
      } : null,
      variants: oldVariants.map((variant) => ({
        id: variant.id,
        source_variant_id: variant.source_variant_id,
        source_data: variant.source_data,
        attributes: variant.attributes,
        record_id: variant.record_id,
      })),
      attributes: oldAttributes.map((row) => ({
        id: row.id, key: row.key, label: row.label, raw_value: row.raw_value,
        value: row.value, normalized_value: row.normalized_value, type: row.type,
        numeric_value: row.numeric_value, unit: row.unit, filterable: row.filterable,
        scope: row.scope, record_id: row.record_id, variant_id: row.variant_id,
      })),
    }
    const links: Record<string, Record<string, string>>[] = []
    const record: RecordData = {
      id: recordId,
      source_product_id: input.source_product_id,
      source_hash: input.source_hash,
      source_data: input.source_data,
      searchable_text: input.searchable_text,
      attributes: publicAttributes(input.attributes),
    }
    // Validate ownership before any writes. An existing source variant must never
    // be moved between source products by an ambiguous CSV grouping.
    const existingVariants = await service.listCatalogVariants({ source_variant_id: variantIds }, { take: 10000 })
    if (existingVariants.some((variant) => variant.record_id !== recordId)) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Source variant belongs to another source product")
    }
    try {
      if (previous) await service.updateCatalogRecords(record)
      else {
        await service.createCatalogRecords(record)
        links.push({
          [Modules.PRODUCT]: { product_id: input.product_id },
          [CATALOG_ATTRIBUTES_MODULE]: { catalog_record_id: recordId },
        })
      }
      const rows = attributeRows(recordId, null, input.attributes)
      for (const variant of input.variants) {
        const existing = existingVariants.find((item) => item.source_variant_id === variant.source_variant_id)
        const variantId = existing?.id || stableId("catvar", variant.source_variant_id)
        const data: VariantData = {
          id: variantId,
          source_variant_id: variant.source_variant_id,
          source_data: variant.source_data,
          attributes: publicAttributes(variant.attributes),
          record_id: recordId,
        }
        if (existing) await service.updateCatalogVariants(data)
        else {
          await service.createCatalogVariants(data)
          links.push({
            [Modules.PRODUCT]: { product_variant_id: variant.variant_id },
            [CATALOG_ATTRIBUTES_MODULE]: { catalog_variant_id: variantId },
          })
        }
        rows.push(...attributeRows(recordId, variantId, variant.attributes))
      }
      const previousIds = new Set(oldAttributes.map((row) => row.id))
      const nextIds = new Set(rows.map((row) => row.id))
      const create = rows.filter((row) => !previousIds.has(row.id))
      const update = rows.filter((row) => previousIds.has(row.id))
      const remove = oldAttributes.filter((row) => !nextIds.has(row.id))
      if (create.length) await service.createCatalogAttributes(create)
      if (update.length) await service.updateCatalogAttributes(update)
      if (remove.length) await service.deleteCatalogAttributes(remove.map((row) => row.id))
      return new StepResponse({ record_id: recordId, attribute_values: rows.length, links }, snapshot)
    } catch (error) {
      // A failed step has not yet returned its compensation payload to the engine.
      // Restore its own partial writes, then let the outer workflow compensate.
      await restore(service, snapshot)
      throw error
    }
  },
  async (snapshot, { container }) => {
    if (!snapshot) return
    const service = container.resolve<CatalogAttributesModuleService>(CATALOG_ATTRIBUTES_MODULE)
    await restore(service, snapshot)
  }
)

export const upsertCatalogAttributesWorkflow = createWorkflow(
  "upsert-catalog-attributes",
  function (input: CatalogAttributesInput) {
    const result = upsertCatalogAttributesStep(input)
    const links = transform(result, (data) => data.links)
    createRemoteLinkStep(links)
    return new WorkflowResponse(result)
  }
)
