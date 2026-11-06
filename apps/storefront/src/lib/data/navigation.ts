import "server-only"
import { cache } from "react"
import { sdk } from "@lib/config"

export type CatalogNode = { id: string; parent_id: string | null; label: string; href: string; visible: boolean }
export type NavigationItem = { id: string; label: string; href: string; kind: "link" | "catalog"; visible: boolean; children?: CatalogNode[] }
export type SiteNavigation = { items: NavigationItem[]; phone: string; telegram_url: string }

export const getNavigation = cache(async (): Promise<SiteNavigation | null> => {
  try {
    const { navigation } = await sdk.client.fetch<{ navigation: SiteNavigation | null }>("/store/navigation", { cache: "no-store" })
    return navigation
  } catch (error) {
    console.error("Unable to load storefront navigation", error)
    return null
  }
})
