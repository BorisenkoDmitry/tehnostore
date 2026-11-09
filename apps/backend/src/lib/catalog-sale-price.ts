import { PriceListType } from "@medusajs/framework/utils"

export type CatalogCalculatedPrice = {
  calculated_amount?: number | null
  original_amount?: number | null
  currency_code?: string | null
  calculated_price?: { price_list_type?: string | null } | null
}

export function saleOriginalPrice(price?: CatalogCalculatedPrice | null) {
  const amount = price?.calculated_amount
  const original = price?.original_amount
  return price?.calculated_price?.price_list_type === PriceListType.SALE &&
    typeof amount === "number" && typeof original === "number" && original > amount
    ? original
    : null
}

export function catalogComparisonPrice(metadata: Record<string, unknown> | null | undefined, currency: string) {
  const amount = metadata?.catalog_old_price_currency === currency
    ? metadata.catalog_old_price
    : currency === "rub" ? metadata?.catalog_old_price_rub : null
  return typeof amount === "number" ? amount : null
}
