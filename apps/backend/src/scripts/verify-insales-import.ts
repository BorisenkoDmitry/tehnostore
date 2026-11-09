/** Read-only, independent post-import verification. Does not mutate commerce data. */
import { readFileSync, writeFileSync } from "node:fs"
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import { loadInsalesPlan } from "../lib/insales"
import { CATALOG_ATTRIBUTES_MODULE } from "../modules/catalog-attributes"
import type CatalogAttributesModuleService from "../modules/catalog-attributes/service"
import type { CatalogAttributeInput } from "../modules/catalog-attributes/types"

type BeforeProduct = {
  id: string
  handle: string
  title: string
  description: string | null
  status: string
  thumbnail: string | null
  updated_at: string
  metadata: Record<string, unknown> | null
}
type Audit = {
  source_sha256: string
  products: { source_product_id: string; source_variant_ids: string[] }[]
  excluded: { source_product_id: string }[]
  database_before_products: BeforeProduct[]
}
type VariantCheck = {
  id: string
  sku: string | null
  metadata: Record<string, unknown> | null
  manage_inventory: boolean
  allow_backorder: boolean
  prices: { amount: number; currency_code: string; price_list_id?: string | null }[]
  catalog_variant?: { id: string; source_variant_id: string } | null
  inventory_items?: {
    inventory_item_id: string
    inventory?: { location_levels?: { stocked_quantity: number; reserved_quantity: number }[] }
  }[]
}
type ProductCheck = Omit<BeforeProduct, "updated_at"> & {
  updated_at: string | Date
  variants: VariantCheck[]
  categories: { handle: string }[]
  catalog_record?: { id: string; source_product_id: string } | null
}

type ExplicitProductImage = {
  id: string
  url: string
  product_id: string
  variants?: { id: string }[]
}
type ProductImageReader = {
  listProductImages(filters: { product_id: string[] }, config: { take: number; skip: number; relations: string[] }): Promise<ExplicitProductImage[]>
}

// Independently specified customer-facing source facts; all other __ fields
// remain private even if a future parser accidentally marks them public.
const publicSourceAliases = {
  "__Гарантия": "Гарантия",
  "__Производство": "Производство",
  "__Аксессуар для": "Совместимость с устройством",
  "__Тип аксессуара": "Тип аксессуара",
}

const privateMetadataKey = /(?:source_data|private|raw|cost|себестоимость|наложка|^__)/i

function privateKeys(value: unknown, path = "metadata"): string[] {
  if (!value || typeof value !== "object") return []
  return Object.entries(value).flatMap(([key, item]) => [
    ...(privateMetadataKey.test(key) ? [`${path}.${key}`] : []),
    ...privateKeys(item, `${path}.${key}`),
  ])
}

function sortedAttributes(attributes: CatalogAttributeInput[]) {
  return attributes.filter((attribute) => attribute.public && !attribute.label.startsWith("__"))
    .sort((a, b) => a.key.localeCompare(b.key))
}

function attributeValueCount(attributes: CatalogAttributeInput[]) {
  return sortedAttributes(attributes).reduce((sum, attribute) => sum + new Set(attribute.values.map((value) => value.normalized)).size, 0)
}

// PostgreSQL JSONB deliberately does not preserve object property order.
function canonicalJson(value: unknown): string {
  const canonical = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(canonical)
    if (item && typeof item === "object") return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => [key, canonical(nested)]))
    return item
  }
  return JSON.stringify(canonical(value))
}

export default async function verifyInsalesImport({ container }: ExecArgs) {
  const outputPath = process.env.INSALES_VERIFY_REPORT || "/tmp/insales-verification.json"
  const auditPath = process.env.INSALES_AUDIT || "/tmp/independent-audit.json"
  const audit = JSON.parse(readFileSync(auditPath, "utf8")) as Audit
  if (!audit.database_before_products?.length) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Independent pre-import baseline is required")
  const plan = loadInsalesPlan({
    sourcePath: process.env.INSALES_CSV || "/tmp/insales-source.csv",
    navigationPath: process.env.INSALES_NAVIGATION || `${process.cwd()}/src/scripts/data/catalog-navigation.json`,
  })
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const service = container.resolve<CatalogAttributesModuleService>(CATALOG_ATTRIBUTES_MODULE)
  const failures: { code: string; source_product_id?: string; source_variant_id?: string; detail?: unknown }[] = []
  const fail = (code: string, detail?: unknown, sourceProductId?: string, sourceVariantId?: string) => {
    failures.push({ code, source_product_id: sourceProductId, source_variant_id: sourceVariantId, detail })
  }
  if (plan.sourceSha256 !== audit.source_sha256) fail("source_hash_differs_from_independent_audit")
  const expectedIds = new Set(plan.products.map((product) => product.sourceProductId))
  const independentIds = new Set(audit.products.map((product) => product.source_product_id))
  if (expectedIds.size !== independentIds.size || [...expectedIds].some((id) => !independentIds.has(id))) {
    fail("parser_eligibility_differs_from_independent_audit")
  }

  const fields = [
    "id", "handle", "title", "description", "status", "thumbnail", "updated_at", "metadata",
    "categories.handle", "catalog_record.id", "catalog_record.source_product_id",
    "variants.id", "variants.sku", "variants.metadata", "variants.manage_inventory", "variants.allow_backorder",
    "variants.prices.amount", "variants.prices.currency_code", "variants.prices.price_list_id",
    "variants.catalog_variant.id", "variants.catalog_variant.source_variant_id",
    "variants.inventory_items.inventory_item_id", "variants.inventory_items.inventory.location_levels.stocked_quantity",
    "variants.inventory_items.inventory.location_levels.reserved_quantity",
  ]
  const allProducts: ProductCheck[] = []
  for (let skip = 0; ; skip += 200) {
    const { data } = await query.graph({ entity: "product", fields, pagination: { take: 200, skip } })
    allProducts.push(...data as unknown as ProductCheck[])
    if (data.length < 200) break
  }
  const imported = allProducts.filter((product) => product.metadata?.catalog_scope === "texno")
  const imageReader = container.resolve<ProductImageReader>(Modules.PRODUCT)
  const explicitImages: ExplicitProductImage[] = []
  for (let skip = 0; ; skip += 500) {
    // Query the image side of the relation. Variant.images is a computed gallery
    // that includes unassigned shared images and cannot prove explicit links.
    const images = await imageReader.listProductImages(
      { product_id: imported.map((product) => product.id) },
      { take: 500, skip, relations: ["variants"] }
    )
    explicitImages.push(...images)
    if (images.length < 500) break
  }
  const imagesByVariant = new Map<string, ExplicitProductImage[]>()
  for (const image of explicitImages) for (const variant of image.variants || []) {
    imagesByVariant.set(variant.id, [...(imagesByVariant.get(variant.id) || []), image])
  }
  const publicAliasCounts = Object.fromEntries(Object.keys(publicSourceAliases).map((key) => [key, 0]))
  const productsBySource = new Map<string, ProductCheck[]>()
  for (const product of imported) {
    const id = String(product.metadata?.catalog_source_id || "")
    productsBySource.set(id, [...(productsBySource.get(id) || []), product])
    if (!expectedIds.has(id)) fail("unexpected_or_excluded_source_product", { product_id: product.id }, id)
  }

  const records = await service.listCatalogRecords({}, { take: 10000, relations: ["variants"] })
  const recordsBySource = new Map(records.map((record) => [record.source_product_id, record]))
  const [, recordCount] = await service.listAndCountCatalogRecords({}, { take: 1 })
  const [, variantRecordCount] = await service.listAndCountCatalogVariants({}, { take: 1 })
  const [, actualAttributeValueCount] = await service.listAndCountCatalogAttributes({}, { take: 1 })
  let expectedAttributeValues = 0
  let actualVariantCount = 0
  let expectedVariantImageAssociations = 0
  let actualVariantImageAssociations = 0
  const sourceVariantIds = new Set<string>()
  const medusaVariantIds = new Set<string>()
  const productIds = new Set<string>()
  const categoryHandles = new Set<string>()

  for (const expected of plan.products) {
    const matches = productsBySource.get(expected.sourceProductId) || []
    if (matches.length !== 1) {
      fail("source_product_mapping_not_unique", { count: matches.length }, expected.sourceProductId)
      continue
    }
    const product = matches[0]
    if (productIds.has(product.id)) fail("medusa_product_mapped_twice", undefined, expected.sourceProductId)
    productIds.add(product.id)
    if (product.title !== expected.title) fail("title_mismatch", undefined, expected.sourceProductId)
    if (product.status !== "published") fail("product_not_published", product.status, expected.sourceProductId)
    if (product.description !== [expected.description, expected.additionalDescription].filter(Boolean).join("\n\n")) fail("description_mismatch", undefined, expected.sourceProductId)
    if (product.metadata?.is_catalog_example === true) fail("example_flag_not_cleared", undefined, expected.sourceProductId)
    if (product.metadata?.insales_kind !== expected.kind || product.metadata?.insales_brand !== expected.brand) fail("type_or_brand_mismatch", undefined, expected.sourceProductId)
    const leaked = privateKeys(product.metadata)
    if (leaked.length) fail("private_product_metadata", leaked, expected.sourceProductId)
    const actualCategories = product.categories.map((category) => category.handle).sort()
    for (const handle of actualCategories) categoryHandles.add(handle)
    if (JSON.stringify(actualCategories) !== JSON.stringify([...expected.categoryHandles].sort())) {
      fail("category_membership_mismatch", { expected: expected.categoryHandles, actual: actualCategories }, expected.sourceProductId)
    }
    const record = recordsBySource.get(expected.sourceProductId)
    if (!record || product.catalog_record?.id !== record.id || product.catalog_record?.source_product_id !== expected.sourceProductId) {
      fail("missing_or_incorrect_product_module_link", undefined, expected.sourceProductId)
    }
    if (record) {
      if (canonicalJson(sortedAttributes(record.attributes)) !== canonicalJson(sortedAttributes(expected.attributes))) {
        fail("product_attributes_mismatch", undefined, expected.sourceProductId)
      }
      const raw = record.source_data as Record<string, unknown>
      if (canonicalJson(raw.rows) !== canonicalJson(expected.privateRaw.rows) || canonicalJson(raw.csvRecords) !== canonicalJson(expected.privateRaw.csvRecords)) {
        fail("private_product_source_snapshot_mismatch", undefined, expected.sourceProductId)
      }
      if (record.variants.length !== expected.variants.length) fail("private_variant_count_mismatch", undefined, expected.sourceProductId)
      if (record.attributes.some((attribute) => attribute.label.startsWith("__") || /себестоимость|наложка/i.test(attribute.label))) {
        fail("private_control_attribute_exposed", undefined, expected.sourceProductId)
      }
      for (const [sourceLabel, publicLabel] of Object.entries(publicSourceAliases)) {
        const sourceValues = [...new Set(expected.privateRaw.rows.map((row) => row[`Параметр: ${sourceLabel}`]).filter((value) => value?.trim()))]
        const actual = record.attributes.filter((attribute) => attribute.label === publicLabel)
        if (sourceValues.length) {
          publicAliasCounts[sourceLabel]++
          if (actual.length !== 1 || actual[0].public !== true || canonicalJson(actual[0].rawValues) !== canonicalJson(sourceValues)) {
            fail("customer_source_fact_missing_or_changed", { source: sourceLabel, public_label: publicLabel }, expected.sourceProductId)
          }
        } else if (actual.length) fail("customer_source_fact_invented", { public_label: publicLabel }, expected.sourceProductId)
      }
    }
    expectedAttributeValues += attributeValueCount(expected.attributes)
    actualVariantCount += product.variants.length
    if (product.variants.length !== expected.variants.length) fail("commerce_variant_count_mismatch", undefined, expected.sourceProductId)
    for (const expectedVariant of expected.variants) {
      const variantMatches = product.variants.filter((variant) => variant.catalog_variant?.source_variant_id === expectedVariant.sourceVariantId)
      if (variantMatches.length !== 1) {
        fail("source_variant_link_not_unique", { count: variantMatches.length }, expected.sourceProductId, expectedVariant.sourceVariantId)
        continue
      }
      const variant = variantMatches[0]
      const assignedImages = imagesByVariant.get(variant.id) || []
      const assignedUrls = assignedImages.map((image) => image.url).sort()
      const expectedImageUrls = [...expectedVariant.imageUrls].sort()
      expectedVariantImageAssociations += expectedImageUrls.length
      actualVariantImageAssociations += assignedImages.length
      if (canonicalJson(assignedUrls) !== canonicalJson(expectedImageUrls) || assignedImages.some((image) => image.product_id !== product.id)) {
        fail("explicit_variant_image_association_mismatch", { expected_urls: expectedImageUrls, actual_urls: assignedUrls }, expected.sourceProductId, expectedVariant.sourceVariantId)
      }
      if (sourceVariantIds.has(expectedVariant.sourceVariantId) || medusaVariantIds.has(variant.id)) {
        fail("variant_mapped_twice", undefined, expected.sourceProductId, expectedVariant.sourceVariantId)
      }
      sourceVariantIds.add(expectedVariant.sourceVariantId)
      medusaVariantIds.add(variant.id)
      if (variant.sku !== expectedVariant.sku) fail("variant_sku_mismatch", undefined, expected.sourceProductId, expectedVariant.sourceVariantId)
      if (variant.metadata?.insales_variant_id !== expectedVariant.sourceVariantId) fail("variant_metadata_source_id_mismatch", undefined, expected.sourceProductId, expectedVariant.sourceVariantId)
      if (variant.metadata?.insales_stock_known !== (expectedVariant.stock !== null)) fail("variant_stock_known_mismatch", undefined, expected.sourceProductId, expectedVariant.sourceVariantId)
      const expectedOldPrice = expectedVariant.oldPrice !== null && expectedVariant.oldPrice > expectedVariant.price ? expectedVariant.oldPrice : null
      if (variant.metadata?.insales_old_price_rub !== expectedOldPrice) fail("invalid_public_old_price", undefined, expected.sourceProductId, expectedVariant.sourceVariantId)
      if (variant.manage_inventory !== true || variant.allow_backorder !== false) {
        fail("unsafe_inventory_flags", undefined, expected.sourceProductId, expectedVariant.sourceVariantId)
      }
      const inventoryItems = variant.inventory_items || []
      const levels = inventoryItems.flatMap((item) => item.inventory?.location_levels || [])
      const quantity = levels.reduce((sum, level) => sum + Number(level.stocked_quantity), 0)
      if (inventoryItems.length !== 1 || !levels.length || quantity !== (expectedVariant.stock ?? 0)) {
        fail("inventory_quantity_mismatch", { expected: expectedVariant.stock, actual: quantity, items: inventoryItems.length }, expected.sourceProductId, expectedVariant.sourceVariantId)
      }
      const privateVariant = record?.variants.find((entry) => entry.source_variant_id === expectedVariant.sourceVariantId)
      if (!privateVariant || privateVariant.id !== variant.catalog_variant?.id) fail("private_variant_link_mismatch", undefined, expected.sourceProductId, expectedVariant.sourceVariantId)
      if (privateVariant) {
        expectedAttributeValues += attributeValueCount(privateVariant.attributes)
        if (canonicalJson(privateVariant.source_data) !== canonicalJson(expectedVariant.privateRaw)) fail("private_variant_source_snapshot_mismatch", undefined, expected.sourceProductId, expectedVariant.sourceVariantId)
        const colors = privateVariant.attributes.filter((attribute) => attribute.label === "Цвет варианта").flatMap((attribute) => attribute.values.map((value) => value.value))
        if (JSON.stringify(colors) !== JSON.stringify(expectedVariant.color ? [expectedVariant.color] : [])) fail("variant_color_attribute_mismatch", undefined, expected.sourceProductId, expectedVariant.sourceVariantId)
      }
      const variantLeaked = privateKeys(variant.metadata)
      if (variantLeaked.length) fail("private_variant_metadata", variantLeaked, expected.sourceProductId, expectedVariant.sourceVariantId)
      const rubPrices = (variant.prices || []).filter((price) => price.currency_code === "rub" && !price.price_list_id)
      if (rubPrices.length !== 1 || Number(rubPrices[0]?.amount) !== expectedVariant.price) {
        fail("rub_price_mismatch", { expected: expectedVariant.price, actual: rubPrices.map((price) => price.amount) }, expected.sourceProductId, expectedVariant.sourceVariantId)
      }
      if ((variant.prices || []).some((price) => price.currency_code !== "rub")) fail("unexpected_import_currency", undefined, expected.sourceProductId, expectedVariant.sourceVariantId)
    }
  }

  const beforeBySource = audit.database_before_products.filter((product) => product.metadata?.catalog_scope === "texno")
  for (const before of beforeBySource) {
    const sourceId = String(before.metadata?.catalog_source_id || "")
    if (productsBySource.get(sourceId)?.[0]?.id !== before.id) fail("existing_demo_product_id_changed", { before: before.id }, sourceId)
  }
  // Later explicit user instruction authorizes deletion of the four original
  // starter merchandise products. Source-mapped TEXNO demos must retain IDs.
  const removedStarters = audit.database_before_products.filter((product) => product.metadata?.catalog_scope !== "texno")
  const starterRows = await container.resolve(Modules.PRODUCT).listProducts(
    { id: removedStarters.map((product) => product.id) },
    { withDeleted: true }
  )
  for (const before of removedStarters) {
    const after = starterRows.find((product) => product.id === before.id)
    if (!after || !after.deleted_at) { fail("original_starter_not_soft_deleted", { product_id: before.id }); continue }
    if (allProducts.some((product) => product.id === before.id)) fail("original_starter_still_active", { product_id: before.id })
    for (const key of ["handle", "title", "description", "status", "thumbnail", "metadata"] as const) {
      if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) fail("starter_changed_beyond_soft_deletion", { product_id: before.id, field: key })
    }
  }
  if (allProducts.length !== plan.products.length) fail("active_products_include_non_source_assortment", allProducts.length)
  if (recordCount !== plan.products.length) fail("catalog_record_count_mismatch", recordCount)
  if (variantRecordCount !== plan.summary.importedVariants) fail("catalog_variant_count_mismatch", variantRecordCount)
  if (actualAttributeValueCount !== expectedAttributeValues) fail("catalog_attribute_value_count_mismatch", { actual: actualAttributeValueCount, expected: expectedAttributeValues })
  if (actualVariantCount !== plan.summary.importedVariants) fail("total_variant_count_mismatch", actualVariantCount)
  const result = {
    checked_at: new Date().toISOString(), source_sha256: plan.sourceSha256, passed: failures.length === 0,
    products: imported.length, variants: actualVariantCount, catalog_records: recordCount,
    catalog_variant_records: variantRecordCount, attribute_values: actualAttributeValueCount,
    product_parameter_attributes: plan.summary.productAttributes,
    public_customer_source_fact_counts: publicAliasCounts,
    expected_explicit_variant_image_associations: expectedVariantImageAssociations,
    actual_explicit_variant_image_associations: actualVariantImageAssociations,
    category_handles: [...categoryHandles].sort(), soft_deleted_original_starter_products: starterRows.filter((product) => product.deleted_at).length,
    stable_existing_demo_products: beforeBySource.length, failures,
    limitations: ["Inventory is compared to the source snapshot, not current real-world warehouse availability.", "Image URL availability and storefront behavior require separate HTTP/headless checks."],
  }
  writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 })
  container.resolve(ContainerRegistrationKeys.LOGGER).info(`InSales verification: ${result.passed ? "PASS" : "FAIL"}; ${imported.length} products, ${actualVariantCount} variants, ${failures.length} failures; ${outputPath}`)
  if (!result.passed) throw new MedusaError(MedusaError.Types.INVALID_DATA, `Import verification failed (${failures.length}); see ${outputPath}`)
}
