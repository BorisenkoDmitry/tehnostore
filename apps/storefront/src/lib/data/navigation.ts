import "server-only"
import { cache } from "react"
import { sdk } from "@lib/config"
import { getSiteSettings } from "./content"

export type CatalogNode = { id: string; parent_id: string | null; label: string; href: string; visible: boolean }
export type NavigationItem = { id: string; label: string; href: string; kind: "link" | "catalog"; visible: boolean; children?: CatalogNode[] }
export type SiteNavigation = { items: NavigationItem[]; phone: string; telegram_url: string }

export const getNavigation = cache(async (): Promise<SiteNavigation | null> => {
  try {
    const [{ navigation }, settings] = await Promise.all([sdk.client.fetch<{ navigation: SiteNavigation | null }>("/store/navigation", { cache: "no-store" }), getSiteSettings()])
    if (!navigation) return navigation
    const telegram = settings.social?.find((item) => item.enabled && /telegram|телеграм/i.test(item.label))
    return { ...navigation, phone: settings.contacts?.phone ?? navigation.phone, telegram_url: telegram?.url ?? navigation.telegram_url }
  } catch (error) {
    console.error("Unable to load storefront navigation", error)
    return null
  }
})
