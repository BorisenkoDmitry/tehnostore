import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { StoreIcon } from "@modules/layout/components/storefront-shell/icons"
import ProductGrid from "../product-grid"
import source from "../../data/source-preview.json"

export default function PopularProducts() {
  return <section className="texno-popular texno-section" aria-labelledby="popular-heading">
    <div className="texno-container">
      <div className="texno-section-heading"><h2 id="popular-heading">Популярные товары</h2><LocalizedClientLink href="/catalog" className="texno-text-link">Смотреть все <StoreIcon name="arrow" /></LocalizedClientLink></div>
      <ProductGrid products={source.products.filter((product) => product.popular)} />
    </div>
  </section>
}
