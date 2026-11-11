import { getLocale } from "@lib/data/locale-actions"

export function getBrowserLocale(): string | null {
  if (typeof document === "undefined") return null
  const prefix = "_medusa_locale="
  const cookie = document.cookie.split(";").map((value) => value.trim()).find((value) => value.startsWith(prefix))
  if (!cookie) return null
  try {
    return decodeURIComponent(cookie.slice(prefix.length))
  } catch {
    return null
  }
}

export async function getLocaleHeader() {
  // Locale cookies are readable by the browser. Avoid a Server Action per API call.
  const locale = typeof document === "undefined" ? await getLocale() : getBrowserLocale()
  return {
    "x-medusa-locale": locale,
  } as const
}
