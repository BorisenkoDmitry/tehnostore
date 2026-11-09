import { getNavigation } from "@lib/data/navigation"
import { getCatalogConfig } from "@lib/data/catalog"
import { getSiteSettings } from "@lib/data/content"
import FooterContent, { type FooterSettings } from "./content"

export default async function Footer() {
  const [navigation, settings, catalog] = await Promise.all([getNavigation(), getSiteSettings().catch((error) => {
    console.error("Unable to load published footer settings", error)
    return null
  }), getCatalogConfig()])
  if (!settings?.footer) return null
  return <FooterContent settings={settings as FooterSettings} navigation={navigation} categories={catalog?.categories ?? []} />
}
