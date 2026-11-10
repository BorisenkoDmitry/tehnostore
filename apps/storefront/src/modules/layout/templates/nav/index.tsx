import { getNavigation } from "@lib/data/navigation"
import { retrieveCart } from "@lib/data/cart"
import StorefrontShell from "@modules/layout/components/storefront-shell"
import CatalogProvider from "@modules/store/components/catalog-provider"
import { getCatalogConfig } from "@lib/data/catalog"
import { getContentPage, getSiteSettings } from "@lib/data/content"
import { headers } from "next/headers"
import { getInitialCatalog } from "@lib/data/catalog-search"

export default async function Nav({ children }: { children: React.ReactNode }) {
  const [navigation, cart, catalogConfig, settings, home] = await Promise.all([getNavigation(), retrieveCart().catch(() => null), getCatalogConfig(), getSiteSettings(), getContentPage("home")])
  const cartCount = cart?.items?.reduce((sum, item) => sum + item.quantity, 0) ?? 0
  const nodes = navigation?.items.find((item) => item.kind === "catalog")?.children ?? []
  const requestHeaders = await headers()
  const url = requestHeaders.get("x-storefront-url") || ""
  const initialCatalog = catalogConfig && /^\/[^/]+\/store\/?(?:\?|$)/.test(url)
    ? await getInitialCatalog(url.includes("?") ? url.slice(url.indexOf("?")) : "", nodes, catalogConfig).catch(() => null)
    : null
  const first = [...(home?.blocks ?? [])].filter((block) => block.enabled).sort((a, b) => a.order - b.order)[0]
  const homeHeroOverlay = first?.type === "hero" && Array.isArray(first.data.slides) && first.data.slides.length > 0
  return <CatalogProvider nodes={nodes} initialConfig={catalogConfig} initialCatalog={initialCatalog}><StorefrontShell navigation={navigation} cartCount={cartCount} brand={settings.brand} homeHeroOverlay={homeHeroOverlay}>{children}</StorefrontShell></CatalogProvider>
}
