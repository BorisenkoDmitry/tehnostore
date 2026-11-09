// Country-neutral paths shared by checkout and the legacy legal redirects.
export const STORE_DOCUMENTS = {
  offer: "/page/public-offer",
  privacy: "/page/privacy-policy",
  consent: "/page/privacy-policy",
  terms: "/page/terms-of-use",
} as const

export function getStoreDocuments(countryCode: string) {
  const country = /^[a-z]{2}$/i.test(countryCode) ? countryCode.toLowerCase() : "dk"
  return Object.fromEntries(Object.entries(STORE_DOCUMENTS).map(([key, path]) => [key, `/${country}${path}`])) as Record<keyof typeof STORE_DOCUMENTS, string>
}
