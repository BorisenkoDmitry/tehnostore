import type { CatalogProductDetails } from "../data/catalog-product"
import type { HttpTypes } from "@medusajs/types"

/** Uses the same live catalog response as the price and variant picker. */
export function buildCatalogStructuredData(product: HttpTypes.StoreProduct, catalog: CatalogProductDetails, productUrl: string) {
  const offers = catalog.variants.flatMap((variant) => {
    if (!catalog.checkout_available || variant.price == null || !Number.isFinite(variant.price)) return []
    const native = product.variants?.find((row) => row.id === variant.id)
    return [{
      "@type": "Offer",
      url: `${productUrl}?v_id=${encodeURIComponent(variant.id)}`,
      sku: native?.sku || undefined,
      price: variant.price.toFixed(2),
      priceCurrency: catalog.currency_code.toUpperCase(),
      availability: variant.stock_known && (variant.inventory_quantity ?? 0) > 0
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
    }]
  })
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    description: catalog.seo?.description || product.description || product.title,
    image: product.images?.length ? product.images.map((image) => image.url) : product.thumbnail ? [product.thumbnail] : [],
    url: productUrl,
    additionalProperty: catalog.attributes.map((attribute) => ({
      "@type": "PropertyValue", name: attribute.label, value: attribute.values.join(", "),
    })),
    offers: offers.length ? offers : undefined,
  }
}
