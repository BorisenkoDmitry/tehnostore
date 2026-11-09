"use client"

import { useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { changeTexnoItem } from "@lib/data/texno-cart"
import { notifyCartUpdated } from "@lib/util/cart-events"
import type { CatalogProductDetails } from "@lib/data/catalog-product"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import styles from "./product-details.module.css"

export default function PurchaseActions({ variant, requestId }: { variant?: CatalogProductDetails["variants"][number]; requestId: string }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [added, setAdded] = useState(false)
  const active = useRef(false)
  const retry = useRef<{ variant: string; id: string } | null>(null)
  const router = useRouter()
  const { countryCode } = useParams<{ countryCode: string }>()
  const available = !!variant?.stock_known && (variant.inventory_quantity ?? 0) > 0 && variant.price != null
  const add = async () => {
    if (!variant || !available || active.current) return
    active.current = true
    setPending(true)
    setError("")
    const request = retry.current?.variant === variant.id ? retry.current : { variant: variant.id, id: crypto.randomUUID() }
    retry.current = request
    try {
      const result = await changeTexnoItem({ variant_id: variant.id, quantity: 1, add: true, mutation_id: request.id })
      if (result.error) setError(result.error)
      else { retry.current = null; setAdded(true); notifyCartUpdated(); router.refresh() }
    } catch {
      setError("Нет связи с магазином. Попробуйте добавить товар ещё раз.")
    } finally {
      active.current = false
      setPending(false)
    }
  }
  return <>
    <p className={styles.availability} data-testid="product-availability">{!variant?.stock_known ? "Наличие уточняется" : available ? "В наличии" : "Нет в наличии"}</p>
    <form method="post" action={`/${countryCode}/cart/add`} aria-label="Добавление выбранного товара в корзину" onSubmit={(event) => { event.preventDefault(); void add() }}>
      <input type="hidden" name="variant_id" value={variant?.id ?? ""} />
      <input type="hidden" name="quantity" value="1" />
      <input type="hidden" name="mutation_id" value={requestId} />
      <button type="submit" disabled={!available || pending} aria-busy={pending} className={`texno-primary-button ${styles.buyButton}`} data-fill="blue" data-testid="add-product-button"><span>{pending ? "Добавляем…" : added ? "Добавить ещё" : "Добавить в корзину"}</span></button>
    </form>
    {error && <p role="alert" className={styles.purchaseNote}>{error}</p>}
    <p className={styles.purchaseNote} role="status">{added ? <LocalizedClientLink href="/cart">Товар в корзине — перейти к оформлению ↗</LocalizedClientLink> : available ? "Оплата при получении после проверки товара." : "Добавление доступно только при подтверждённом наличии."}</p>
  </>
}
