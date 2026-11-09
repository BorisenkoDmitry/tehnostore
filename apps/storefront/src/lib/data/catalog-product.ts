import "server-only"
import { sdk } from "@lib/config"
import { cache } from "react"
import { notFound } from "next/navigation"

export type CatalogProductAttribute = {
  role?: "spec" | "color" | "variant_axis"
  key: string
  label: string
  raw_values: string[]
  values: string[]
  type: "text" | "number" | "boolean"
  units: string[]
}

export type CatalogConfiguration = {
  product_id: string
  variant_id: string
  handle: string
  color: string | null
  storage: string | null
  axes?: Record<string, string | null>
}

export type ProductDescriptionNode = { text: string } | {
  tag: string
  children: ProductDescriptionNode[]
  href?: string
}

export type CatalogProductDetails = {
  id: string
  currency_code: string
  checkout_available: boolean
  kind: string
  axes?: { code: string; label: string; role: "spec" | "color" | "variant_axis"; control: "checkbox" | "swatch" | "range"; values: string[] }[]
  configured_axes_only?: boolean
  allow_configuration_jump?: boolean
  color_swatches?: Record<string, string>
  seo?: { title?: string; description?: string }
  configurations: CatalogConfiguration[]
  variant_selection?: "list"
  description?: ProductDescriptionNode[]
  attributes: CatalogProductAttribute[]
  variants: {
    id: string
    title: string
    price: number | null
    old_price: number | null
    stock_known: boolean
    inventory_quantity: number | null
    attributes: CatalogProductAttribute[]
  }[]
}

export const retrieveCatalogProduct = cache(async (id: string): Promise<CatalogProductDetails> => {
  try {
    const { product } = await sdk.client.fetch<{ product: CatalogProductDetails }>(
      `/store/catalog-products/${encodeURIComponent(id)}`,
      { method: "GET", cache: "no-store" }
    )
    return product
  } catch (error) {
    if ((error as { status?: number }).status === 404) notFound()
    throw error
  }
})
