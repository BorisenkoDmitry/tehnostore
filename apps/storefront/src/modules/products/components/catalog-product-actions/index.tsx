"use client"

import type { CatalogProductDetails } from "@lib/data/catalog-product"
import { Button } from "@modules/common/components/ui"
import { ColorSwatch } from "@modules/common/components/color-swatch"
import { isColorAttribute } from "@lib/util/color-swatch"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"

const formatPrice = (amount: number) => new Intl.NumberFormat("ru-RU", {
  style: "currency", currency: "RUB", maximumFractionDigits: 2,
}).format(amount)

export default function CatalogProductActions({ product }: { product: CatalogProductDetails }) {
  const router = useRouter()
  const pathname = usePathname()
  const [selectedId, setSelectedId] = useState(product.variants[0]?.id ?? "")
  useEffect(() => {
    const requestedId = new URLSearchParams(window.location.search).get("v_id")
    if (product.variants.some((variant) => variant.id === requestedId)) setSelectedId(requestedId!)
  }, [product.variants])
  const selected = product.variants.find((variant) => variant.id === selectedId)
  const selectVariant = (id: string) => {
    setSelectedId(id)
    const params = new URLSearchParams(window.location.search)
    params.set("v_id", id)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }
  return (
    <div className="flex flex-col gap-y-4" data-testid="catalog-product-actions">
      {product.variants.length > 1 && (
        <fieldset className="flex flex-col gap-y-2">
          <legend className="text-small-regular mb-2">Вариант</legend>
          {product.variants.map((variant) => {
            const color = variant.attributes.find((attribute) => isColorAttribute(attribute.label))?.values[0]
            return <label key={variant.id} className="flex items-center gap-x-2 text-small-regular min-h-11 cursor-pointer">
              <input type="radio" name="catalog-variant" value={variant.id} checked={selectedId === variant.id} onChange={() => selectVariant(variant.id)} />
              {color && <ColorSwatch value={color} swatches={product.color_swatches} decorative />}
              <span>{variant.title}</span>
            </label>
          })}
        </fieldset>
      )}
      <div aria-live="polite">
        <p className="text-2xl font-medium text-ui-fg-base" data-testid="catalog-product-price">
          {selected?.price != null ? formatPrice(selected.price) : "Цена уточняется"}
        </p>
        {selected?.old_price != null && <p className="text-small-regular text-ui-fg-subtle line-through">{formatPrice(selected.old_price)}</p>}
        <p className="text-small-regular text-ui-fg-subtle mt-2" data-testid="product-availability">
          {!product.checkout_available || !selected?.stock_known || selected.inventory_quantity === null
            ? "Наличие уточняется"
            : selected.inventory_quantity > 0 ? "В наличии" : "Нет в наличии"}
        </p>
      </div>
      <Button disabled variant="primary" className="w-full h-10" data-testid="add-product-button">Добавить в корзину</Button>
      <p className="text-small-regular text-ui-fg-subtle">Оформление заказа в рублях пока недоступно.</p>
    </div>
  )
}
