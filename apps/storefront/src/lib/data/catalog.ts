import "server-only"
import { cache } from "react"
import { sdk } from "@lib/config"
import type { CatalogConfig } from "@modules/store/components/catalog-provider"

export const getCatalogConfig = cache(async (): Promise<CatalogConfig | null> => {
  try {
    return await sdk.client.fetch<CatalogConfig>("/store/catalog-config", { cache: "no-store" })
  } catch {
    return null
  }
})
