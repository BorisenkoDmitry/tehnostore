import type { SearchTypes } from "@medusajs/framework/types";
import {
  defineSearchIndex,
  graphConsume,
  graphSeed,
  PriceListWorkflowEvents,
  search,
} from "@medusajs/framework/utils";

import { loadPricing, priceFields, toProductPricing } from "./helpers/pricing";
import { resolveProductIds } from "./helpers/resolve-product-ids";
import { canonicalCatalogToken } from "./helpers/catalog-filter-values";
import { libraryFacetNames, variationFacets, type FacetVariant } from "./helpers/variation-facets"
import { libraryVariations } from "../lib/catalog-variation-library"
import { publishedCategoryIds } from "../lib/catalog-hierarchy"

const PRODUCT_GRAPH_FIELDS = [
  "id",
  "title",
  "description",
  "handle",
  "thumbnail",
  "status",
  "created_at",
  "metadata",
  "sales_channels.id",
  "categories.name",
  "categories.id",
  "categories.handle",
  "categories.is_active",
  "categories.is_internal",
  "categories.metadata",
  "tags.value",
  "catalog_record.searchable_text",
  "variants.id",
  "variants.metadata",
  "variants.options.option.title",
  "variants.options.value",
  "variants.catalog_variant.attributes",
];

type ProductRow = {
  id: string;
  title?: string | null;
  description?: string | null;
  handle?: string | null;
  thumbnail?: string | null;
  status?: string | null;
  created_at?: string | Date | null;
  metadata?: Record<string, unknown> | null;
  deleted_at?: string | Date | null;
  sales_channels?: ({ id?: string | null } | null)[] | null;
  categories?: ({ id?: string; name?: string | null; handle?: string | null; is_active?: boolean; is_internal?: boolean; metadata?: Record<string, unknown> | null } | null)[] | null;
  tags?: ({ value?: string | null } | null)[] | null;
  catalog_record?: { searchable_text?: string } | null;
  variants?: FacetVariant[] | null;
};

const productFields = search.define({
  id: search.keyword().filterable().retrievable(),
  // Read by `/store/search` to scope the index; never returned to hits.
  status: search.keyword().filterable().retrievable(false),
  sales_channel_ids: search.keyword().array().filterable().retrievable(false),
  title: search.text().searchable({ weight: 3 }).sortable().retrievable(),
  description: search.text().searchable({ weight: 1 }),
  attribute_text: search.text().searchable({ weight: 1 }).retrievable(false),
  handle: search.keyword().retrievable(),
  // Returned on hits only: never filtered, sorted or faceted on.
  thumbnail: search.keyword().retrievable(),
  created_at: search.date().sortable().retrievable(),
  category: search.keyword().array().filterable().facetable().retrievable(),
  category_handles: search.keyword().array().filterable().facetable().retrievable(),
  catalog_scope: search.keyword().filterable().retrievable(),
  catalog_kind: search.keyword().filterable().retrievable(),
  is_catalog_example: search.boolean().filterable().retrievable(),
  labels: search.keyword().array().filterable().facetable().retrievable(),
  // Exact canonical identities for catalog filtering; display facets remain raw.
  filter_values: search.keyword().array().filterable().retrievable(false),
  option_values: search
    .keyword()
    .array()
    .searchable({ weight: 2 })
    .filterable()
    .facetable()
    .retrievable(),
  ...priceFields,
});

type ProductDocument = SearchTypes.InferSearchDocumentType<
  typeof productFields
>;

function toDocument(
  product: ProductRow,
  pricing: Parameters<typeof toProductPricing>[0],
  published: Map<string, Set<string>>,
  libraryNames: ReturnType<typeof libraryFacetNames>,
): ProductDocument {
  const scope = typeof product.metadata?.catalog_scope === "string" ? product.metadata.catalog_scope : null
  const publicCategories = scope ? (product.categories ?? []).filter((item) => item?.id && published.get(scope)?.has(item.id)) : []
  const category = publicCategories
    .map((productCategory) => productCategory?.name?.trim())
    .filter((name): name is string => Boolean(name));
  const labels = (product.tags ?? [])
    .map((tag) => tag?.value?.trim())
    .filter((value): value is string => Boolean(value));
  const salesChannelIds = (product.sales_channels ?? [])
    .map((salesChannel) => salesChannel?.id?.trim())
    .filter((id): id is string => Boolean(id));

  const calculatedPricing = toProductPricing(pricing);
  // These are historical example quotes, not a live promotional price list.
  // Keep the source's crossed-out RUB quote on the server with its sample data.
  const exampleOriginal = product.metadata?.catalog_original_price_rub;
  if (product.metadata?.is_catalog_example === true &&
      typeof exampleOriginal === "number" &&
      typeof calculatedPricing.min_price_rub === "number" &&
      !calculatedPricing.on_sale_rub) {
    calculatedPricing.original_price_rub = exampleOriginal;
  }

  const variations = (product.variants ?? []).map((variant) => variationFacets(variant, product.metadata, libraryNames))
  const optionValues = [...new Set(variations.flatMap((variant) => variant.display))]
  const lookup = variations.flatMap((variant) => variant.lookup)
  return {
    id: product.id,
    status: product.status ?? null,
    sales_channel_ids: salesChannelIds,
    title: product.title ?? null,
    description: product.description ?? null,
    attribute_text: product.catalog_record?.searchable_text ?? null,
    handle: product.handle ?? null,
    thumbnail: product.thumbnail ?? null,
    created_at: product.created_at ?? null,
    category,
    category_handles: publicCategories.map((item) => item?.handle).filter((handle): handle is string => Boolean(handle)),
    catalog_scope: publicCategories.length ? scope : null,
    catalog_kind: typeof product.metadata?.catalog_kind === "string" ? product.metadata.catalog_kind : typeof product.metadata?.insales_kind === "string" ? product.metadata.insales_kind : null,
    is_catalog_example: product.metadata?.is_catalog_example === true,
    labels,
    option_values: optionValues,
    filter_values: Array.from(new Set([...optionValues, ...lookup].map(canonicalCatalogToken))),
    ...calculatedPricing,
  };
}

/**
 * A row that returns no document leaves
 * the index: the helpers turn it into a delete on `consume` and on the
 * catch-up pass.
 */
const source = {
  fields: PRODUCT_GRAPH_FIELDS,
  transform: async (
    rows: ProductRow[],
    context: SearchTypes.SearchIngestionContext,
  ) => {
    const { data: [profile] } = await context.container.query.graph({
      entity: "catalog_profile", fields: ["region_id"], filters: { key: "store" },
    })
    const { data: [region] } = profile ? await context.container.query.graph({
      entity: "region", fields: ["id", "currency_code"], filters: { id: profile.region_id },
    }) : { data: [] }
    const pricing = await loadPricing(
      rows.map((row) => row.id),
      context,
      region,
    );
    const { data: categories } = await context.container.query.graph({ entity: "product_category", fields: ["id", "handle", "parent_category_id", "is_active", "is_internal", "metadata"], pagination: { take: 1000 } })
    const scopes = [...new Set(rows.map((row) => row.metadata?.catalog_scope).filter((scope): scope is string => typeof scope === "string"))]
    const published = new Map(scopes.map((scope) => [scope, publishedCategoryIds(categories, scope)]))
    const libraryCodes = [...new Set(rows.flatMap((row) => Object.values(libraryVariations(row.metadata) ?? {}).flatMap(Object.keys)))]
    const { data: definitions } = libraryCodes.length ? await context.container.query.graph({ entity: "catalog_definition", fields: ["code", "label", "aliases"], filters: { code: libraryCodes }, pagination: { take: libraryCodes.length } }) : { data: [] }
    const names = libraryFacetNames(definitions)
    return rows.map((row) => toDocument(row, pricing.get(row.id), published, names));
  },
};

/**
 * Everything a document is built from, so a change to any of it re-indexes the
 * products it touches. Only `product.deleted` removes documents: a deleted
 * variant, option, tag or category means the product has to be re-read.
 *
 * TODO: linkProductsToSalesChannelWorkflow emits nothing.
 * TODO: batchLinkProductsToCategoryWorkflow emits nothing.
 * TODO: upsertVariantPricesWorkflow emits nothing when called directly.
 */
const PRODUCT_EVENTS = [
  "product.created",
  "product.updated",
  "product.deleted",
  "product-variant.created",
  "product-variant.updated",
  "product-variant.deleted",
  "product-option.created",
  "product-option.updated",
  "product-option.deleted",
  "product-option-value.updated",
  "product-option-value.deleted",
  "product-tag.updated",
  "product-tag.deleted",
  "product-category.updated",
  "product-category.deleted",
  "sales-channel.deleted",
  ...Object.values(PriceListWorkflowEvents),
];

export default defineSearchIndex({
  name: "product",
  entity: "product",
  primary_key: "id",
  fields: productFields,
  settings: {
    typo_tolerance: { enabled: true },
  },
  events: PRODUCT_EVENTS,
  consume: graphConsume<typeof productFields, ProductRow>({
    ...source,
    resolve_ids: resolveProductIds,
    is_delete: (event) => event.name === "product.deleted",
  }),
  seed: graphSeed<typeof productFields, ProductRow>(source),
});
