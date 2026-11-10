import "server-only"
import { searchClient } from "@lib/search-client"
import type { CatalogNode } from "./navigation"
import type { CatalogConfig } from "@modules/store/components/catalog-provider"
import { parseCatalogState, serializeCatalogState } from "@modules/store/lib/catalog-data"
import { catalogSearchQueries, catalogSearchResponse, type CatalogSearchResult, type InitialCatalog } from "@modules/store/lib/catalog-search"

export async function getInitialCatalog(search: string, nodes: CatalogNode[], config: CatalogConfig): Promise<InitialCatalog | null> {
  const state = parseCatalogState(new URLSearchParams(search))
  const response = await searchClient.search(catalogSearchQueries(state, nodes, config))
  const mapped = catalogSearchResponse(response.results as unknown as CatalogSearchResult[], state, nodes, config)
  if (serializeCatalogState(mapped.state).toString() !== serializeCatalogState(state).toString()) return null
  return { search, result: mapped.result }
}
