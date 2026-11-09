import { sdk } from "@lib/config"
import { listRegions } from "@lib/data/regions"
import { getSiteOrigin, listCountryCodes } from "@lib/util/site"
import { getContentPages } from "@lib/data/content"
import { getCatalogConfig } from "@lib/data/catalog"
import type { MetadataRoute } from "next"

const STATIC_PATHS = [
  "/store",
]
const PAGE_SIZE = 200

type Page<T> = { items: T[]; count: number }

async function listAll<T>(fetchPage: (offset: number) => Promise<Page<T>>) {
  const all: T[] = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { items, count } = await fetchPage(offset)
    all.push(...items)
    if (offset + PAGE_SIZE >= count || !items.length) {
      return all
    }
  }
}

type Entry = { handle?: string | null; updated_at?: string | Date | null; metadata?: Record<string, unknown> | null }

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const query = { fields: "handle,updated_at,metadata", limit: PAGE_SIZE }

  const [origin, regions, products, config, pages] = await Promise.all([
    getSiteOrigin(),
    listRegions(),
    listAll<Entry>((offset) =>
      sdk.store.product
        .list({ ...query, offset })
        .then((res) => ({ items: res.products, count: res.count }))
    ),
    getCatalogConfig(), getContentPages(),
  ])

  const toEntries = (base: string, prefix: string, items: Entry[]) =>
    items
      .filter((item) => item.handle)
      .map((item) => ({
        url: `${base}/${prefix}/${item.handle}`,
        lastModified: item.updated_at ? new Date(item.updated_at) : undefined,
      }))

  return listCountryCodes(regions).flatMap((countryCode) => {
    const base = `${origin}/${countryCode}`
    return [
      ...STATIC_PATHS.map((path) => ({ url: `${base}${path}` })),
      ...pages.filter((page) => !page.metadata.noindex).map((page) => ({ url: page.slug === "home" ? base : `${base}/page/${page.slug}`, lastModified: page.published_at ? new Date(page.published_at) : undefined })),
      ...toEntries(base, "products", products.filter((product) => product.metadata?.catalog_scope === config?.scope)),
      ...(config?.categories ?? []).map((category) => ({ url: `${base}/store?category=${encodeURIComponent(category.handle)}` })),
    ]
  })
}
