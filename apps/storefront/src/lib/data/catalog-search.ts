import "server-only"
import { searchClient } from "@lib/search-client"
import { getLocaleHeader } from "@lib/util/get-locale-header"
import type { CatalogNode } from "./navigation"
import type { CatalogConfig } from "@modules/store/components/catalog-provider"
import { parseCatalogState, serializeCatalogState } from "@modules/store/lib/catalog-data"
import { catalogSearchQueries, catalogSearchResponse, type CatalogSearchResult, type InitialCatalog } from "@modules/store/lib/catalog-search"

export async function getInitialCatalog(search: string, nodes: CatalogNode[], config: CatalogConfig): Promise<InitialCatalog | null> {
  const state = parseCatalogState(new URLSearchParams(search))
  const response = await searchClient.search(catalogSearchQueries(state, nodes, config))
  // The adapter uses null-prototype maps. Send plain DTOs over the RSC boundary.
  const responses = JSON.parse(JSON.stringify(response.results)) as CatalogSearchResult[]
  const mapped = catalogSearchResponse(responses, state, nodes, config)
  if (serializeCatalogState(mapped.state).toString() !== serializeCatalogState(state).toString()) return null
  const locale = (await getLocaleHeader())["x-medusa-locale"]
  return { search, responses, fetchedAt: Date.now(), locale }
}
