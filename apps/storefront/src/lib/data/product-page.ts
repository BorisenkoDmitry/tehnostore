import "server-only"
import { cache } from "react"
import { listProducts } from "./products"

// Primitive arguments let metadata and page rendering share this request.
// This is request memoization, never a cache of one customer's price/session.
export const retrieveProductPage = cache(async (countryCode: string, handle: string) => {
  const { response } = await listProducts({ countryCode, queryParams: {
    handle,
    fields: "*variants.calculated_price,+variants.inventory_quantity,*variants.images,*variants.options,+metadata,+tags,*categories",
  } })
  return response.products[0]
})
