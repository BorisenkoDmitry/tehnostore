"use client"

import { useTransition } from "react"
import { useParams, useRouter } from "next/navigation"
import type { CatalogProductDetails, CatalogConfiguration } from "@lib/data/catalog-product"
import { ColorSwatch } from "@modules/common/components/color-swatch"
import styles from "./product-details.module.css"

const orderValue = (value: string) => /^(\d+(?:[.,]\d+)?)\s*(тб|tb)$/i.test(value) ? Number.parseFloat(value.replace(",", ".")) * 1024 : /^(\d+(?:[.,]\d+)?)\s*(гб|gb)$/i.test(value) ? Number.parseFloat(value.replace(",", ".")) : null

export default function ProductConfiguration({ product, selectedVariantId }: { product: CatalogProductDetails; selectedVariantId?: string }) {
  const router = useRouter()
  const { countryCode } = useParams<{ countryCode: string }>()
  const [pending, startTransition] = useTransition()
  const configurations = product.configurations ?? []
  const selected = configurations.find((configuration) => configuration.product_id === product.id && configuration.variant_id === selectedVariantId)
    ?? configurations.find((configuration) => configuration.product_id === product.id)
  if (!selected) return null
  const axes = product.axes?.length || product.configured_axes_only ? product.axes ?? [] : [
    ...(configurations.some((item) => item.color) ? [{ code: "__color", label: "Цвет", role: "color" as const, control: "swatch" as const, values: [] }] : []),
    ...(configurations.some((item) => item.storage) ? [{ code: "__storage", label: "Встроенная память", role: "variant_axis" as const, control: "checkbox" as const, values: [] }] : []),
  ]
  const valueOf = (configuration: CatalogConfiguration, code: string) => code === "__color" ? configuration.color : code === "__storage" ? configuration.storage : configuration.axes?.[code] ?? null
  const choices = axes.map((axis) => ({ ...axis, values: Array.from(new Set(configurations.map((configuration) => valueOf(configuration, axis.code)).filter((value): value is string => Boolean(value)))).sort((a, b) => { const first = orderValue(a), second = orderValue(b); return first !== null && second !== null ? first - second : a.localeCompare(b, "ru", { numeric: true }) }) })).filter((axis) => axis.values.length)
  const targetFor = (code: string, value: string) => {
    const matching = configurations.filter((configuration) => valueOf(configuration, code) === value)
    const retained = (configuration: CatalogConfiguration) =>
      choices.filter((axis) => valueOf(configuration, axis.code) === valueOf(selected, axis.code)).length
    const exact = matching.find((configuration) => choices.every((axis) => axis.code === code || valueOf(configuration, axis.code) === valueOf(selected, axis.code)))
    if (exact || !product.allow_configuration_jump) return exact
    return matching.sort((a, b) => retained(b) - retained(a))[0]
  }
  const unavailable = choices.some((axis) => axis.values.some((value) => !targetFor(axis.code, value)))
  if (!choices.length) return null
  const select = (configuration: CatalogConfiguration | undefined) => {
    if (!configuration || pending || configuration.variant_id === selected.variant_id) return
    if (configuration.product_id === product.id) {
      const url = new URL(window.location.href)
      url.searchParams.set("v_id", configuration.variant_id)
      window.history.replaceState(null, "", url)
    } else {
      startTransition(() => router.push(`/${countryCode}/products/${encodeURIComponent(configuration.handle)}?v_id=${encodeURIComponent(configuration.variant_id)}`, { scroll: false }))
    }
  }

  return <div className={styles.configurationControls} aria-busy={pending} data-testid="product-configuration">
    {choices.map((axis) => {
      const color = axis.role === "color" || axis.control === "swatch"
      const current = valueOf(selected, axis.code)
      return <fieldset key={axis.code} disabled={pending} className={color ? styles.colorChoices : styles.memoryChoices}>
        <legend>{axis.label}{color && <span>{current}</span>}</legend>
        <div className={styles.choiceRow}>{axis.values.map((value) => {
          const target = targetFor(axis.code, value)
          return <label key={value} className={color ? styles.colorChoice : styles.memoryChoice} data-selected={current === value} data-unavailable={!target} title={target ? value : `${value} — нет в выбранном сочетании`}>
            <input type="radio" name={`product-${axis.code}`} value={value} aria-label={value} checked={current === value} disabled={!target} onChange={() => select(target)} />
            {color ? <><ColorSwatch value={value} swatches={product.color_swatches} decorative />{current === value && <svg className={styles.choiceCheck} viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="8" /><path d="m4.5 8 2.4 2.4 4.6-4.8" /></svg>}</> : <span>{value}</span>}
          </label>
        })}</div>
      </fieldset>
    })}
    <p className={styles.configurationStatus} role="status">{pending ? "Загружаем конфигурацию…" : unavailable ? "Недоступные сочетания отмечены серым." : configurations.length === 1 ? "Текущая конфигурация" : ""}</p>
  </div>
}
