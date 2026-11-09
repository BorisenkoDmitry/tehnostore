import "server-only"
import { cache } from "react"
import { sdk } from "@lib/config"

export type ContentNode =
  | { type: "heading"; level: 2 | 3 | 4; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "image"; url: string; alt: string }
  | { type: "quote"; text: string; author?: string }
  | { type: "link"; text: string; href: string }
export type ContentBlock = { id: string; type: string; enabled: boolean; order: number; data: Record<string, unknown> }
export type ContentMetadata = { title?: string; description?: string; image?: string; noindex?: boolean; canonical?: string }
export type ContentPage = { slug: string; title: string; body: ContentNode[]; blocks: ContentBlock[]; metadata: ContentMetadata; revision: number; published_at?: string }
export type SiteSettings = {
  brand?: { name: string; logo_url?: string; logo_alt?: string; catalog_image?: string; catalog_tagline?: string }
  contacts?: { email: string; phone: string; phoneUri: string; departments: { name: string; extension: string; weekdays: string; weekend: string }[] }
  company?: { name: string; inn: string; kpp: string; ogrn: string; address: string; email: string; published_date?: string }
  social?: { label: string; url: string; enabled: boolean }[]
  footer?: Record<string, unknown>
  legal?: { offer_slug?: string; privacy_slug?: string; terms_slug?: string; personal_data_slug?: string }
  home?: Record<string, unknown>
  [key: string]: unknown
}
export type ContentReview = { id: string; kind: "shop" | "product"; product_id: string | null; author: string; rating: number; body: string; review_date: string; media: string[] }

export const getContentPage = cache(async (slug: string): Promise<ContentPage | null> => {
  try { return (await sdk.client.fetch<{ page: ContentPage }>(`/store/content/pages/${encodeURIComponent(slug)}`, { cache: "no-store" })).page }
  catch (error) {
    if (error && typeof error === "object" && "status" in error && Number(error.status) === 404) return null
    throw error
  }
})
export const getContentPages = cache(async () => (await sdk.client.fetch<{ pages: Pick<ContentPage, "slug" | "title" | "metadata" | "published_at">[] }>("/store/content/pages", { cache: "no-store" })).pages)
export const getContentPreview = cache(async (token: string): Promise<ContentPage | null> => {
  try { return (await sdk.client.fetch<{ page: ContentPage }>(`/store/content/preview/${encodeURIComponent(token)}`, { cache: "no-store" })).page }
  catch { return null }
})
export const getSiteSettings = cache(async () => {
  const { settings } = await sdk.client.fetch<{ settings: SiteSettings | null }>("/store/content/settings", { cache: "no-store" })
  return settings?.contacts ? { ...settings, contacts: { ...settings.contacts, phoneUri: (settings.contacts.phone ?? "").replace(/[^+\d]/g, "") } } : settings ?? {}
})
export async function getContentReviews(kind: "shop" | "product", productId?: string, limit = 100) {
  return (await sdk.client.fetch<{ reviews: ContentReview[]; count: number }>("/store/content/reviews", { query: { kind, ...(productId ? { product_id: productId } : {}), limit }, cache: "no-store" })).reviews
}
export function getPageBlock<T>(page: ContentPage | null, id: string): T | null {
  const block = page?.blocks.find((item) => item.id === id && item.enabled)
  return block ? block.data as T : null
}
