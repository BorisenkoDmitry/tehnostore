import { notFound } from "next/navigation"
import type { HttpTypes } from "@medusajs/types"
import { retrieveCatalogProduct } from "@lib/data/catalog-product"
import { getNavigation } from "@lib/data/navigation"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import ProductDetails from "@modules/products/components/product-details"
import styles from "@modules/products/components/product-details/product-details.module.css"
import { randomUUID } from "node:crypto"
import { getContentReviews } from "@lib/data/content"

type ProductTemplateProps = {
  product: HttpTypes.StoreProduct
  region: HttpTypes.StoreRegion
  countryCode: string
}

export default async function ProductTemplate({ product, region }: ProductTemplateProps) {
  if (!product?.id) return notFound()
  const [catalog, navigation, reviews] = await Promise.all([
    Boolean(product.metadata?.catalog_scope) ? retrieveCatalogProduct(product.id) : undefined,
    getNavigation(),
    getContentReviews("product", product.id),
  ])
  const nodes = navigation?.items.find((item) => item.kind === "catalog")?.children?.filter((node) => node.visible) ?? []
  const assigned = new Set(product.categories?.map((category) => category.handle))
  const paths = nodes.filter((node) => assigned.has(node.href.replace(/^\/collection\//, ""))).map((node) => {
    const path = [node]
    const seen = new Set([node.id])
    let parent = nodes.find((candidate) => candidate.id === node.parent_id)
    while (parent && !seen.has(parent.id)) {
      path.unshift(parent)
      seen.add(parent.id)
      const parentId = parent.parent_id
      parent = nodes.find((candidate) => candidate.id === parentId)
    }
    return path
  })
  const categoryPath = paths.sort((a, b) => b.length - a.length)[0] ?? []

  return <article className={`texno-container ${styles.page}`} data-testid="product-container">
    <nav aria-label="Хлебные крошки" className={styles.breadcrumbs}>
      <ol>
        <li><LocalizedClientLink href="/">Главная</LocalizedClientLink></li>
        <li><LocalizedClientLink href="/store">Каталог</LocalizedClientLink></li>
        {categoryPath.map((node) => <li key={node.id}><LocalizedClientLink href={`/store?category=${encodeURIComponent(node.id)}`}>{node.label}</LocalizedClientLink></li>)}
        <li aria-current="page">{product.title}</li>
      </ol>
    </nav>
    <ProductDetails product={product} catalog={catalog} region={region} purchaseRequestId={randomUUID()} reviews={reviews.map((review) => ({ id: review.id, productId: product.id, author: review.author, date: review.review_date, rating: review.rating as 1 | 2 | 3 | 4 | 5, text: review.body, photos: review.media.map((url) => ({ url, alt: `Фото покупателя ${review.author}` })) }))} />
  </article>
}
