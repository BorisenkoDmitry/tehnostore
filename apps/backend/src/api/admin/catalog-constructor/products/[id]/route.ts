import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { CATALOG_ATTRIBUTES_MODULE } from "../../../../../modules/catalog-attributes"
import CatalogAttributesModuleService from "../../../../../modules/catalog-attributes/service"
import { catalogBrand, catalogKind, getCatalogProfile, type CatalogDefinitionData } from "../../../../../lib/catalog-cms"
import { basePrice, constructorAxes, constructorChoices, constructorProductRevision, constructorVariantStock, readConstructorProduct } from "../../../../../lib/catalog-constructor-product"
import { canonicalLibraryCode, detachedVariationFields, librarySourceKeys, libraryVariations } from "../../../../../lib/catalog-variation-library"
import { descriptionHtml, productDescription } from "../../../../../lib/product-description"
import { legacyVariationFacets } from "../../../../../search/helpers/variation-facets"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const [product, profile, definitions, locations] = await Promise.all([
    readConstructorProduct(req.scope, req.params.id),
    getCatalogProfile(req.scope),
    req.scope.resolve<CatalogAttributesModuleService>(CATALOG_ATTRIBUTES_MODULE).listCatalogDefinitions({}, { take: 1000, order: { position: "ASC", label: "ASC" } }) as Promise<CatalogDefinitionData[]>,
    query.graph({ entity: "stock_location", fields: ["id", "name"], pagination: { take: 100 } }),
  ])
  const metadata = product.metadata ?? {}
  const axes = constructorAxes(product, definitions)
  const sourceKeys = librarySourceKeys(metadata)
  const detached = detachedVariationFields(metadata)
  res.setHeader("Cache-Control", "no-store")
  res.json({
    id: product.id, title: product.title, handle: product.handle, status: product.status,
    visible: product.status === "published" && metadata.catalog_scope === profile.scope,
    revision: constructorProductRevision(product), categories: product.categories, images: product.images.map((image) => image.url),
    description_html: descriptionHtml(productDescription(product.catalog_record?.source_data, product.description, metadata.catalog_description_html)),
    kind: catalogKind(metadata), brand: catalogBrand(metadata), seo: metadata.catalog_seo, family_id: metadata.catalog_family_id, imported: !!metadata.insales_product_id,
    attributes: (product.catalog_record?.attributes ?? []).filter((attribute) => !sourceKeys.has(attribute.key)),
    axes: axes.map(({ code, title, id }) => ({ code, title, id })), locations: locations.data,
    variant_spec_fields: metadata.catalog_variant_spec_fields ?? [],
    variants: product.variants.map((variant) => {
      const price = basePrice(variant, profile.currency_code)
      const variantMetadata = variant.metadata ?? {}
      const old = variantMetadata.catalog_old_price_currency === profile.currency_code
        ? variantMetadata.catalog_old_price
        : profile.currency_code === "rub" ? variantMetadata.catalog_old_price_rub ?? variantMetadata.insales_old_price_rub : null
      return {
        id: variant.id, title: variant.title, sku: variant.sku, price: price ? Number(price.amount) : null,
        stock: constructorVariantStock(variant), old_price: typeof old === "number" ? old : null,
        attributes: (variant.catalog_variant?.attributes ?? []).filter((attribute) => !sourceKeys.has(attribute.key) && !detached.has(canonicalLibraryCode(attribute.key))),
        imported_choices: libraryVariations(metadata) ? [] : legacyVariationFacets(variant.metadata).display,
        choices: constructorChoices(product, variant, axes),
      }
    }),
  })
}
