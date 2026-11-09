import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { updateProductVariantsWorkflow } from "@medusajs/medusa/core-flows"
import { catalogKind, getCatalogProfile } from "../lib/catalog-cms"
import { snapshotLegacyConfigurationAttributes } from "../lib/product-configurations"
import { CATALOG_ATTRIBUTES_MODULE } from "../modules/catalog-attributes"
import type CatalogAttributesModuleService from "../modules/catalog-attributes/service"
import type { CatalogAttributeInput } from "../modules/catalog-attributes/types"
import { catalogAliasFilterValues, catalogFacetValues, legacyCatalogHierarchyValues } from "../search/helpers/catalog-facet-values"
import { canonicalCatalogToken } from "../search/helpers/catalog-filter-values"
import { LEGACY_VARIATION_FACETS, snapshotLegacyVariations, type FacetVariant } from "../search/helpers/variation-facets"

type LegacyProduct = Parameters<typeof catalogFacetValues>[0]
type LegacyVariant = NonNullable<LegacyProduct["variants"]>[number]
type LegacyRow = Omit<LegacyProduct, "variants" | "catalog_record"> & { id: string; catalog_record?: { attributes?: CatalogAttributeInput[] }; variants: (LegacyVariant & FacetVariant & { id: string })[] }
const keys = (values: string[]) => JSON.stringify([...new Set(values.map(canonicalCatalogToken))].sort())

export default async function backfillVariationFacets({ container }: ExecArgs) {
  const database = new URL(process.env.DATABASE_URL!)
  const apply = process.env.CATALOG_VARIATIONS_APPLY === "1"
  if (apply && (!["postgres", "localhost", "127.0.0.1"].includes(database.hostname) || database.pathname.slice(1) !== process.env.CATALOG_VARIATIONS_DATABASE)) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Укажите точное имя локальной базы для переноса значений")
  }
  const profile = await getCatalogProfile(container)
  const definitions = await container.resolve<CatalogAttributesModuleService>(CATALOG_ATTRIBUTES_MODULE).listCatalogDefinitions({}, { take: 1000 })
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const updates: { id: string; metadata: Record<string, unknown> }[] = []
  let products = 0
  let variants = 0
  const take = 200
  for (let skip = 0; ; skip += take) {
    const { data } = await query.graph({
      entity: "product",
      fields: ["id", "metadata", "options.title", "options.values.value", "catalog_record.attributes", "variants.id",
        "variants.metadata", "variants.options.option.title", "variants.options.value", "variants.catalog_variant.attributes"],
      pagination: { skip, take, order: { id: "ASC" } },
    })
    for (const product of data as unknown as LegacyRow[]) {
      if (!product.metadata?.insales_product_id || ![profile.scope, `${profile.scope}:draft`, `${profile.scope}-draft`].includes(String(product.metadata.catalog_scope))) continue
      const axes = profile.product_types.find((type) => type.code === catalogKind(product.metadata ?? {}))?.variant_axes ?? []
      const configuration = snapshotLegacyConfigurationAttributes(product.catalog_record?.attributes, axes, definitions)
      const snapshots = snapshotLegacyVariations(product, product.variants).map((snapshot) => ({ ...snapshot, configuration }))
      if (keys(snapshots.flatMap((snapshot) => snapshot.display)) !== keys(catalogFacetValues(product)) ||
          keys(snapshots.flatMap((snapshot) => snapshot.lookup)) !== keys([...legacyCatalogHierarchyValues(product), ...catalogAliasFilterValues(product)])) {
        throw new MedusaError(MedusaError.Types.INVALID_DATA, `Не удалось перенести прежние фильтры товара ${product.id}`)
      }
      products++
      variants += product.variants.length
      for (const [index, variant] of product.variants.entries()) {
        const previous = variant.metadata?.[LEGACY_VARIATION_FACETS] as Partial<typeof snapshots[number]> | undefined
        const snapshot = snapshots[index]
        if (JSON.stringify([previous?.display, previous?.lookup, previous?.configuration]) === JSON.stringify([snapshot.display, snapshot.lookup, snapshot.configuration])) continue
        updates.push({ id: variant.id, metadata: { ...variant.metadata, [LEGACY_VARIATION_FACETS]: snapshot } })
      }
    }
    if (data.length < take) break
  }
  if (apply) {
    for (let index = 0; index < updates.length; index += 100) {
      await updateProductVariantsWorkflow(container).run({ input: { product_variants: updates.slice(index, index + 100) } })
    }
  }
  console.log(JSON.stringify({ apply, products, variants, updated: apply ? updates.length : 0, pending: apply ? 0 : updates.length }))
}
