import { Metadata } from "next"
import { redirect } from "next/navigation"

export const metadata: Metadata = { title: "Каталог — TEXNO STORE", robots: { index: false, follow: true } }

/** Keep saved preview URLs useful; /store is the single catalog. */
export default async function CatalogRedirect({ params, searchParams }: {
  params: Promise<{ countryCode: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { countryCode } = await params
  const values = await searchParams
  const query = new URLSearchParams()
  const legacy: Record<string, string> = {
    headphones: "naushniki-i-garnitury",
    charging: "zaryadnye-ustroystva",
    "screen-protection": "zaschita-ekrana",
  }
  for (const [key, value] of Object.entries(values)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
      query.append(key, key === "category" ? legacy[item] || item : item)
    }
  }
  redirect(`/${countryCode}/store${query.size ? `?${query}` : ""}`)
}
