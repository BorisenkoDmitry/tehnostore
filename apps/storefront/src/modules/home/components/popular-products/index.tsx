import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { StoreIcon } from "@modules/layout/components/storefront-shell/icons"
import ProductGrid from "../product-grid"
import { sdk } from "@lib/config"
import { retrieveCatalogProduct } from "@lib/data/catalog-product"
import type { HttpTypes } from "@medusajs/types"
import { getCatalogConfig } from "@lib/data/catalog"

export type PopularData = { title: string; link_label: string; product_handles: string[] }
export default async function PopularProducts({ title, link_label, product_handles: handles }: PopularData) {
  // Keep the chosen merchandising positions, read all card data from Medusa.
  if (!handles.length) return null
  const configuration = await getCatalogConfig()
  const { products } = await sdk.client.fetch<HttpTypes.StoreProductListResponse>("/store/products", { query: { handle: handles, fields: "id,title,handle,thumbnail,metadata", limit: handles.length }, cache: "no-store" })
  const imported = handles.map((handle) => products.find((product) => product.handle === handle)).filter((product): product is HttpTypes.StoreProduct => Boolean(product && product.metadata?.catalog_scope === configuration?.scope))
  const cards = await Promise.all(imported.map(async (product) => {
    const details = await retrieveCatalogProduct(product.id)
    const cheapest = details.variants.reduce<typeof details.variants[number] | undefined>((best, variant) => variant.price !== null && (!best || best.price === null || variant.price < best.price) ? variant : best, undefined)
    return { id: product.id, title: product.title, image: product.thumbnail || "", price: cheapest?.price ?? null, oldPrice: cheapest?.old_price ?? cheapest?.price ?? 0, currency: details.currency_code.toUpperCase(), category: "", popular: true, sourceUrl: "", href: `/products/${encodeURIComponent(product.handle!)}` }
  }))
  return <section className="texno-popular texno-section" aria-labelledby="popular-heading">
    <div className="texno-container">
      <div className="texno-section-heading"><h2 id="popular-heading">{title}</h2><LocalizedClientLink href="/catalog" className="texno-text-link">{link_label} <StoreIcon name="arrow" /></LocalizedClientLink></div>
      <ProductGrid products={cards} />
    </div>
  </section>
}
