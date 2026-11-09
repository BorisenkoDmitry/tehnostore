"use client"

import Image from "next/image"
import { useId, useRef, useState } from "react"
import StoreButton from "@modules/common/components/store-button"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { StoreIcon } from "@modules/layout/components/storefront-shell/icons"
import source from "../../data/source-preview.json"

export type PreviewProduct = (typeof source.products)[number]
export type GridProduct = Omit<PreviewProduct, "price"> & { price: number | null; href?: string }

const price = (value: number | null, currency = "RUB") => value === null ? "Цена уточняется" : new Intl.NumberFormat("ru-RU", {
  style: "currency", currency, maximumFractionDigits: 0,
}).format(value)

export default function ProductGrid({ products, previewNotice }: { products: GridProduct[]; previewNotice?: string }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [selected, setSelected] = useState<GridProduct | null>(null)
  const titleId = useId()
  const descriptionId = useId()
  const openProduct = (product: GridProduct) => {
    setSelected(product)
    dialog.current?.showModal()
  }

  return <>
    <ul className="texno-product-grid">
      {products.map((product) => <li key={product.id}>
        <article className="texno-product-card">
          {product.href ? <LocalizedClientLink href={product.href} className="texno-product-photo" aria-label={`Подробнее: ${product.title}`}>
            {product.image && <Image src={product.image} alt={product.title} fill loading="lazy" sizes="(max-width: 600px) 45vw, (max-width: 1023px) 45vw, 320px" />}
          </LocalizedClientLink> : <button type="button" className="texno-product-photo" onClick={() => openProduct(product)} aria-label={`Подробнее: ${product.title}`}>
            {product.image && <Image src={product.image} alt={product.title} fill loading="lazy" sizes="(max-width: 600px) 45vw, (max-width: 1023px) 45vw, 320px" />}
          </button>}
          <h3>{product.href ? <LocalizedClientLink href={product.href}>{product.title}</LocalizedClientLink> : <button type="button" onClick={() => openProduct(product)}>{product.title}</button>}</h3>
          <div className="texno-product-prices"><span>{price(product.price, product.currency)}</span>{product.price !== null && product.oldPrice > product.price && <del aria-label={`Прежняя цена ${price(product.oldPrice, product.currency)}`}>{price(product.oldPrice, product.currency)}</del>}</div>
          {product.href ? <LocalizedClientLink href={product.href} className="texno-buy-button"><span>Подробнее</span><StoreIcon name="arrow" /></LocalizedClientLink> : <button type="button" className="texno-buy-button" onClick={() => openProduct(product)} aria-label={`Купить ${product.title}`}><span>Купить</span><StoreIcon name="bag" /></button>}
        </article>
      </li>)}
    </ul>
    <dialog ref={dialog} className="texno-product-dialog" aria-labelledby={titleId} aria-describedby={descriptionId} onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close() }}>
      <button type="button" className="texno-dialog-close" onClick={() => dialog.current?.close()} aria-label="Закрыть карточку"><StoreIcon name="close" /></button>
      <div className="texno-product-dialog-scroll">{selected && <div className="texno-product-preview">
        <div className="texno-preview-photo"><Image src={selected.image} alt={selected.title} fill sizes="(max-width: 600px) 80vw, 400px" /></div>
        <div className="texno-preview-copy"><h2 id={titleId}>{selected.title}</h2>
          <div className="texno-product-prices"><span>{price(selected.price, selected.currency)}</span>{selected.price !== null && selected.oldPrice > selected.price && <del>{price(selected.oldPrice, selected.currency)}</del>}</div>
          <p id={descriptionId}>{previewNotice || "Это предварительный просмотр на данных старого сайта. Цены и наличие обновим при импорте. Оформление покупки пока не подключено."}</p>
          <div className="texno-preview-actions">
            <StoreButton className="texno-preview-cart" fill="blue" href="/cart" onClick={() => dialog.current?.close()}>Перейти в корзину</StoreButton>
            <button type="button" className="texno-text-link" onClick={() => dialog.current?.close()}>Продолжить покупки</button>
          </div>
        </div>
      </div>}</div>
    </dialog>
  </>
}
