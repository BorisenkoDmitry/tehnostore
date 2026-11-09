import { createHash } from "node:crypto"
import { appendFileSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import type { CreateProductWorkflowInputDTO, ExecArgs, MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules, ProductStatus } from "@medusajs/framework/utils"
import { createProductCategoriesWorkflow, createStockLocationsWorkflow } from "@medusajs/medusa/core-flows"
import { loadInsalesPlan, publicDryRunReport, type InsalesAttribute, type NavigationNode } from "../lib/insales"
import { importInsalesProductWorkflow } from "../workflows/import-insales-product"
import { classifyInsalesChange, describeInsalesError } from "../lib/insales-admin"
import { getCatalogProfile } from "../lib/catalog-cms"
import { snapshotLegacyConfigurationAttributes } from "../lib/product-configurations"
import { CATALOG_ATTRIBUTES_MODULE } from "../modules/catalog-attributes"
import type CatalogAttributesModuleService from "../modules/catalog-attributes/service"

/** Local-only, source-ID mapped importer. Dry run by default; INSALES_APPLY=1 writes. */
export default async function importInsales({ container }: ExecArgs) {
  return runInsalesImport(container)
}

export type InsalesImportOptions = {
  sourcePath?: string
  reportPath?: string
  journalPath?: string
  apply?: boolean
  backupVerified?: boolean
  plan?: ReturnType<typeof loadInsalesPlan>
  limit?: number
  completedSourceIds?: string[]
  signal?: AbortSignal
  onProgress?: (entry: { source_product_id: string; product_id?: string; status: string; error?: string }) => Promise<void>
}

export async function runInsalesImport(container: MedusaContainer, options: InsalesImportOptions = {}) {
  return container.resolve(Modules.LOCKING).execute("texno-insales-import-write", (signal) => executeInsalesImport(container, {
    ...options, signal: options.signal && signal ? AbortSignal.any([options.signal, signal]) : options.signal ?? signal,
  }), { timeout: 5, expire: 60 })
}

async function executeInsalesImport(container: MedusaContainer, options: InsalesImportOptions) {
  const db = new URL(process.env.DATABASE_URL!)
  if (!["postgres", "localhost", "127.0.0.1"].includes(db.hostname) || db.pathname !== "/texno_medusa") throw new Error("Importer is restricted to the local texno_medusa database")
  const sourcePath = options.sourcePath || process.env.INSALES_CSV || "/tmp/insales-source.csv"
  const reportPath = options.reportPath || process.env.INSALES_REPORT || "/tmp/insales-import-report.json"
  const journalPath = options.journalPath || process.env.INSALES_JOURNAL || "/tmp/insales-import-journal.jsonl"
  const plan = options.plan || loadInsalesPlan({ sourcePath, navigationPath: path.join(__dirname, "data/catalog-navigation.json"), comparisonPath: process.env.INSALES_COMPARISON })
  writeFileSync(reportPath, JSON.stringify(publicDryRunReport(plan), null, 2))
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  logger.info(JSON.stringify(plan.summary))
  if (!(options.apply ?? process.env.INSALES_APPLY === "1")) return publicDryRunReport(plan)
  // Verify the real local archive against its recorded isolated restore check.
  let backupHash = "per-run-private-snapshot"
  if (!options.backupVerified) {
    const backupManifest = JSON.parse(readFileSync(process.env.INSALES_BACKUP_MANIFEST || "/tmp/insales-backup-manifest.json", "utf8"))
    const backupBytes = readFileSync(process.env.INSALES_BACKUP_FILE || "/tmp/texno-before-insales.dump")
    backupHash = createHash("sha256").update(backupBytes).digest("hex")
    if (!backupManifest.restore_verified || backupManifest.database !== "texno_medusa" || backupManifest.sha256 !== backupHash || backupManifest.bytes !== backupBytes.length || process.env.INSALES_BACKUP_SHA256 !== backupHash) throw new Error("Verified pre-import archive/restore manifest mismatch")
  }
  {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const catalogProfile = await getCatalogProfile(container)
    const definitions = await container.resolve<CatalogAttributesModuleService>(CATALOG_ATTRIBUTES_MODULE).listCatalogDefinitions({}, { take: 1000 })
    const { data: existing } = await query.graph({ entity: "product", fields: ["id", "handle", "status", "metadata", "variants.id", "variants.sku", "variants.metadata", "variants.options.value", "options.id", "options.title", "options.values.value"], pagination: { take: 10000 } })
    const sourceMap = new Map<string, typeof existing[number]>()
    for (const product of existing) {
      const sourceId = String(product.metadata?.insales_product_id ?? product.metadata?.catalog_source_id ?? "")
      if (!sourceId) continue
      if (product.metadata?.catalog_scope !== "texno") throw new Error(`Source mapping outside TEXNO scope: ${sourceId}`)
      if (sourceMap.has(sourceId)) throw new Error(`Ambiguous existing source ID: ${sourceId}`)
      sourceMap.set(sourceId, product)
    }
    // Preflight every mapping before categories or products are changed.
    for (const product of plan.products) {
      const current = sourceMap.get(product.sourceProductId)
      const collision = existing.find((item) => item.handle === product.handle && item.id !== current?.id)
      if (collision) throw new Error(`Handle conflict: ${product.handle}`)
      if (current && current.metadata?.is_catalog_example !== true && current.metadata?.insales_product_id !== product.sourceProductId) throw new Error(`Unowned existing mapping ${product.sourceProductId}`)
      if (current?.metadata?.is_catalog_example === true && (current.variants?.length !== 1 || product.variants.length !== 1)) throw new Error(`Ambiguous demo variant mapping ${product.sourceProductId}`)
      if (current && current.metadata?.is_catalog_example !== true) {
        const ids = current.variants?.map((item) => String(item.metadata?.insales_variant_id ?? "")) ?? []
        // Membership changes are per-product conflicts, never destructive reconciliation.
        if (ids.length !== product.variants.length || product.variants.some((item) => !ids.includes(item.sourceVariantId))) continue
      }
    }
    const { data: stores } = await query.graph({ entity: "store", fields: ["id", "default_sales_channel_id"] })
    const { data: profiles } = await query.graph({ entity: "shipping_profile", fields: ["id", "type"] })
    const channel = stores[0]?.default_sales_channel_id
    const profile = profiles.find((item) => item.type === "default")
    if (!channel || !profile) throw new Error("Default sales channel/shipping profile missing")
    const navigation = JSON.parse(readFileSync(path.join(__dirname, "data/catalog-navigation.json"), "utf8")) as NavigationNode[]
    const nodes = new Map(navigation.filter((item) => item.visible).map((item) => [item.href.replace(/^\/collection\//, ""), item]))
    const usedHandles = new Set(plan.products.flatMap((item) => item.categoryHandles))
    const { data: categories } = await query.graph({ entity: "product_category", fields: ["id", "handle", "metadata"], pagination: { take: 1000 } })
    const categoryMap = new Map(categories.map((item) => [item.handle, item.id]))
    for (const category of categories) if (usedHandles.has(category.handle) && category.metadata?.catalog_scope !== "texno") throw new Error(`Foreign category collision ${category.handle}`)
    for (const handle of usedHandles) if (!nodes.has(handle)) throw new Error(`Category outside current menu ${handle}`)
    let createdCategories = 0
    const ensureCategory = async (handle: string): Promise<string> => {
      if (categoryMap.has(handle)) return categoryMap.get(handle)!
      const node = nodes.get(handle)!
      const parent = node.parent_id ? navigation.find((item) => item.id === node.parent_id) : undefined
      const parentHandle = parent?.href.replace(/^\/collection\//, "")
      const parentId = parentHandle && usedHandles.has(parentHandle) ? await ensureCategory(parentHandle) : null
      const { result } = await createProductCategoriesWorkflow(container).run({ input: { product_categories: [{ name: node.label, handle, parent_category_id: parentId, is_active: true, is_internal: false, metadata: { catalog_scope: "texno", insales_import: true } }] } })
      categoryMap.set(handle, result[0].id)
      createdCategories++
      return result[0].id
    }
    for (const handle of usedHandles) {
      options.signal?.throwIfAborted()
      await ensureCategory(handle)
    }
    const { data: locations } = await query.graph({ entity: "stock_location", fields: ["id", "name"] })
    let locationId = locations.find((item) => item.name === "TEXNO InSales source stock")?.id
    options.signal?.throwIfAborted()
    if (!locationId) locationId = (await createStockLocationsWorkflow(container).run({ input: { locations: [{ name: "TEXNO InSales source stock" }] } })).result[0].id
    const counts = { created: 0, updated: 0, unchanged: 0, conflicts: 0, failed: 0, createdCategories }
    const completedBeforeRun = new Set(options.completedSourceIds ?? [])
    const changedIds = new Set<string>()
    for (const product of plan.products.slice(0, options.limit || Number(process.env.INSALES_LIMIT) || undefined)) {
      options.signal?.throwIfAborted()
      const sourceHash = createHash("sha256").update(JSON.stringify(product)).digest("hex")
      const current = sourceMap.get(product.sourceProductId)
      if (completedBeforeRun.has(product.sourceProductId)) {
        counts.unchanged++
        continue
      }
      if (current?.metadata?.insales_record_hash === sourceHash && current.status === "published") {
        counts.unchanged++
        await options.onProgress?.({ source_product_id: product.sourceProductId, product_id: current?.id, status: "unchanged" })
        continue
      }
      let basePrices: Record<string, { id: string; amount: number }> | undefined
      if (current) {
        const classification = await classifyInsalesChange(container, product, current)
        if (classification.action === "unchanged") {
          counts.unchanged++
          await options.onProgress?.({ source_product_id: product.sourceProductId, product_id: current.id, status: "unchanged" })
          continue
        }
        if (classification.action === "update" && "basePrices" in classification) basePrices = classification.basePrices
        if (classification.action === "conflict") {
          counts.conflicts++
          await options.onProgress?.({ source_product_id: product.sourceProductId, product_id: current.id, status: "conflict", error: classification.reason })
          continue
        }
      }
      const isDemo = current?.metadata?.is_catalog_example === true
      const variantIds: Record<string, string> = Object.create(null)
      if (current) for (const variant of product.variants) {
        const mapped = isDemo ? current.variants?.[0] : current.variants?.find((v) => v.metadata?.insales_variant_id === variant.sourceVariantId)
        if (!mapped) throw new Error(`Missing variant ${variant.sourceVariantId}`)
        variantIds[variant.sourceVariantId] = mapped.id
      }
      const hasColors = product.variants.every((v) => v.color)
      const productOptions = isDemo ? current!.options?.map((option) => ({ id: option.id, title: option.title, values: option.values?.map((v) => v.value) ?? [] })) : hasColors
        ? [{ title: "Цвет", values: [...new Set(product.variants.map((v) => v.color!))] }]
        : [{ title: "Комплектация", values: ["Стандартная"] }]
      const publicAttributes = product.attributes.filter((a) => a.public)
      const variantAttributes = (color: string | null): InsalesAttribute[] => color ? [{ key: "variant_color", label: "Цвет варианта", rawValues: [color], values: [{ value: color, normalized: color.normalize("NFKC").toLowerCase().replace(/ё/g, "е"), numericValue: null, unit: null }], dataType: "text", public: true, filterable: true }] : []
      const payload: CreateProductWorkflowInputDTO = {
        title: product.title, handle: current?.handle ?? product.handle,
        description: [product.description, product.additionalDescription].filter(Boolean).join("\n\n"), status: ProductStatus.DRAFT,
        thumbnail: product.imageUrls[0] ?? null, images: product.imageUrls.map((url) => ({ url })),
        ...(current ? {} : { shipping_profile_id: profile.id, sales_channels: [{ id: channel }] }),
        category_ids: product.categoryHandles.map((handle) => categoryMap.get(handle)!),
        metadata: { ...current?.metadata, catalog_scope: "texno", is_catalog_example: false, catalog_source_id: product.sourceProductId, insales_product_id: product.sourceProductId, insales_record_hash: sourceHash, insales_source_sha256: plan.sourceSha256, catalog_original_price_rub: null, insales_kind: product.kind, insales_brand: product.brand },
        options: productOptions,
        variants: product.variants.map((variant) => ({
          title: variant.color || product.title, sku: variant.sku, manage_inventory: true, allow_backorder: false,
          metadata: { ...current?.variants?.find((entry) => entry.id === variantIds[variant.sourceVariantId])?.metadata, insales_variant_id: variant.sourceVariantId, insales_stock_known: variant.stock !== null, insales_old_price_rub: variant.oldPrice !== null && variant.oldPrice > variant.price ? variant.oldPrice : null },
          options: current ? Object.fromEntries((current.options ?? []).map((option) => [option.title, option.title === "Цвет" && variant.color ? variant.color : option.values?.[0]?.value ?? "Default"])) : hasColors ? { "Цвет": variant.color! } : { "Комплектация": "Стандартная" },
          ...(basePrices?.[variant.sourceVariantId] ? {} : { prices: [{ currency_code: "rub", amount: variant.price }] }),
        })),
      }
      try {
        const axes = catalogProfile.product_types.find((type) => type.code === product.kind)?.variant_axes ?? []
        const { result, errors } = await importInsalesProductWorkflow(container).run({ throwOnError: false, input: {
          product: payload, existing_id: current?.id, existing_variant_ids: variantIds, location_id: locationId,
          legacy_configuration: snapshotLegacyConfigurationAttributes(product.attributes, axes, definitions),
          existing_price_updates: basePrices ? product.variants.flatMap((variant) => {
            const price = basePrices[variant.sourceVariantId]
            return price.amount === variant.price ? [] : [{ variant_id: variantIds[variant.sourceVariantId], price_id: price.id, previous_amount: price.amount, amount: variant.price }]
          }) : undefined,
          stocks: Object.fromEntries(product.variants.map((v) => [v.sourceVariantId, v.stock])),
          variant_image_urls: product.variants.map((variant) => ({ source_variant_id: variant.sourceVariantId, image_urls: variant.imageUrls })),
          attributes: { source_product_id: product.sourceProductId, source_hash: sourceHash, source_data: { ...product.privateRaw, source_sha256: plan.sourceSha256, original_description_html: product.privateRaw.rows.map((row) => row["Описание"]), old_prices: product.variants.map((v) => ({ source_variant_id: v.sourceVariantId, price: v.price, old_price: v.oldPrice })) }, attributes: product.attributes, searchable_text: publicAttributes.flatMap((a) => [a.label, ...a.values.map((v) => v.value)]).join(" "), variants: product.variants.map((v) => ({ source_variant_id: v.sourceVariantId, source_data: { ...v.privateRaw }, attributes: variantAttributes(v.color) })) },
        } })
        if (errors.length || !result?.[0]?.id) throw new Error(describeInsalesError(errors, "The product workflow failed and attempted compensation"))
        changedIds.add(result[0].id)
        counts[current ? "updated" : "created"]++
        await options.onProgress?.({ source_product_id: product.sourceProductId, product_id: result[0].id, status: "completed" })
        appendFileSync(journalPath, JSON.stringify({ time: new Date().toISOString(), source_sha256: plan.sourceSha256, source_product_id: product.sourceProductId, product_id: result[0].id, source_hash: sourceHash, status: "completed" }) + "\n")
        if ((counts.created + counts.updated) % 25 === 0) logger.info(`InSales progress ${JSON.stringify(counts)}`)
      } catch (error) {
        counts.failed++
        const message = describeInsalesError(error)
        await options.onProgress?.({ source_product_id: product.sourceProductId, status: "failed", error: message })
        appendFileSync(journalPath, JSON.stringify({ time: new Date().toISOString(), source_product_id: product.sourceProductId, status: "failed", error: message }) + "\n")
        throw error
      }
    }
    const importedIds = [...sourceMap.values()].filter((p) => plan.products.some((s) => s.sourceProductId === String(p.metadata?.insales_product_id ?? p.metadata?.catalog_source_id))).map((p) => p.id)
    options.signal?.throwIfAborted()
    if (changedIds.size) await container.resolve(Modules.SEARCH).ingest({ name: "product.updated", data: [...changedIds].map((id) => ({ id })) } as never)
    const report = { ...publicDryRunReport(plan), complete: counts.created + counts.updated + counts.unchanged === plan.products.length && !counts.conflicts, execution: counts, indexed: changedIds.size, previousMapped: importedIds.length, backup_sha256: backupHash }
    writeFileSync(reportPath, JSON.stringify(report, null, 2))
    logger.info(`InSales completed ${JSON.stringify(counts)}`)
    return report
  }
}
