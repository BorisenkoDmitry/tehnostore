import type { ExecArgs, MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { getCatalogProfile } from "../lib/catalog-cms"
import { INSALES_SALE_TITLE, listInsalesPriceRows, migrateInsalesSalePrices, type ImportedSale } from "../workflows/migrate-insales-sale-prices"

const PAGE_SIZE = 100

type SourcePrice = { source_variant_id: string; price: number; old_price: number | null }
type Candidate = ImportedSale & { product_id: string; title: string }

async function collectCandidates(container: MedusaContainer, scope: string) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const pricing = container.resolve(Modules.PRICING)
  const rows: Candidate[] = []
  let skipped = 0
  for (let skip = 0; ; skip += PAGE_SIZE) {
    const { data: products } = await query.graph({
      entity: "product",
      fields: ["id", "title", "metadata", "catalog_record.source_data", "variants.id", "variants.metadata", "variants.price_set.id"],
      filters: { status: "published" },
      pagination: { skip, take: PAGE_SIZE, order: { id: "ASC" } },
    })
    const candidates = products.flatMap((product) => {
      if (product.metadata?.catalog_scope !== scope || !product.metadata?.insales_product_id) return []
      const snapshot = product.catalog_record?.source_data?.old_prices
      const source = new Map(Array.isArray(snapshot) ? (snapshot as SourcePrice[]).map((row) => [row.source_variant_id, row]) : [])
      return (product.variants ?? []).flatMap((variant) => {
        const original = variant?.metadata?.insales_old_price_rub
        if (typeof original !== "number" || !Number.isFinite(original) || original <= 0) return []
        const sourcePrice = source.get(String(variant?.metadata?.insales_variant_id ?? ""))
        if (!variant?.price_set?.id || !sourcePrice || sourcePrice.old_price !== original ||
          !Number.isFinite(sourcePrice.price) || sourcePrice.price <= 0 || original <= sourcePrice.price) {
          skipped++
          return []
        }
        return [{
          product_id: product.id, title: product.title, variant_id: variant.id, price_set_id: variant.price_set.id,
          original, current: sourcePrice.price,
        }]
      })
    })
    if (candidates.length) {
      const prices = await listInsalesPriceRows(pricing, candidates)
      for (const candidate of candidates) {
        const matched = prices.filter((price) => price.price_set_id === candidate.price_set_id)
        const [base] = matched
        if (matched.length !== 1 || base.price_list_id || base.currency_code !== "rub" || base.rules_count ||
          base.min_quantity != null || base.max_quantity != null || Number(base.amount) !== candidate.current) {
          skipped++
          continue
        }
        rows.push({ ...candidate, price_id: base.id })
      }
    }
    if (products.length < PAGE_SIZE) break
  }
  return { rows, skipped }
}

export default async function migrate({ container, args }: ExecArgs) {
  const apply = args[0] === "apply"
  const limit = args[1] ? Number(args[1]) : undefined
  if ((args[0] && !["preview", "apply"].includes(args[0])) ||
    (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1)) || args.length > 2) {
    throw new Error("Usage: medusa exec ./src/scripts/migrate-insales-sale-prices.ts [preview|apply] [limit]")
  }
  const database = new URL(process.env.DATABASE_URL!)
  if (apply && (!["postgres", "localhost", "127.0.0.1"].includes(database.hostname) ||
    !["/texno_medusa", "/texno_variations_qa_20261107"].includes(database.pathname))) {
    throw new Error("Price migration is restricted to the local Texno databases")
  }
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  await container.resolve(Modules.LOCKING).execute("texno-insales-import-write", async () => {
    const profile = await getCatalogProfile(container)
    if (profile.currency_code !== "rub") throw new Error("The catalog must use RUB")
    const { rows, skipped } = await collectCandidates(container, profile.scope)
    const selected = rows.slice(0, limit)
    const ids = [...new Set(selected.map((row) => row.product_id))]
    logger.info(JSON.stringify({
      apply, products: ids.length, variants: selected.length, skipped,
      examples: selected.slice(0, 5).map(({ title, current, original }) => ({ title, current, original })),
    }))
    if (!apply || !selected.length) return

    const pricing = container.resolve(Modules.PRICING)
    const lists = await pricing.listPriceLists({ q: INSALES_SALE_TITLE })
    if (lists.some((list) => list.title === INSALES_SALE_TITLE)) {
      throw new Error("The InSales sale list already exists. Review remaining candidates before a second migration.")
    }
    const { result } = await migrateInsalesSalePrices(container).run({
      input: { rows: selected, region_id: profile.region_id },
    })
    logger.info(`Migrated ${selected.length} prices to ${result[0].id}`)
    const search = container.resolve(Modules.SEARCH)
    for (let offset = 0; offset < ids.length; offset += PAGE_SIZE) {
      await search.ingest({ name: "product.updated", data: ids.slice(offset, offset + PAGE_SIZE).map((id) => ({ id })) } as never)
    }
  }, { timeout: 10, expire: 300 })
}
