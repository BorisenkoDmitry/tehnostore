import { Metadata } from "next"
import { notFound } from "next/navigation"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import ProductGrid from "@modules/home/components/product-grid"
import source from "@modules/home/data/source-preview.json"

export const metadata: Metadata = { title: "Каталог — TEXNO STORE", robots: { index: false, follow: true } }

export default async function CatalogPreview({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const { category } = await searchParams
  const collection = category ? source.categories.find((item) => item.id === category) : null
  if (category && !collection) notFound()
  const products = category ? source.products.filter((product) => product.category === category) : source.products
  return <section className="texno-catalog-preview texno-section"><div className="texno-container">
    <LocalizedClientLink href="/" className="texno-text-link">На главную</LocalizedClientLink>
    <div className="texno-section-heading"><h1>{collection?.title || "Каталог товаров"}</h1>{collection && <LocalizedClientLink href="/catalog" className="texno-text-link">Все товары</LocalizedClientLink>}</div>
    <ProductGrid products={products} />
  </div></section>
}
