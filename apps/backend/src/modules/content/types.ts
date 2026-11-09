export type ContentNode =
  | { type: "heading"; level: 2 | 3 | 4; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "image"; url: string; alt: string }
  | { type: "quote"; text: string; author?: string }
  | { type: "link"; text: string; href: string }

export type ContentValue = string | number | boolean | null | ContentValue[] | { [key: string]: ContentValue }
export type ContentBlock = { id: string; type: string; enabled: boolean; order: number; data: Record<string, ContentValue> }
export type ContentMetadata = { title?: string; description?: string; image?: string; noindex?: boolean; canonical?: string }
export type PageSnapshot = { slug: string; title: string; body: ContentNode[]; blocks: ContentBlock[]; metadata: ContentMetadata; revision: number }
export type SiteSettingsData = {
  brand?: { name: string; logo_url?: string; logo_alt?: string; catalog_image?: string; catalog_tagline?: string }
  contacts?: Record<string, ContentValue>
  company?: Record<string, ContentValue>
  social?: { label: string; url: string; enabled: boolean }[]
  footer?: { text?: string; columns?: { title: string; items: { label: string; href?: string; page_slug?: string; category_id?: string; enabled: boolean }[] }[] }
  legal?: { offer_slug?: string; privacy_slug?: string; terms_slug?: string; personal_data_slug?: string }
  home?: Record<string, ContentValue>
  [key: string]: ContentValue | undefined
}
