"use client"

import type { HttpTypes } from "@medusajs/types"
import type { CatalogProductAttribute, CatalogProductDetails } from "@lib/data/catalog-product"
import { useSearchParams } from "next/navigation"
import { ColorSwatch } from "@modules/common/components/color-swatch"
import { isColorAttribute } from "@lib/util/color-swatch"
import ProductActions from "@modules/products/components/product-actions"
import ProductTabs from "@modules/products/components/product-tabs"
import ProductGallery from "./product-gallery"
import ProductConfiguration from "./product-configuration"
import PurchaseActions from "./purchase-actions"
import styles from "./product-details.module.css"
import type { ProductReview } from "@modules/products/components/product-reviews"

const formatPrice = (amount: number, currency: string) => new Intl.NumberFormat("ru-RU", {
  style: "currency", currency, maximumFractionDigits: 2,
}).format(amount)

export function AttributeValue({ attribute, swatches }: { attribute: CatalogProductAttribute; swatches?: Record<string, string> }) {
  return attribute.role === "color" || isColorAttribute(attribute.label)
    ? <span className={styles.colors}>{attribute.values.map((value) => <span className={styles.color} key={value}><ColorSwatch value={value} swatches={swatches} decorative />{value}</span>)}</span>
    : <>{attribute.values.join(", ")}</>
}

export default function ProductDetails({ product, catalog, region, purchaseRequestId, reviews }: {
  product: HttpTypes.StoreProduct
  catalog?: CatalogProductDetails
  region: HttpTypes.StoreRegion
  purchaseRequestId: string
  reviews: ProductReview[]
}) {
  const searchParams = useSearchParams()
  const requestedId = searchParams.get("v_id")
  const selected = catalog?.variants.find((variant) => variant.id === requestedId) ?? catalog?.variants[0]
  const medusaVariant = product.variants?.find((variant) => variant.id === (selected?.id ?? requestedId)) ?? product.variants?.[0]
  const images = medusaVariant?.images?.length
    ? (product.images ?? []).filter((image) => medusaVariant.images?.some((candidate) => candidate.id === image.id))
    : product.images ?? []
  const attributes = [...(selected?.attributes ?? []), ...(catalog?.attributes ?? [])]
  const unique = attributes.filter((attribute, index) => attributes.findIndex((candidate) => candidate.key === attribute.key) === index)
  const priorities = ["Состояние", "Встроенная память", "Объем встроенной памяти", "Оперативная память", "Диагональ", "Процессор", "Фотокамера", "Совместимость", "Тип аксессуара", "Гарантия"]
  const summary = [...unique].sort((a, b) => {
    const rank = (label: string) => { const index = priorities.indexOf(label); return index < 0 ? priorities.length : index }
    return rank(a.label) - rank(b.label)
  }).filter((attribute) => !isColorAttribute(attribute.label)).slice(0, 6)
  const variantColor = selected?.attributes.find((attribute) => isColorAttribute(attribute.label))
  const configuration = unique.filter((attribute) =>
    (isColorAttribute(attribute.label) && (!variantColor || attribute.key === variantColor.key)) ||
    /^(встроенная память|объем встроенной памяти)$/i.test(attribute.label)
  )
  const selectVariant = (id: string) => {
    const url = new URL(window.location.href)
    url.searchParams.set("v_id", id)
    window.history.replaceState(null, "", url)
  }

  return <>
    <div className={styles.overview}>
      <div className={styles.galleryColumn}>
        <ProductGallery key={medusaVariant?.id ?? product.id} images={images} title={product.title} />
      </div>
      <div className={styles.info} id="product-info">
        <h1 data-testid="product-title">{product.title}</h1>
        {catalog?.configurations?.length ? <ProductConfiguration product={catalog} selectedVariantId={selected?.id} /> : configuration.length > 0 && <dl className={styles.configuration}>{configuration.map((attribute) => <div key={attribute.key}>
          <dt>{attribute.label}</dt><dd><AttributeValue attribute={attribute} swatches={catalog?.color_swatches} /></dd>
        </div>)}</dl>}
        {catalog && catalog.variants.length > 1 && (catalog.variant_selection === "list" || !catalog.configurations?.every((configuration) => configuration.color)) && <fieldset className={styles.variants}>
          <legend>Выберите вариант</legend>
          {catalog.variants.map((variant) => {
            const color = variant.attributes.find((attribute) => isColorAttribute(attribute.label))?.values[0]
            return <label key={variant.id} className={styles.variant} data-selected={selected?.id === variant.id}>
              <input type="radio" name={`variant-${product.id}`} value={variant.id} checked={selected?.id === variant.id} onChange={() => selectVariant(variant.id)} />
              {color && <ColorSwatch value={color} swatches={catalog.color_swatches} decorative />}<span>{variant.title}</span>
            </label>
          })}
        </fieldset>}
        {summary.length > 0 && <section className={styles.summary} aria-labelledby="product-summary-title">
          <h2 id="product-summary-title">Основные характеристики</h2>
          <dl>{summary.map((attribute) => <div key={attribute.key}><dt>{attribute.label}</dt><dd><AttributeValue attribute={attribute} swatches={catalog?.color_swatches} /></dd></div>)}</dl>
        </section>}
      </div>
      <aside className={styles.purchase} aria-label="Цена и покупка">
        {catalog ? <div data-testid="catalog-product-actions">
          <div className={styles.priceBlock} aria-live="polite" aria-atomic="true">
            <p className={styles.price} data-testid="catalog-product-price">{selected?.price != null ? formatPrice(selected.price, catalog?.currency_code || region.currency_code) : "Цена уточняется"}</p>
            {selected?.old_price != null && <p className={styles.oldPrice}>{formatPrice(selected.old_price, catalog?.currency_code || region.currency_code)}</p>}
          </div>
          <PurchaseActions key={selected?.id} variant={selected} requestId={purchaseRequestId} />
        </div> : <ProductActions product={product} region={region} />}
      </aside>
    </div>
    <ProductTabs key={product.id} product={product} catalog={catalog} selectedVariantId={selected?.id} reviews={reviews} />
  </>
}
