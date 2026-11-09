import { Metadata } from "next"
import { notFound } from "next/navigation"

import { getRegion } from "@lib/data/regions"
import StoreTemplate from "@modules/store/templates"
import { getCatalogSeo } from "@lib/data/catalog-seo"
import { getSiteOrigin, getStoreName } from "@lib/util/site"

type Props = { params: Promise<{ countryCode: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }
export async function generateMetadata(props: Props): Promise<Metadata> {
  const [{ countryCode }, query, categories, origin] = await Promise.all([props.params, props.searchParams, getCatalogSeo(), getSiteOrigin()])
  const category = typeof query.category === "string" ? query.category : ""
  const page = Math.max(1, Number(query.page) || 1)
  const selected = categories[category]
  const storeName = await getStoreName()
  const filtered = Object.keys(query).some((key) => !["category", "page", "sort"].includes(key))
  const canonicalQuery = new URLSearchParams()
  if (category) canonicalQuery.set("category", category)
  if (page > 1 && !filtered) canonicalQuery.set("page", String(page))
  const canonical = `${origin}/${countryCode}/store${canonicalQuery.size ? `?${canonicalQuery}` : ""}`
  return {
    title: `${selected?.title || (selected ? `${selected.name} — ${storeName}` : `Каталог — ${storeName}`)}${page > 1 ? ` — Страница ${page}` : ""}`,
    description: selected?.description || undefined,
    alternates: { canonical }, robots: filtered || Boolean(category && !selected) ? { index: false, follow: true } : undefined,
  }
}

export default async function StorePage(props: Props) {
  const { countryCode } = await props.params
  const region = await getRegion(countryCode)

  if (!region) {
    notFound()
  }

  const [categories, query] = await Promise.all([getCatalogSeo(), props.searchParams])
  return <StoreTemplate categoryContent={categories} initialCategory={typeof query.category === "string" ? query.category : ""} />
}
