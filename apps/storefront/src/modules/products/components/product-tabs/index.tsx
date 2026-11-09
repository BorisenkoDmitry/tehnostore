"use client"

import { useRef, useState, type KeyboardEvent } from "react"
import type { HttpTypes } from "@medusajs/types"
import type { CatalogProductAttribute, CatalogProductDetails } from "@lib/data/catalog-product"
import { ColorSwatch } from "@modules/common/components/color-swatch"
import { isColorAttribute } from "@lib/util/color-swatch"
import ProductReviews, { type ProductReview } from "@modules/products/components/product-reviews"
import RichText from "@modules/common/components/rich-text"
import styles from "../product-details/product-details.module.css"

const tabs = ["Характеристики", "Описание", "Оценки"]

function AttributeList({ attributes, swatches }: { attributes: CatalogProductAttribute[]; swatches?: Record<string, string> }) {
  return <dl className={styles.specifications}>{attributes.map((attribute) => <div key={attribute.key}>
    <dt>{attribute.label}</dt>
    <dd>{attribute.role === "color" || isColorAttribute(attribute.label)
      ? <span className={styles.colors}>{attribute.values.map((value) => <span key={value} className={styles.color}><ColorSwatch value={value} swatches={swatches} decorative />{value}</span>)}</span>
      : attribute.values.join(", ")}</dd>
  </div>)}</dl>
}

export default function ProductTabs({ product, catalog, selectedVariantId, reviews }: {
  product: HttpTypes.StoreProduct
  catalog?: CatalogProductDetails
  selectedVariantId?: string
  reviews: ProductReview[]
}) {
  const [active, setActive] = useState(0)
  const controls = useRef<(HTMLButtonElement | null)[]>([])
  const onKeyDown = (event: KeyboardEvent) => {
    const next = event.key === "ArrowRight" ? (active + 1) % tabs.length
      : event.key === "ArrowLeft" ? (active + tabs.length - 1) % tabs.length
      : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : undefined
    if (next !== undefined) { event.preventDefault(); setActive(next); controls.current[next]?.focus() }
  }
  const selected = catalog?.variants.find((variant) => variant.id === selectedVariantId) ?? catalog?.variants[0]
  const productAttributes = catalog?.attributes.filter((attribute) => !selected?.attributes.some((candidate) => candidate.key === attribute.key)) ?? []

  return <section className={styles.details} aria-label="Подробная информация о товаре">
    <div className={styles.tabList} role="tablist" aria-label="О товаре" onKeyDown={onKeyDown}>
      {tabs.map((label, index) => <button key={label} type="button" role="tab" id={`product-tab-${index}`} aria-selected={active === index} aria-controls={`product-panel-${index}`} tabIndex={active === index ? 0 : -1} ref={(element) => { controls.current[index] = element }} onClick={() => setActive(index)}>{label}</button>)}
    </div>
    <div role="tabpanel" id="product-panel-0" aria-labelledby="product-tab-0" hidden={active !== 0} tabIndex={0} className={styles.tabPanel}>
      <h2>Характеристики</h2>
      <div data-testid="catalog-product-specifications">
        {selected && selected.attributes.length > 0 && <section className={styles.variantSpecifications}><h3>{catalog!.variants.length > 1 ? `Выбранный вариант: ${selected.title}` : "Конфигурация"}</h3><AttributeList attributes={selected.attributes} swatches={catalog?.color_swatches} /></section>}
        <AttributeList attributes={productAttributes} swatches={catalog?.color_swatches} />
        {!productAttributes.length && !selected?.attributes.length && <p className={styles.emptyNote}>Характеристики пока не указаны.</p>}
      </div>
    </div>
    <div role="tabpanel" id="product-panel-1" aria-labelledby="product-tab-1" hidden={active !== 1} tabIndex={0} className={styles.tabPanel}>
      <h2>Описание</h2>
      <div className={styles.description} data-testid="product-description">{catalog?.description?.length
        ? <RichText nodes={catalog.description} />
        : product.description?.split(/\n+/).filter((paragraph) => paragraph.trim()).map((paragraph, index) => <p key={index}>{paragraph}</p>) ?? <p>Описание пока не добавлено.</p>}</div>
    </div>
    <div role="tabpanel" id="product-panel-2" aria-labelledby="product-tab-2" hidden={active !== 2} tabIndex={0} className={styles.tabPanel}>
      <ProductReviews productId={product.id} reviews={reviews} />
    </div>
  </section>
}
