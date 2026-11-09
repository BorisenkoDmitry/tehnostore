import type { SearchTypes } from "@medusajs/framework/types";
import { QueryContext, search } from "@medusajs/framework/utils";
import { catalogComparisonPrice, saleOriginalPrice, type CatalogCalculatedPrice } from "../../lib/catalog-sale-price"

/**
 * The currencies the index holds prices in. Each gets its own set of price
 * fields, so filtering and sorting work per currency. Adding one is a schema
 * change: the module reindexes on the next boot. Keep in sync with the
 * storefront's `SEARCH_PRICE_CURRENCIES`.
 */
export const PRICE_CURRENCIES = ["eur", "usd", "rub"] as const;

export type PriceCurrency = (typeof PRICE_CURRENCIES)[number];

// Read once per currency, since the Pricing Module calculates for a single
// currency per query.
const PRICE_GRAPH_FIELDS = [
  "id",
  "variants.calculated_price.*",
  "variants.metadata",
];

const pricingContext = (currency: PriceCurrency, regionId?: string) => ({
  variants: {
    calculated_price: QueryContext({ currency_code: currency, quantity: 1, ...(regionId ? { region_id: regionId } : {}) }),
  },
});

type PricedVariant = {
  metadata?: Record<string, unknown> | null;
  calculated_price?: CatalogCalculatedPrice | null;
  [key: string]: unknown;
} | null;

/** A product's priced variants per currency, as `loadPricing` reads them. */
export type ProductPricingRows = Partial<
  Record<PriceCurrency, PricedVariant[] | null>
>;

type PriceFieldName =
  `${"min_price" | "max_price" | "original_price" | "min_sale_price" | "original_sale_price"}_${PriceCurrency}`;
type OnSaleFieldName = `on_sale_${PriceCurrency}`;

export type ProductPricing = { [K in PriceFieldName]?: number | null } & {
  [K in OnSaleFieldName]?: boolean | null;
};

type PriceFields = {
  [K in PriceFieldName]: ReturnType<typeof search.float>;
} & { [K in OnSaleFieldName]: ReturnType<typeof search.boolean> };

/** The per-currency price fields, to spread into the index schema. */
export const priceFields = Object.fromEntries(
  PRICE_CURRENCIES.flatMap((currency) => [
    [
      `min_price_${currency}`,
      search
        .float()
        .filterable()
        .sortable()
        .facetable({ types: ["stats"] })
        .retrievable(),
    ],
    [
      `max_price_${currency}`,
      search
        .float()
        .filterable()
        .sortable()
        .facetable({ types: ["stats"] })
        .retrievable(),
    ],
    [`original_price_${currency}`, search.float().retrievable()],
    [`min_sale_price_${currency}`, search.float().filterable().sortable().facetable({ types: ["stats"] }).retrievable()],
    [`original_sale_price_${currency}`, search.float().retrievable()],
    [
      `on_sale_${currency}`,
      search.boolean().filterable().facetable().retrievable(),
    ],
  ]),
) as PriceFields;

/**
 * One currency's price fields: the cheapest variant's calculated and original
 * price, and the most expensive variant's as the max. Picking one variant for
 * the pair keeps the discount describing a real product rather than mixing
 * two variants' amounts. A product without a price in the currency writes
 * nothing, so it drops out of that currency's price filter and sort.
 */
function toPricing(
  currency: PriceCurrency,
  variants: PricedVariant[] | null | undefined,
): ProductPricing {
  let cheapest: { calculated: number; original: number } | undefined;
  let cheapestSale: { calculated: number; original: number } | undefined;
  let maxPrice: number | undefined;

  for (const variant of variants ?? []) {
    const price = variant?.calculated_price;
    const calculated = price?.calculated_amount;

    if (typeof calculated !== "number") {
      continue;
    }

    const saleOriginal = saleOriginalPrice(price)
    const comparison = catalogComparisonPrice(variant?.metadata, currency)
    const original = saleOriginal ?? Math.max(comparison ?? calculated, calculated)
    if (saleOriginal !== null && (!cheapestSale || calculated < cheapestSale.calculated)) {
      cheapestSale = { calculated, original: saleOriginal }
    }

    if (maxPrice === undefined || calculated > maxPrice) {
      maxPrice = calculated;
    }

    if (!cheapest || calculated < cheapest.calculated) {
      cheapest = { calculated, original };
    }
  }

  if (!cheapest) {
    return {};
  }

  return {
    [`min_price_${currency}`]: cheapest.calculated,
    [`max_price_${currency}`]: maxPrice ?? cheapest.calculated,
    [`original_price_${currency}`]: cheapest.original,
    // Written even when false: "not on sale" is a real facet bucket, unlike a
    // missing value.
    [`on_sale_${currency}`]: Boolean(cheapestSale),
    ...(cheapestSale ? {
      [`min_sale_price_${currency}`]: cheapestSale.calculated,
      [`original_sale_price_${currency}`]: cheapestSale.original,
    } : {}),
  } as ProductPricing;
}

/** Every currency's price fields for one product. */
export function toProductPricing(
  pricingRows: ProductPricingRows | undefined,
): ProductPricing {
  return Object.assign(
    {},
    ...PRICE_CURRENCIES.map((currency) =>
      toPricing(currency, pricingRows?.[currency]),
    ),
  );
}

/**
 * The priced variants of the given products, per currency: one `query.graph`
 * read per currency, however many products there are.
 */
export async function loadPricing(
  ids: string[],
  { container }: SearchTypes.SearchIngestionContext,
  region?: { id: string; currency_code: string },
): Promise<Map<string, ProductPricingRows>> {
  const pricing = new Map<string, ProductPricingRows>();

  if (!ids.length) {
    return pricing;
  }

  await Promise.all(
    PRICE_CURRENCIES.map(async (currency) => {
      const { data } = await container.query.graph({
        entity: "product",
        fields: PRICE_GRAPH_FIELDS,
        filters: { id: ids },
        context: pricingContext(currency, region?.currency_code === currency ? region.id : undefined),
      });

      for (const product of data) {
        const rows = pricing.get(product.id) ?? {};
        rows[currency] = product.variants as PricedVariant[] | null;
        pricing.set(product.id, rows);
      }
    }),
  );

  return pricing;
}
