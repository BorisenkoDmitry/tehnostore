import "server-only"
import { getContentPages, getSiteSettings } from "./content"

export async function getPublishedLegalDocuments(countryCode: string) {
  const [settings, pages] = await Promise.all([getSiteSettings(), getContentPages()])
  const available = new Set(pages.map((page) => page.slug))
  const path = (slug?: string) => slug && available.has(slug) ? `/${countryCode}/page/${encodeURIComponent(slug)}` : undefined
  return { offer: path(settings.legal?.offer_slug), privacy: path(settings.legal?.privacy_slug), terms: path(settings.legal?.terms_slug), consent: path(settings.legal?.personal_data_slug || settings.legal?.privacy_slug) }
}
