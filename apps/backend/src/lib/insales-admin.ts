import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import path from "node:path"
import { MedusaError } from "@medusajs/framework/utils"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import { buildInsalesPlan, parseTsv, type InsalesProduct, type NavigationNode, type SourceRow } from "./insales"
import { CATALOG_ATTRIBUTES_MODULE } from "../modules/catalog-attributes"
import CatalogAttributesModuleService from "../modules/catalog-attributes/service"

export const INSALES_ROLLBACK_POLICY = "Before applying, a private product/catalog/inventory preimage is stored with this job. Each product runs through a compensating workflow. Completed products are retained on a later error; resume skips journaled products. Existing products update only when their current values still match the previous source snapshot; manual edits, confirmed stock and variant membership changes are conflicts. Cancelling affects only pending work. Whole-database restore is an operator recovery action against an isolated copy, never an automatic rollback over later orders."
export const insalesJobLock = (id: string) => "texno-insales-job-state:" + id

export function describeInsalesError(error: unknown, fallback = "The import stopped. Check the product journal and try again.") {
  function message(value: unknown, depth: number): string | undefined {
    if (depth > 5) return
    if (typeof value === "string") {
      const clean = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 300)
      return clean && clean !== "[object Object]" ? clean : undefined
    }
    if (Array.isArray(value)) {
      for (const item of value.slice(0, 5)) {
        const text = message(item, depth + 1)
        if (text) return text
      }
    } else if (value && typeof value === "object") {
      const detail = value as Record<string, unknown>
      for (const key of ["message", "error", "cause", "errors", "innerError"]) {
        const text = message(detail[key], depth + 1)
        if (text) return text
      }
    }
  }
  return message(error, 0) ?? fallback
}

function navigationSource() { return JSON.parse(readFileSync(path.resolve(__dirname, "../scripts/data/catalog-navigation.json"), "utf8")) as NavigationNode[] }

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`).join(",")}}`
  return JSON.stringify(value)
}

function sourceValues(product: InsalesProduct) {
  // Row numbers are diagnostics. Adding or reordering unrelated CSV rows
  // cannot make a previously imported product eligible for a write. JSONB
  // can also change column order, which has no meaning in the source rows.
  return stable(product.privateRaw.rows)
}

export async function classifyInsalesChange(container: MedusaContainer, incoming: InsalesProduct, current?: { id: string; status: string; metadata?: Record<string, unknown> | null }) {
  if (!current) return { action: "create" as const }
  const incomingHash = createHash("sha256").update(JSON.stringify(incoming)).digest("hex")
  if (current.metadata?.insales_record_hash === incomingHash && current.status === "published") return { action: "unchanged" as const }
  const conflict = (reason: string) => ({ action: "conflict" as const, reason })
  if (current.metadata?.is_catalog_example === true && current.metadata?.catalog_manual_override !== true) return { action: "update" as const }
  if (current.status !== "published") return conflict("Current publication is administrator-owned")
  const catalog = container.resolve<CatalogAttributesModuleService>(CATALOG_ATTRIBUTES_MODULE)
  const records = await catalog.listCatalogRecords({ source_product_id: incoming.sourceProductId }, { take: 1 })
  const record = records[0]
  const rows = record?.source_data?.rows
  if (!Array.isArray(rows) || !rows.length) return conflict("Previous source snapshot unavailable")
  let previous: InsalesProduct | undefined
  try { previous = buildInsalesPlan(rows as SourceRow[], navigationSource()).products[0] } catch { return conflict("Previous source snapshot cannot be validated") }
  if (previous && Array.isArray(record.source_data.csvRecords)) previous.privateRaw.csvRecords = record.source_data.csvRecords as number[]
  // JSONB preserves values, not object key insertion order; compare the recorded
  // import hash instead of rehashing reconstructed private rows.
  if (!previous || record.source_hash !== current.metadata?.insales_record_hash) return conflict("Previous source baseline hash does not match")
  if (sourceValues(previous) === sourceValues(incoming)) return { action: "unchanged" as const }
  if (current.metadata?.catalog_manual_override === true) return conflict("Current CMS fields are administrator-owned")
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "product", filters: { id: current.id }, fields: ["id", "title", "description", "thumbnail", "images.url", "categories.handle", "variants.id", "variants.title", "variants.sku", "variants.metadata", "variants.manage_inventory", "variants.allow_backorder", "variants.price_set.prices.*", "variants.inventory_items.inventory.location_levels.*"] })
  const product = data[0]
  if (!product) return conflict("Product no longer exists")
  const description = [previous.description, previous.additionalDescription].filter(Boolean).join("\n\n")
  if (product.title !== previous.title || (product.description || "") !== description || product.thumbnail !== (previous.imageUrls[0] ?? null)) return conflict("Title, description or primary image has changed in Admin")
  if (stable((product.images ?? []).map((image) => image.url).sort()) !== stable([...previous.imageUrls].sort())) return conflict("Product media has changed in Admin")
  if (stable((product.categories ?? []).flatMap((category) => category ? [category.handle] : []).sort()) !== stable([...previous.categoryHandles].sort())) return conflict("Category assignments have changed in Admin")
  const attributesByCode = (attributes: { key: string }[]) => [...attributes].sort((left, right) => left.key.localeCompare(right.key))
  if (stable(attributesByCode(record.attributes)) !== stable(attributesByCode(previous.attributes.filter((attribute) => attribute.public && !attribute.label.startsWith("__"))))) return conflict("Catalog attributes have changed in CMS")
  if (incoming.variants.length !== previous.variants.length || incoming.variants.some((variant) => !previous!.variants.some((old) => old.sourceVariantId === variant.sourceVariantId))) return conflict("Variant membership changed; review variants before source reconciliation")
  if (product.variants?.length !== previous.variants.length) return conflict("Variants have changed in Admin")
  const basePrices: Record<string, { id: string; amount: number }> = Object.create(null)
  for (const old of previous.variants) {
    const variant = product.variants?.find((entry) => entry.metadata?.insales_variant_id === old.sourceVariantId)
    if (!variant || !variant.manage_inventory || variant.allow_backorder || variant.metadata?.catalog_stock_confirmed === true || variant.sku !== old.sku || variant.title !== (old.color || previous.title)) return conflict("Variant fields or confirmed stock are administrator-owned")
    if (incoming.variants.find((entry) => entry.sourceVariantId === old.sourceVariantId)?.color !== old.color) return conflict("Variant options changed; review options before source reconciliation")
    const prices = variant.price_set?.prices?.flatMap((price) => price && !price.price_list_id && !price.deleted_at ? [price] : []) ?? []
    const base = prices[0]
    // Medusa replaces omitted base-price rows in its variant price-set update.
    // Only the single source-owned, unrestricted RUB row is eligible.
    if (prices.length !== 1 || !base?.id || base.currency_code !== "rub" || base.rules_count || base.min_quantity != null || base.max_quantity != null || Number(base.amount) !== old.price) return conflict("Base prices have changed or contain administrator-owned prices")
    basePrices[old.sourceVariantId] = { id: base.id, amount: Number(base.amount) }
    const levels = variant.inventory_items?.flatMap((item) => item?.inventory?.location_levels ?? []) ?? []
    if (levels.length !== 1 || Number(levels[0]?.stocked_quantity) !== (old.stock ?? 0) || Number(levels[0]?.reserved_quantity) !== 0) return conflict("Inventory changed or is reserved; current stock is preserved")
  }
  return { action: "update" as const, basePrices }
}

export function parseAdminInsalesUpload(base64: string) {
  const bytes = Buffer.from(base64, "base64")
  if (!bytes.length || bytes.length > 20 * 1024 * 1024 || bytes.toString("base64") !== base64) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Expected a canonical base64 CSV upload, at most 20 MB")
  if (bytes[0] !== 0xff || bytes[1] !== 0xfe) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Expected the original UTF-16LE/TAB InSales CSV (BOM FF FE)")
  const navigation = navigationSource()
  try {
    return buildInsalesPlan(parseTsv(bytes.toString("utf16le")), navigation, createHash("sha256").update(bytes).digest("hex"))
  } catch (error) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, error instanceof Error ? error.message : String(error))
  }
}

export function publicImportJob(job: { [key: string]: unknown }): Record<string, unknown> {
  const { source_base64: _source, source: _relation, backup: _backup, ...publicJob } = job
  return { ...publicJob, backup_available: Boolean(job.has_backup || job.backup), rollback_policy: INSALES_ROLLBACK_POLICY }
}
