import type { IPricingModuleService, PriceDTO } from "@medusajs/framework/types"
import { Modules, PriceListStatus, PriceListType } from "@medusajs/framework/utils"
import { createStep, createWorkflow, StepResponse, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { createPriceListsWorkflow } from "@medusajs/medusa/core-flows"

export const INSALES_SALE_TITLE = "Скидки из InSales"

export type ImportedSale = {
  variant_id: string
  price_set_id: string
  price_id: string
  current: number
  original: number
}

type PriceRow = PriceDTO & { price_list_id?: string | null; rules_count?: number }

export async function listInsalesPriceRows(pricing: IPricingModuleService, rows: Pick<ImportedSale, "price_set_id">[]) {
  // The Pricing Module returns these model columns even though PriceDTO omits them.
  return await pricing.listPrices({ price_set_id: rows.map((row) => row.price_set_id) }, { take: null }) as PriceRow[]
}

const setOriginalPrices = createStep(
  "set-insales-original-prices",
  async ({ rows, price_list_id }: { rows: ImportedSale[]; price_list_id: string }, { container }) => {
    const pricing = container.resolve(Modules.PRICING)
    const prices = await listInsalesPriceRows(pricing, rows)
    for (const row of rows) {
      const related = prices.filter((price) => price.price_set_id === row.price_set_id)
      const base = related.find((price) => price.id === row.price_id && !price.price_list_id)
      const sale = related.find((price) => price.price_list_id === price_list_id)
      if (related.length !== 2 || !base || base.currency_code !== "rub" || base.rules_count ||
        base.min_quantity != null || base.max_quantity != null || Number(base.amount) !== row.current ||
        !sale || sale.currency_code !== "rub" || Number(sale.amount) !== row.current) {
        throw new Error(`Price set changed during migration: ${row.price_set_id}`)
      }
    }
    await pricing.upsertPriceSets(rows.map((row) => ({
      id: row.price_set_id,
      prices: [{ id: row.price_id, currency_code: "rub", amount: row.original }],
    })))
    return new StepResponse(rows, rows)
  },
  async (rows, { container }) => {
    if (!rows?.length) return
    const pricing = container.resolve(Modules.PRICING)
    const prices = await listInsalesPriceRows(pricing, rows)
    for (const row of rows) {
      const base = prices.filter((price) => price.price_set_id === row.price_set_id && !price.price_list_id)
      if (base.length !== 1 || base[0].id !== row.price_id || Number(base[0].amount) !== row.original) {
        throw new Error(`Base price changed before rollback: ${row.price_set_id}`)
      }
    }
    await pricing.upsertPriceSets(rows.map((row) => ({
      id: row.price_set_id,
      prices: [{ id: row.price_id, currency_code: "rub", amount: row.current }],
    })))
  },
)

const verifyPrices = createStep(
  "verify-migrated-insales-prices",
  async ({ rows, region_id }: { rows: ImportedSale[]; region_id: string }, { container }) => {
    const prices = await container.resolve(Modules.PRICING).calculatePrices(
      { id: rows.map((row) => row.price_set_id) },
      { context: { currency_code: "rub", region_id, quantity: 1 } },
    )
    const bySet = new Map(prices.map((price) => [price.id, price]))
    for (const row of rows) {
      const price = bySet.get(row.price_set_id)
      if (price?.calculated_amount !== row.current || price.original_amount !== row.original ||
        price.calculated_price?.price_list_type !== PriceListType.SALE) {
        throw new Error(`Effective price changed during migration: ${row.variant_id}`)
      }
    }
  },
)

export const migrateInsalesSalePrices = createWorkflow(
  "migrate-insales-sale-prices",
  function (input: { rows: ImportedSale[]; region_id: string }) {
    // Create the active prices while they still equal the base prices, so
    // raising the base prices cannot briefly raise the customer-facing price.
    const lists = createPriceListsWorkflow.runAsStep({
      input: transform(input, ({ rows }) => ({
        price_lists_data: [{
          title: INSALES_SALE_TITLE,
          description: "Действующие цены распродажи, перенесённые из каталога InSales.",
          type: PriceListType.SALE,
          status: PriceListStatus.ACTIVE,
          prices: rows.map(({ variant_id, current }) => ({ variant_id, amount: current, currency_code: "rub" })),
        }],
      })),
    })
    const updated = setOriginalPrices(transform({ input, lists }, ({ input, lists }) => ({
      rows: input.rows, price_list_id: lists[0].id,
    })))
    verifyPrices(transform({ input, updated }, ({ input, updated }) => ({ rows: updated, region_id: input.region_id })))
    return new WorkflowResponse(lists)
  },
)
